// Vector search using Voy (WASM-based k-d tree)
import { Voy } from 'voy-search/voy_search.js';

// In-memory data store: { docId -> [{ id, chunk_idx, content, embedding }] }
const store = new Map();

// Metadata map: { chunkId -> { chunk_idx, content, doc_id } }
// This is needed because Voy.search() doesn't return the metadata we pass during indexing
const metadataMap = new Map();

// Voy index instance
let voyIndex = null;

// Total document count for ID generation
let totalDocs = 0;

const initVoyIndex = () => {
  console.log('[vectordb] Initializing Voy index... store size:', store.size);

  // Collect all chunks from store
  const embeddings = [];
  for (const [docId, chunks] of store) {
    console.log(`[vectordb] Processing doc "${docId}" with ${chunks.length} chunks`);
    for (const chunk of chunks) {
      const embeddingArray = Array.isArray(chunk.embedding) ? chunk.embedding : Array.from(chunk.embedding);
      embeddings.push({
        id: String(chunk.id),
        title: chunk.content.substring(0, 100),
        url: '',
        metadata: {
          doc_id: docId,
          chunk_idx: chunk.chunk_idx,
          content: chunk.content
        },
        embeddings: embeddingArray
      });
    }
  }

  console.log('[vectordb] Total embeddings collected:', embeddings.length);

  if (embeddings.length === 0) {
    console.log('[vectordb] No embeddings to index');
    voyIndex = null;
    return;
  }

  try {
    const voy = new Voy();
    voy.index(embeddings);
    voyIndex = voy;
    console.log('[vectordb] Voy index created with', embeddings.length, 'embeddings');
  } catch (err) {
    console.error('[vectordb] Failed to create Voy index:', err.message, err.stack);
    voyIndex = null;
  }
};

export const clearDoc = async (docId) => {
  console.log('[vectordb] clearDoc called for:', docId);
  const chunks = store.get(docId);
  if (chunks) {
    for (const chunk of chunks) {
      metadataMap.delete(chunk.id);
    }
  }
  store.delete(docId);
  voyIndex = null; // Reset index so it's rebuilt on next search
  console.log('[vectordb] Cleared doc:', docId);
};

export const insertChunk = async (docId, chunkIdx, content, embedding) => {
  console.log('[vectordb] insertChunk called for doc:', docId, 'chunk:', chunkIdx);

  if (!store.has(docId)) {
    store.set(docId, []);
  }

  const chunks = store.get(docId);
  const chunkId = ++totalDocs;

  const embeddingArray = Array.isArray(embedding) ? embedding : Array.from(embedding);

  chunks.push({
    id: chunkId,
    chunk_idx: chunkIdx,
    content,
    embedding: embeddingArray
  });

  // Store metadata separately for search results
  metadataMap.set(chunkId, {
    chunk_idx: chunkIdx,
    content,
    doc_id: docId
  });

  voyIndex = null; // Reset index so it's rebuilt on next search

  console.log('[vectordb] Inserted chunk to store, ID:', chunkId);
  return chunkId;
};

export const searchSimilar = async (queryEmbedding, k = 5) => {
  console.log('[vectordb] searchSimilar called, k:', k);
  console.log('[vectordb] Store size:', store.size);

  const queryVec = Array.isArray(queryEmbedding) ? queryEmbedding : Array.from(queryEmbedding);
  console.log('[vectordb] Query embedding length:', queryVec.length);

  // Rebuild index if needed
  if (!voyIndex) {
    console.log('[vectordb] Index is null, rebuilding...');
    initVoyIndex();
  }

  if (!voyIndex) {
    console.log('[vectordb] No index available after init, returning empty results');
    return [];
  }

  try {
    console.log('[vectordb] Executing Voy search...');
    const searchResults = voyIndex.search(queryVec, k);
    console.log('[vectordb] Search response received, neighbors count:', searchResults?.neighbors?.length);

    if (!searchResults || !searchResults.neighbors || searchResults.neighbors.length === 0) {
      console.log('[vectordb] No search results');
      return [];
    }

    // Log first neighbor structure to debug
    console.log('[vectordb] First neighbor structure:', JSON.stringify(searchResults.neighbors[0], null, 2).substring(0, 200));

    const results = searchResults.neighbors.map(neighbor => {
      // Voy returns { id, title, url, distance }
      // Metadata is stored separately in metadataMap
      const chunkId = parseInt(neighbor.id);
      const metadata = metadataMap.get(chunkId);

      if (!metadata) {
        console.warn('[vectordb] Metadata not found for chunk ID:', chunkId);
        return null;
      }

      return {
        id: chunkId,
        chunk_idx: metadata.chunk_idx,
        content: metadata.content,
        doc_id: metadata.doc_id,
        distance: neighbor.distance
      };
    }).filter(r => r !== null);

    console.log('[vectordb] Search returned', results.length, 'results');
    return results;
  } catch (err) {
    console.error('[vectordb] Error searching:', err.message, err.stack);
    return [];
  }
};

export { voyIndex };

