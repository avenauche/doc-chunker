import { LiteParse } from '@llamaindex/liteparse';

// ── helpers ──────────────────────────────────────────────────────────────────

const liteparse = new LiteParse();
const toUtf8 = (buffer) => buffer.toString('utf-8');

// LiteParse-supported document formats
const LITEPARSE_EXTS = new Set([
  'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'xlsm',
  'csv', 'tsv', 'png', 'jpg', 'jpeg', 'gif', 'webp'
]);

const parseLiteparse = async (buffer) => {
  try {
    const result = await liteparse.parse(new Uint8Array(buffer));
    return { content: result.text, type: 'text', meta: {} };
  } catch (err) {
    console.error('[parsers] LiteParse error:', err.message);
    throw err;
  }
};

const parseHTML = (buffer) => ({
  content: toUtf8(buffer),
  type: 'html',
  meta: {},
});

const parseMarkdown = (buffer) => ({
  content: toUtf8(buffer),
  type: 'markdown',
  meta: {},
});

const parseJSON = (buffer) => {
  const text = toUtf8(buffer);
  const parsed = JSON.parse(text);
  return { content: text, parsedContent: parsed, type: 'json', meta: {} };
};

const parseText = (buffer) => ({
  content: toUtf8(buffer),
  type: 'text',
  meta: {},
});

// ── main export ───────────────────────────────────────────────────────────────

export const parseDocument = async (buffer, mimetype, originalname) => {
  const ext = (originalname.split('.').pop() || '').toLowerCase();

  // Try LiteParse for all document formats (PDF, DOCX, CSV, XLS, etc.)
  if (LITEPARSE_EXTS.has(ext)) return parseLiteparse(buffer);

  // Plain text formats - keep raw buffer read for simple formats
  if (ext === 'html' || ext === 'htm' || mimetype === 'text/html') return parseHTML(buffer);
  if (ext === 'md' || ext === 'markdown') return parseMarkdown(buffer);
  if (ext === 'json' || mimetype === 'application/json') return parseJSON(buffer);

  // Fallback to plain text
  return parseText(buffer);
};
