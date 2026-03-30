// semantic-chunking is ESM-only; load once via dynamic import
let _chunkit = null;
const getChunkit = async () => {
  if (!_chunkit) {
    const mod = await import('semantic-chunking');
    _chunkit = mod.chunkit;
  }
  return _chunkit;
};

// ── semantic chunking (only strategy) ──────────────────────────────────────

const chunkSemantic = async (content, cfg) => {
  const chunkit = await getChunkit();
  const results = await chunkit(
    [{ document_name: 'doc', document_text: content }],
    {
      logging:                          false,
      maxTokenSize:                     Math.max(1, parseInt(cfg.chunkSize, 10) || 500),
      similarityThreshold:              parseFloat(cfg.similarityThreshold)      || 0.5,
      dynamicThresholdLowerBound:       parseFloat(cfg.dynamicThresholdLowerBound) || 0.4,
      dynamicThresholdUpperBound:       parseFloat(cfg.dynamicThresholdUpperBound) || 0.8,
      numSimilaritySentencesLookahead:  Math.max(1, parseInt(cfg.numSimilaritySentencesLookahead, 10) || 3),
      combineChunks:                    cfg.combineChunks !== 'false',
      combineChunksSimilarityThreshold: parseFloat(cfg.combineChunksSimilarityThreshold) || 0.5,
      returnEmbedding:                  false,
      returnTokenLength:                true,
    }
  );

  if (!Array.isArray(results)) {
    throw new Error('semantic-chunking returned invalid results format');
  }

  return results.map((r) => ({
    content:  r.text || '',
    metadata: { tokens: r.token_length || 0 },
  }));
};

// ── filter meaningless tiny chunks ────────────────────────────────────────────

const MIN_CHUNK_LENGTH = 20;

const filterSmallChunks = (chunks) => {
  const filtered = [];

  for (const chunk of chunks) {
    if (chunk.content.trim().length < MIN_CHUNK_LENGTH) {
      // Merge tiny chunk with previous chunk
      if (filtered.length > 0) {
        filtered[filtered.length - 1].content += ' ' + chunk.content;
      }
    } else {
      filtered.push(chunk);
    }
  }

  return filtered;
};

// ── main export ───────────────────────────────────────────────────────────────

export const chunkDocument = async (parsed, config) => {
  const { content } = parsed;
  const cfg = {
    ...config,
    chunkSize: Math.max(1, parseInt(config.chunkSize, 10) || 1000),
  };

  // Use semantic chunking as the only strategy
  const chunks = await chunkSemantic(content, cfg);

  // Filter out tiny meaningless chunks (< 20 chars)
  return filterSmallChunks(chunks);
};
