// ── per-chunk formatters ──────────────────────────────────────────────────────

const metaMarkdown = (meta) =>
  Object.entries(meta || {})
    .filter(([, v]) => v != null && v !== '' && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
    .map(([k, v]) => `> **${k}:** ${v}`)
    .join('\n');

const metaText = (meta) => {
  const parts = Object.entries(meta || {})
    .filter(([, v]) => v != null && v !== '' && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
    .map(([k, v]) => `[${k}: ${v}]`);
  return parts.length ? ' ' + parts.join(' ') : '';
};

const fmtMarkdown = (chunk, i) => {
  const header = metaMarkdown(chunk.metadata);
  return `## Chunk ${i + 1}\n\n${header ? header + '\n\n' : ''}${chunk.content}\n\n---`;
};

const fmtText = (chunk, i) =>
  `=== Chunk ${i + 1}${metaText(chunk.metadata)} ===\n${chunk.content}`;

const fmtJsonItem = (chunk, i) => ({
  index:    i + 1,
  content:  chunk.content,
  metadata: chunk.metadata || {},
  length:   chunk.content.length,
});

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Format a single chunk for streaming (returns a string).
 */
export const formatChunkForStream = (chunk, index, outputFormat) => {
  if (outputFormat === 'markdown') return fmtMarkdown(chunk, index);
  if (outputFormat === 'json')     return JSON.stringify(fmtJsonItem(chunk, index), null, 2);
  return fmtText(chunk, index);
};

/**
 * Format all chunks into a single download string.
 */
export const formatChunks = (chunks, outputFormat) => {
  if (outputFormat === 'markdown') return chunks.map(fmtMarkdown).join('\n\n');
  if (outputFormat === 'json')     return JSON.stringify(chunks.map(fmtJsonItem), null, 2);
  return chunks.map(fmtText).join('\n\n');
};
