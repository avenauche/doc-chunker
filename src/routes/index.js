import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { parseDocument } from '../parsers/index.js';
import { chunkDocument } from '../chunkers/index.js';
import { formatChunks, formatChunkForStream } from '../formatters/index.js';
import { embed } from '../embedder.js';
import { clearDoc, insertChunk, searchSimilar, voyIndex } from '../vectordb.js';

const router = express.Router();

// ── multer config ─────────────────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'html', 'htm', 'txt', 'md', 'markdown', 'json', 'png', 'jpg', 'jpeg', 'gif', 'webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (ALLOWED_EXTS.has(ext)) return cb(null, true);
    cb(new Error(`Unsupported file type ".${ext}". Allowed: ${[...ALLOWED_EXTS].join(', ')}`));
  },
});

// ── helpers ───────────────────────────────────────────────────────────────────

const extractConfig = (body) => ({
  chunkSize:                        body.chunkSize     || '500',
  outputFormat:                     body.outputFormat  || 'text',
  // semantic chunking params
  similarityThreshold:              body.similarityThreshold              || '0.5',
  dynamicThresholdLowerBound:       body.dynamicThresholdLowerBound       || '0.4',
  dynamicThresholdUpperBound:       body.dynamicThresholdUpperBound       || '0.8',
  numSimilaritySentencesLookahead:  body.numSimilaritySentencesLookahead  || '3',
  combineChunks:                    body.combineChunks                    ?? 'true',
  combineChunksSimilarityThreshold: body.combineChunksSimilarityThreshold || '0.5',
});

const EXT_MAP  = { markdown: 'md', json: 'json', text: 'txt' };
const MIME_MAP = { json: 'application/json', markdown: 'text/markdown', text: 'text/plain' };

// ── routes ────────────────────────────────────────────────────────────────────

router.get('/', (_req, res) => res.render('index', { title: 'Doc Chunker' }));

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Stream chunks as NDJSON (newline-delimited JSON)
router.post('/chunk/stream', upload.single('document'), async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control',    'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

  const send = (obj) => res.write(JSON.stringify(obj) + '\n');

  try {
    if (!req.file) {
      send({ type: 'error', message: 'No file uploaded.' });
      return res.end();
    }

    const config = extractConfig(req.body);

    send({ type: 'status', message: 'Parsing document…', stage: 1 });
    const parsed = await parseDocument(req.file.buffer, req.file.mimetype, req.file.originalname);

    send({ type: 'status', message: 'Chunking document…', stage: 2 });
    const chunks = await chunkDocument(parsed, config);

    send({ type: 'meta', total: chunks.length, outputFormat: config.outputFormat, filename: req.file.originalname });

    for (let i = 0; i < chunks.length; i++) {
      const formatted = formatChunkForStream(chunks[i], i, config.outputFormat);
      send({
        type:       'chunk',
        index:      i + 1,
        total:      chunks.length,
        content:    formatted,
        rawContent: chunks[i].content,
        metadata:   chunks[i].metadata,
        length:     chunks[i].content.length,
      });
    }

    send({ type: 'done', total: chunks.length });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

// Download all chunks as a file
router.post('/chunk/download', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const config  = extractConfig(req.body);
    const parsed  = await parseDocument(req.file.buffer, req.file.mimetype, req.file.originalname);
    const chunks  = await chunkDocument(parsed, config);
    const body    = formatChunks(chunks, config.outputFormat);

    const ext      = EXT_MAP[config.outputFormat]  || 'txt';
    const mime     = MIME_MAP[config.outputFormat] || 'text/plain';
    const basename = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader('Content-Disposition', `attachment; filename="${basename}_chunks.${ext}"`);
    res.setHeader('Content-Type', mime);
    res.send(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Generate embeddings and store in vector DB ────────────────────────────────
router.post('/embed', async (req, res) => {
  console.log('[/embed] Request received');

  try {
    const { docId, chunks } = req.body;
    console.log('[/embed] Parsed body:', { docId, chunkCount: chunks ? chunks.length : 'NO CHUNKS' });

    if (!docId || !Array.isArray(chunks)) {
      console.log('[/embed] Invalid input');
      return res.status(400).json({ error: 'Missing or invalid docId, chunks' });
    }

    console.log(`[/embed] Starting embedding for ${chunks.length} chunks`);

    // Clear existing embeddings for this doc
    try {
      await clearDoc(docId);
    } catch (err) {
      console.error('[/embed] Warning: failed to clear old doc:', err.message);
    }
    console.log('[/embed] Cleared old data');

    const total = chunks.length;
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');

    // Stream progress - simple and reliable
    const send = (msg) => {
      console.log('[/embed] Sending:', JSON.stringify(msg).substring(0, 100));
      const data = JSON.stringify(msg) + '\n';
      try {
        res.write(data, (err) => {
          if (err) {
            console.error('[/embed] Write error:', err.message);
          }
        });
      } catch (err) {
        console.error('[/embed] Failed to write response:', err.message);
      }
    };

    send({ type: 'progress', message: 'Starting...', done: 0, total });
    console.log('[/embed] Sent initial progress');

    // Generate embeddings and store
    let successCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`[/embed] Embedding chunk ${i + 1}/${chunks.length}...`);
        const embedding = await embed(chunks[i].content);
        console.log(`[/embed] Embedding created`);

        await insertChunk(docId, chunks[i].index, chunks[i].content, embedding);
        console.log(`[/embed] Inserted chunk ${i + 1}`);

        successCount++;
        send({ type: 'progress', done: successCount, total });
      } catch (err) {
        console.error(`[/embed] Error in loop:`, err.message);
        send({ type: 'error', error: err.message });
      }
    }

    console.log('[/embed] Embedding complete, sending done message');
    send({ type: 'done', total: successCount });
    res.end();
    console.log('[/embed] Response ended');
  } catch (err) {
    console.error('[/embed] Outer error:', err.message, err.stack);
    try {
      res.status(500).json({ error: err.message });
    } catch (e) {
      console.error('[/embed] Failed to send error response:', e.message);
      res.end();
    }
  }
});

// ── Search embeddings ─────────────────────────────────────────────────────────
router.post('/search', async (req, res) => {
  try {
    const { query, k } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const topK = Math.min(k || 15, 50);

    // Embed the query
    const queryEmbedding = await embed(query);

    // Search in vector DB
    const results = await searchSimilar(queryEmbedding, topK);

    // Format results
    const formatted = results.map(r => ({
      index: r.chunk_idx,
      content: r.content,
      distance: r.distance
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Download serialized Voy index as file ───────────────────────────────────────
router.get('/download-index', (_req, res) => {
  try {
    if (!voyIndex) {
      return res.status(404).json({ error: 'No index available' });
    }

    const serialized = voyIndex.serialize();
    const filename = `voy_index_${new Date().toISOString().split('T')[0]}.json`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(serialized));
  } catch (err) {
    console.error('Download index error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Stream index JSON for 3rd party apps ────────────────────────────────────
router.get('/api/index', cors({ origin: '*' }), (_req, res) => {
  try {
    if (!voyIndex) {
      return res.status(404).json({ error: 'No index available' });
    }

    const serialized = voyIndex.serialize();
    const base64 = Buffer.from(serialized).toString('base64');
    res.setHeader('Content-Type', 'application/json');
    res.json({ index: base64 });
  } catch (err) {
    console.error('Index API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── error handler for multer ──────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  res.status(status).json({ error: err.message });
});

export default router;
