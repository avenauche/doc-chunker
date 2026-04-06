# Doc Chunker

A document chunking service that uses semantic AI-powered splitting to break documents into meaningful chunks, embed them into a vector database, and expose them via a search API.

## Features

- **Semantic Chunking**: AI-powered document splitting using similarity thresholds — no arbitrary character splits
- **Universal Document Parsing**: Supports PDF, DOCX, PPTX, XLSX, CSV, HTML, Markdown, JSON, plain text, and images
- **Vector Search**: In-memory vector search powered by [Voy](https://github.com/tantaraio/voy) (WASM k-d tree)
- **Client-side Embeddings**: Uses `@xenova/transformers` with `all-MiniLM-L6-v2` (384-dimensional vectors)
- **Index Export API**: Download or stream the Voy index for use in external applications

## Getting Started

### Docker (recommended)

```bash
npm run docker:up
```

The app will be available at `http://localhost:3000`.

### Local

```bash
npm install --legacy-peer-deps
npm start
```

## API Endpoints

### `POST /chunk/stream`
Parses and semantically chunks an uploaded document. Streams results as NDJSON.

**Form fields:**
| Field | Default | Description |
|-------|---------|-------------|
| `document` | — | File to chunk (required) |
| `chunkSize` | `500` | Target chunk size in tokens (500–1000) |
| `outputFormat` | `text` | Output format: `text`, `markdown`, `json` |
| `similarityThreshold` | `0.5` | Sentence similarity threshold for splitting |
| `dynamicThresholdLowerBound` | `0.4` | Lower bound for dynamic threshold |
| `dynamicThresholdUpperBound` | `0.8` | Upper bound for dynamic threshold |
| `numSimilaritySentencesLookahead` | `3` | Sentences to look ahead when comparing similarity |
| `combineChunks` | `true` | Whether to merge small adjacent chunks |
| `combineChunksSimilarityThreshold` | `0.5` | Similarity threshold for combining chunks |

### `POST /embed`
Embeds all chunked documents into the Voy vector index.

### `POST /search`
Searches the vector index for chunks similar to a query.

**Body (JSON):**
```json
{ "query": "your search text", "topK": 5 }
```

### `GET /download-index`
Downloads the serialized Voy index as a binary file.

### `GET /api/index`
Returns the serialized Voy index as a base64-encoded JSON string for use in external apps.

**Response:**
```json
{ "index": "<base64 string>" }
```

CORS is enabled for all origins on this endpoint.

**Deserializing in a client app:**
```javascript
const res = await fetch('http://localhost:3000/api/index');
const { index } = await res.json();
const bytes = Uint8Array.from(atob(index), c => c.charCodeAt(0));
const voy = Voy.deserialize(bytes);
```

### `GET /health`
Returns `{ "status": "ok" }`.

## Supported File Types

`pdf`, `docx`, `doc`, `pptx`, `ppt`, `xlsx`, `xls`, `xlsm`, `csv`, `tsv`, `html`, `htm`, `txt`, `md`, `markdown`, `json`, `png`, `jpg`, `jpeg`, `gif`, `webp`

Max file size: **50 MB**

## Tech Stack

- [Express.js](https://expressjs.com/) — web framework
- [LiteParse](https://github.com/run-llama/liteparse) — universal document parser
- [semantic-chunking](https://github.com/jparkerweb/semantic-chunking) — AI-powered chunking
- [@xenova/transformers](https://github.com/xenova/transformers.js) — client-side embeddings
- [Voy](https://github.com/tantaraio/voy) — WASM vector search

## Wiki
-[wiki](https://deepwiki.com/avenauche/doc-chunker)
