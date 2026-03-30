let pipeline;
let ready = false;

const init = async () => {
  if (ready) return;

  try {
    const { pipeline: transformersPipeline } = await import('@xenova/transformers');
    pipeline = await transformersPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    ready = true;
    console.log('✓ Embedding model initialized');
  } catch (err) {
    console.error('Failed to initialize embedding model:', err);
    throw err;
  }
};

export const embed = async (text) => {
  if (!ready) await init();

  try {
    // Truncate text to prevent ONNX memory errors (model max ~512 tokens ≈ 2048 chars)
    const maxChars = 2000;
    const truncatedText = text.length > maxChars ? text.substring(0, maxChars) : text;

    console.log(`[embedder] Embedding text length: ${truncatedText.length} chars`);

    // Use pooling to get a single vector per text (required for search)
    const result = await pipeline(truncatedText, {
      pooling: 'mean'
    });

    // Extract the embedding vector
    let embeddings;
    if (result.data) {
      embeddings = result.data;
    } else if (result.ort_tensor && result.ort_tensor.data) {
      embeddings = result.ort_tensor.data;
    } else if (Array.isArray(result)) {
      embeddings = result[0]?.data || result;
    } else {
      embeddings = result;
    }

    // Convert to Array for JSON serialization
    const arr = Array.isArray(embeddings) ? embeddings : Array.from(embeddings);
    console.log(`[embedder] Embedding dimensions: ${arr.length}`);
    return arr;
  } catch (err) {
    console.error('Embedding error:', err.message);
    throw err;
  }
};
