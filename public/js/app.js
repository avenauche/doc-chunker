/* Doc Chunker — frontend (vanilla ES2020, no deps) */

// ── DOM refs ──────────────────────────────────────────────────────────────────
const uploadZone    = document.getElementById('uploadZone');
const fileInput     = document.getElementById('fileInput');
const uploadIdle    = document.getElementById('uploadIdle');
const fileInfo      = document.getElementById('fileInfo');
const fileName      = document.getElementById('fileName');
const fileSize      = document.getElementById('fileSize');
const clearFileBtn  = document.getElementById('clearFileBtn');

const chunkSize     = document.getElementById('chunkSize');

const streamBtn     = document.getElementById('streamBtn');
const downloadBtn   = document.getElementById('downloadBtn');

const outputIdle    = document.getElementById('outputIdle');
const outputActions = document.getElementById('outputActions');
const chunksContainer = document.getElementById('chunksContainer');
const searchResults = document.getElementById('searchResults');
const statChunks    = document.getElementById('statChunks');
const statChars     = document.getElementById('statChars');
const copyBtn       = document.getElementById('copyBtn');
const clearOutputBtn = document.getElementById('clearOutputBtn');
const tabChunks     = document.getElementById('tabChunks');
const tabSearch     = document.getElementById('tabSearch');

const embedSection      = document.getElementById('embedSection');
const embedBtn          = document.getElementById('embedBtn');
const embedStatus       = document.getElementById('embedStatus');
const searchSection     = document.getElementById('searchSection');
const searchQuery       = document.getElementById('searchQuery');
const searchBtn         = document.getElementById('searchBtn');
const downloadSection   = document.getElementById('downloadSection');
const downloadChunksBtn = document.getElementById('downloadChunksBtn');


// ── State ─────────────────────────────────────────────────────────────────────
let currentFile = null;
let allChunks   = [];   // { content, rawContent, metadata, index, length }
let currentOutputFormat = 'text';

// ── Helpers ───────────────────────────────────────────────────────────────────
const show  = (el) => el.classList.remove('hidden');
const hide  = (el) => el.classList.add('hidden');
const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

const switchTab = (tab) => {
  // Update tab button active state
  tabChunks.classList.toggle('tab-btn--active', tab === 'chunks');
  tabSearch.classList.toggle('tab-btn--active', tab === 'search');

  if (tab === 'chunks') {
    // Show chunks or idle placeholder
    const hasChunks = chunksContainer.value.length > 0;
    hasChunks ? show(chunksContainer) : show(outputIdle);
    hide(searchResults);
    show(outputActions); // Show chunk stats
  } else {
    hide(chunksContainer);
    hide(outputIdle);
    show(searchResults);
    hide(outputActions); // Hide chunk stats in search tab
  }
};

const buildFormData = () => {
  const fd = new FormData();
  fd.append('document', currentFile);
  fd.append('chunkSize',    chunkSize.value);
  fd.append('outputFormat', document.querySelector('input[name="outputFormat"]:checked').value);
  // semantic chunking params
  fd.append('similarityThreshold',              document.getElementById('similarityThreshold').value);
  fd.append('dynamicThresholdLowerBound',       document.getElementById('dynamicThresholdLowerBound').value);
  fd.append('dynamicThresholdUpperBound',       document.getElementById('dynamicThresholdUpperBound').value);
  fd.append('numSimilaritySentencesLookahead',  document.getElementById('numSimilaritySentencesLookahead').value);
  fd.append('combineChunks',                    document.querySelector('input[name="combineChunks"]:checked').value);
  fd.append('combineChunksSimilarityThreshold', document.getElementById('combineChunksSimilarityThreshold').value);
  return fd;
};

// ── File handling ─────────────────────────────────────────────────────────────
const setFile = (file) => {
  if (!file) return;
  currentFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = fmtBytes(file.size);
  hide(uploadIdle);
  show(fileInfo);
  streamBtn.disabled  = false;
  downloadBtn.disabled = false;
};

const clearFile = () => {
  currentFile = null;
  fileInput.value = '';
  hide(fileInfo);
  show(uploadIdle);
  streamBtn.disabled  = true;
  downloadBtn.disabled = true;
};

fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
clearFileBtn.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

// Click on zone opens picker (but not on the clear button or file input itself)
uploadZone.addEventListener('click', (e) => {
  if (e.target === clearFileBtn || e.target === fileInput) return;
  fileInput.click();
});

// Drag-and-drop
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

// ── Output helpers ────────────────────────────────────────────────────────────
const clearOutput = () => {
  allChunks = [];
  chunksContainer.value = '';
  searchResults.value = '';
  hide(outputActions);
  hide(embedSection);
  hide(searchSection);
  hide(downloadSection);
  hide(chunksContainer);
  hide(searchResults);
  show(outputIdle);
  embedStatus.textContent = '';
  switchTab('chunks'); // Reset to chunks tab
};

const startOutput = () => {
  allChunks = [];
  chunksContainer.value = '';
  currentOutputFormat = document.querySelector('input[name="outputFormat"]:checked').value;
  hide(outputActions);
  hide(outputIdle);
  show(chunksContainer);
  switchTab('chunks'); // Ensure chunks tab is active
};

const updateStats = () => {
  const total = allChunks.length;
  const chars = allChunks.reduce((s, c) => s + (c.length || 0), 0);
  statChunks.textContent = `${total} chunk${total !== 1 ? 's' : ''}`;
  statChars.textContent  = `${chars.toLocaleString()} chars`;
  show(outputActions);

  // Show embed section when chunks are available
  if (total > 0) {
    show(embedSection);
    embedStatus.textContent = 'Ready to embed';
    hide(searchSection);
    searchResults.value = '';
  }
};

// Batch textarea updates to avoid blocking
let pendingContent = '';
let updateTimer = null;

const flushContentToTextarea = () => {
  if (pendingContent) {
    chunksContainer.value += pendingContent;
    chunksContainer.scrollTop = chunksContainer.scrollHeight;
    pendingContent = '';
  }
  updateTimer = null;
};

const appendStatusCard = (message) => {
  // Status messages shown in console only, not in textarea
  console.log(`ℹ️ ${message}`);
};

const appendChunkCard = (chunk) => {
  // Batch content updates - format based on output type
  if (currentOutputFormat === 'json') {
    // For JSON, we'll build it at the end
    // Just mark that we received this chunk
  } else {
    // For text, append rawContent immediately
    pendingContent += chunk.rawContent + '\n';
    if (!updateTimer) {
      updateTimer = setTimeout(flushContentToTextarea, 50);
    }
  }
};

const appendErrorCard = (message) => {
  chunksContainer.value += `\n❌ Error: ${message}\n`;
  chunksContainer.scrollTop = chunksContainer.scrollHeight;
};

// ── Stream ────────────────────────────────────────────────────────────────────
streamBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  setButtonsBusy(true);
  startOutput();
  appendStatusCard('Uploading…');

  try {
    const resp = await fetch('/chunk/stream', { method: 'POST', body: buildFormData() });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      appendErrorCard(err.error || resp.statusText);
      return;
    }

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let msg;
        try { msg = JSON.parse(trimmed); } catch { continue; }
        handleStreamMessage(msg);
      }
    }
  } catch (err) {
    appendErrorCard(err.message);
  } finally {
    setButtonsBusy(false);
  }
});

const handleStreamMessage = (msg) => {
  switch (msg.type) {
    case 'status':
      appendStatusCard(msg.message);
      break;
    case 'meta':
      appendStatusCard(`Streaming ${msg.total} chunks…`);
      break;
    case 'chunk':
      allChunks.push(msg);
      appendChunkCard(msg);
      updateStats();
      break;
    case 'done':
      if (currentOutputFormat === 'json') {
        // Build JSON array from chunks
        const jsonData = allChunks.map(chunk => ({
          index: chunk.index,
          content: chunk.rawContent,
          tokens: chunk.metadata?.tokens || 0
        }));
        chunksContainer.value = JSON.stringify(jsonData, null, 2);
        chunksContainer.scrollTop = 0;
      } else {
        flushContentToTextarea(); // Flush any pending text content
      }
      updateStats();
      break;
    case 'error':
      appendErrorCard(msg.message);
      break;
  }
};

// ── Download ──────────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  setButtonsBusy(true);
  try {
    const resp = await fetch('/chunk/download', { method: 'POST', body: buildFormData() });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      // Show error in output panel
      startOutput();
      appendErrorCard(err.error || resp.statusText);
      return;
    }

    const blob = await resp.blob();
    const disposition = resp.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const name  = match ? match[1] : 'chunks.txt';

    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    startOutput();
    appendErrorCard(err.message);
  } finally {
    setButtonsBusy(false);
  }
});

// ── Copy all ──────────────────────────────────────────────────────────────────
copyBtn.addEventListener('click', async () => {
  const isSearchTab = tabSearch.classList.contains('tab-btn--active');
  const text = isSearchTab ? searchResults.value : chunksContainer.value;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy All'; }, 1500);
  } catch {
    copyBtn.textContent = 'Failed';
    setTimeout(() => { copyBtn.textContent = 'Copy All'; }, 1500);
  }
});

// ── Clear output ──────────────────────────────────────────────────────────────
clearOutputBtn.addEventListener('click', clearOutput);

// ── Generate Embeddings ───────────────────────────────────────────────────────
embedBtn.addEventListener('click', async () => {
  if (allChunks.length === 0) {
    embedStatus.textContent = 'No chunks to embed';
    return;
  }

  embedBtn.disabled = true;
  await doEmbedding();
});

// Actual embedding logic
const doEmbedding = async () => {
  embedStatus.textContent = 'Generating embeddings (initializing model on first use)...';

  try {
    const docId = currentFile?.name || 'unknown';
    const chunks = allChunks.map(c => ({
      index: c.index,
      content: c.rawContent
    }));

    // Create AbortController with a long timeout (5 minutes) for first initialization
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    const resp = await fetch('/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, chunks }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      let errMsg = 'Embedding failed';
      try {
        const err = await resp.json();
        errMsg = err.error || errMsg;
      } catch {
        // response is not JSON
      }
      throw new Error(errMsg);
    }

    // Stream progress from server
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let startTime = Date.now();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === 'progress') {
            embedStatus.textContent = `Embedding... ${msg.done}/${msg.total}`;
          } else if (msg.type === 'done') {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            embedStatus.textContent = `✓ Embeddings generated (${duration}s)`;
            show(searchSection);
            show(downloadSection);
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      embedStatus.textContent = 'Error: Request timeout (embedding is taking too long)';
    } else {
      embedStatus.textContent = `Error: ${err.message}`;
    }
  } finally {
    embedBtn.disabled = false;
  }
};

// ── Search Embeddings ─────────────────────────────────────────────────────────
searchBtn.addEventListener('click', async () => {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = 'Enter a search query';
    return;
  }

  searchBtn.disabled = true;
  searchResults.value = 'Searching...';

  try {
    const resp = await fetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, k: 15 })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Search failed');
    }

    const results = await resp.json();

    if (results.length === 0) {
      searchResults.value = 'No similar chunks found';
    } else {
      const formatted = results.map((r, i) => {
        // Show up to 128 chars of content
        const contentPreview = r.content.substring(0, 128) + (r.content.length > 128 ? '...' : '');
        return `[${i + 1}] Chunk #${r.index}\n${contentPreview}`;
      }).join('\n\n---\n\n');
      searchResults.value = formatted;
    }
    switchTab('search'); // Auto-switch to search results tab
  } catch (err) {
    searchResults.value = `Error: ${err.message}`;
    switchTab('search');
  } finally {
    searchBtn.disabled = false;
  }
});

// ── Download Voy Index ────────────────────────────────────────────────────────
downloadChunksBtn.addEventListener('click', async () => {
  try {
    downloadChunksBtn.disabled = true;
    downloadChunksBtn.textContent = '⏳ Downloading...';

    const resp = await fetch('/download-index');
    if (!resp.ok) {
      throw new Error('Failed to download index');
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voy_index_' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Download failed: ' + err.message);
  } finally {
    downloadChunksBtn.disabled = false;
    downloadChunksBtn.textContent = '📥 Download Voy Index';
  }
});

// ── Output Tab Switching ───────────────────────────────────────────────────────
tabChunks.addEventListener('click', () => switchTab('chunks'));
tabSearch.addEventListener('click', () => switchTab('search'));

// ── Utility ───────────────────────────────────────────────────────────────────
const setButtonsBusy = (busy) => {
  streamBtn.disabled   = busy || !currentFile;
  downloadBtn.disabled = busy || !currentFile;
  streamBtn.textContent   = busy ? '⏳ Processing…' : '▶\u00a0 Stream Chunks';
  downloadBtn.textContent = busy ? '⏳ Processing…' : '⬇\u00a0 Download File';
};
