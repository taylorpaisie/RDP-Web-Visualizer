/* RDP Web Visualizer UI, folder access, Plotly rendering, and auto-refresh. */

const els = {
  chooseFolder: document.querySelector('#choose-folder'),
  fileInput: document.querySelector('#file-input'),
  refreshFolder: document.querySelector('#refresh-folder'),
  autoNewest: document.querySelector('#auto-newest'),
  csvSelect: document.querySelector('#csv-select'),
  sourceLabel: document.querySelector('#source-label'),
  status: document.querySelector('#status'),
  browserNote: document.querySelector('#browser-note'),
  summary: document.querySelector('#summary'),
  plotCard: document.querySelector('#plot-card'),
  details: document.querySelector('#details'),
  plot: document.querySelector('#rdp-plot'),
  plotTitle: document.querySelector('#plot-title'),
  downloadPng: document.querySelector('#download-png'),
  metricEvent: document.querySelector('#metric-event'),
  metricBreakpoints: document.querySelector('#metric-breakpoints'),
  metricGenes: document.querySelector('#metric-genes'),
  metricSeries: document.querySelector('#metric-series'),
  metadataBody: document.querySelector('#metadata-table tbody'),
  geneBody: document.querySelector('#gene-table tbody'),
};

let directoryHandle = null;
let directoryFiles = new Map();
let currentFileName = null;
let currentModified = null;
let currentParsed = null;
let pollTimer = null;
let scanInProgress = false;

const ORF_TRACK_Y = {
  '+1': 5.5,
  '+2': 4.5,
  '+3': 3.5,
  '-1': 2.5,
  '-2': 1.5,
  '-3': 0.5,
};

function normalizedReadingFrame(frame) {
  const value = Math.abs(Number(frame));
  if (!Number.isFinite(value) || value < 1) return 1;
  return ((value - 1) % 3) + 1;
}

function signedFrameLabel(gene) {
  const frame = normalizedReadingFrame(gene.frame);
  const sign = gene.orientation === 2 ? '-' : '+';
  return `${sign}${frame}`;
}

function signedFrameY(gene) {
  return ORF_TRACK_Y[signedFrameLabel(gene)] ?? 5.5;
}

function setStatus(message, kind = 'neutral') {
  els.status.textContent = message;
  els.status.className = `status ${kind}`;
}

function showApp() {
  els.summary.classList.remove('hidden');
  els.plotCard.classList.remove('hidden');
  els.details.classList.remove('hidden');
}

function hideApp() {
  els.summary.classList.add('hidden');
  els.plotCard.classList.add('hidden');
  els.details.classList.add('hidden');
}

function ciShape(bounds, fillcolor) {
  if (!bounds || bounds.length !== 2) return null;
  return {
    type: 'rect', xref: 'x2', yref: 'y2 domain',
    x0: bounds[0], x1: bounds[1], y0: 0, y1: 1,
    fillcolor, line: { width: 0 }, layer: 'below',
  };
}

function breakpointShape(x, color) {
  if (!Number.isFinite(x)) return null;
  return {
    type: 'line', xref: 'x2', yref: 'y2 domain',
    x0: x, x1: x, y0: 0, y1: 1,
    line: { color, width: 2 },
  };
}

function renderPlot(parsed) {
  const { genes, metadata, x, series } = parsed;

  const geneTrace = {
    type: 'bar', orientation: 'h',
    x: genes.map((g) => g.length),
    base: genes.map((g) => g.start),
    y: genes.map(signedFrameY),
    width: 0.56,
    marker: {
      color: genes.map((g) => g.orientation === 1 ? '#111827' : '#64748b'),
      line: { color: '#111827', width: 0.4 },
    },
    customdata: genes.map((g) => [
      g.start,
      g.end,
      signedFrameLabel(g),
      g.orientation === 1 ? 'Left → right' : 'Right → left',
    ]),
    hovertemplate: 'ORF %{customdata[0]:,}–%{customdata[1]:,}<br>Frame %{customdata[2]}<br>%{customdata[3]}<extra></extra>',
    showlegend: false,
    xaxis: 'x', yaxis: 'y',
  };

  const geneDirectionTrace = {
    type: 'scatter',
    mode: 'markers',
    x: genes.map((g) => g.orientation === 2 ? g.start : g.end),
    y: genes.map(signedFrameY),
    marker: {
      symbol: genes.map((g) => g.orientation === 2 ? 'triangle-left' : 'triangle-right'),
      size: 10,
      color: genes.map((g) => g.orientation === 1 ? '#111827' : '#64748b'),
      line: { color: '#ffffff', width: 0.5 },
    },
    customdata: genes.map((g) => [signedFrameLabel(g), g.orientation === 1 ? 'Left → right' : 'Right → left']),
    hovertemplate: 'Frame %{customdata[0]}<br>%{customdata[1]}<extra></extra>',
    showlegend: false,
    xaxis: 'x', yaxis: 'y',
  };

  const traces = [geneTrace, geneDirectionTrace, ...series.map((s) => ({
    type: 'scatter', mode: 'lines', x, y: s.y,
    name: s.role ? `${s.role}<br>${s.name}` : s.name,
    line: { color: s.color, width: 2.5 },
    opacity: 0.65,
    customdata: s.raw,
    hovertemplate: `${s.role || s.name}<br>Position %{x:,}<br>Pairwise identity %{y:.3f}<br>Raw value %{customdata}<extra></extra>`,
    xaxis: 'x2', yaxis: 'y2',
  }))];

  const shapes = [
    ciShape(metadata['Beginning breakpoint 99% CI'], 'rgba(99,102,241,0.10)'),
    ciShape(metadata['Beginning breakpoint 95% CI'], 'rgba(99,102,241,0.20)'),
    ciShape(metadata['Ending breakpoint 99% CI'], 'rgba(239,68,68,0.09)'),
    ciShape(metadata['Ending breakpoint 95% CI'], 'rgba(239,68,68,0.17)'),
    breakpointShape(metadata['Beginning breakpoint site'], '#4338ca'),
    breakpointShape(metadata['Ending breakpoint site'], '#b91c1c'),
  ].filter(Boolean);

  const maxX = metadata['Maximum X-axis value'] || Math.max(...x);
  const layout = {
    autosize: true,
    height: 830,
    margin: { l: 64, r: 22, t: 46, b: 58 },
    paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
    font: { family: 'Inter, ui-sans-serif, system-ui, sans-serif', color: '#0f172a', size: 12 },
    barmode: 'overlay', hovermode: 'x unified',
    legend: { orientation: 'h', x: 1, xanchor: 'right', y: 0.64, yanchor: 'bottom', font: { size: 10 } },
    xaxis: { domain: [0, 1], anchor: 'y', range: [0, maxX], showticklabels: false, showgrid: false, zeroline: false },
    yaxis: {
      domain: [0.72, 1], anchor: 'x', range: [0, 6],
      tickmode: 'array',
      tickvals: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5],
      ticktext: ['−3', '−2', '−1', '+3', '+2', '+1'],
      title: { text: 'ORF frame', standoff: 8 },
      gridcolor: '#eef2f7', gridwidth: 1, zeroline: false,
    },
    xaxis2: {
      domain: [0, 1], anchor: 'y2', range: [0, maxX], matches: 'x',
      title: { text: metadata['X-axis label'] || 'Position in alignment', standoff: 10 },
      gridcolor: '#edf2f7', zeroline: false,
    },
    yaxis2: {
      domain: [0, 0.62], anchor: 'x2', range: [0, 1.02],
      title: { text: metadata['Y-axis label'] || 'Pairwise identity', standoff: 10 },
      gridcolor: '#edf2f7', zeroline: false,
    },
    shapes,
    annotations: [
      { xref: 'paper', yref: 'paper', x: 0, y: 1.035, text: '<b>ORF map · six reading frames</b>', showarrow: false, xanchor: 'left', font: { size: 13, color: '#334155' } },
    ],
  };

  Plotly.react(els.plot, traces, layout, {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    toImageButtonOptions: { format: 'png', filename: `RDP_event_${metadata['Event number'] ?? 'plot'}`, scale: 2 },
  });
}

function renderTables(parsed) {
  els.metadataBody.replaceChildren();
  for (const [key, value] of Object.entries(parsed.metadata)) {
    const tr = document.createElement('tr');
    const tdKey = document.createElement('td');
    const tdValue = document.createElement('td');
    tdKey.textContent = key;
    tdValue.textContent = Array.isArray(value) ? value.join('–') : (value ?? '');
    tr.append(tdKey, tdValue);
    els.metadataBody.append(tr);
  }

  els.geneBody.replaceChildren();
  for (const gene of parsed.genes) {
    const tr = document.createElement('tr');
    const orientation = gene.orientation === 1 ? 'Left → right' : 'Right → left';
    for (const value of [gene.start, gene.end, signedFrameLabel(gene), orientation]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    els.geneBody.append(tr);
  }
}

function renderParsed(parsed) {
  currentParsed = parsed;
  const m = parsed.metadata;
  els.plotTitle.textContent = m['Event title'] || parsed.filename;
  els.metricEvent.textContent = m['Event number'] != null ? `#${m['Event number']}` : '—';
  els.metricBreakpoints.textContent = Number.isFinite(m['Beginning breakpoint site']) && Number.isFinite(m['Ending breakpoint site'])
    ? `${m['Beginning breakpoint site'].toLocaleString()}–${m['Ending breakpoint site'].toLocaleString()}` : '—';
  els.metricGenes.textContent = parsed.genes.length.toLocaleString();
  els.metricSeries.textContent = parsed.series.length.toLocaleString();
  renderPlot(parsed);
  renderTables(parsed);
  showApp();
  setStatus(`Loaded ${parsed.filename} · RDP CSV Code ${m['CSV Code']} · ${parsed.x.length.toLocaleString()} plot rows`, 'success');
}

async function readAndRenderFile(file) {
  try {
    const text = await file.text();
    const parsed = window.RDPParser.parseRdpCode1Csv(text, file.name);
    renderParsed(parsed);
  } catch (error) {
    console.error(error);
    hideApp();
    setStatus(error.message || String(error), 'error');
  }
}

async function scanDirectory({ forceNewest = false } = {}) {
  if (!directoryHandle || scanInProgress) return;
  scanInProgress = true;
  try {
    const files = [];
    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle.kind !== 'file' || !name.toLowerCase().endsWith('.csv')) continue;
      const file = await handle.getFile();
      files.push({ name, handle, file, modified: file.lastModified });
    }
    files.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
    directoryFiles = new Map(files.map((item) => [item.name, item]));

    const previous = els.csvSelect.value;
    els.csvSelect.replaceChildren();
    if (!files.length) {
      els.csvSelect.add(new Option('No CSV files found', ''));
      els.csvSelect.disabled = true;
      setStatus('No .csv files were found in this folder.', 'warning');
      return;
    }

    for (const item of files) {
      const stamp = new Date(item.modified).toLocaleString();
      els.csvSelect.add(new Option(`${item.name} · ${stamp}`, item.name));
    }
    els.csvSelect.disabled = false;

    let selected = previous && directoryFiles.has(previous) ? previous : files[0].name;
    if (forceNewest || els.autoNewest.checked) selected = files[0].name;
    els.csvSelect.value = selected;

    const selectedItem = directoryFiles.get(selected);
    const changed = currentFileName !== selected || (selectedItem && selectedItem.modified !== currentModified);
    if (forceNewest || changed || !currentParsed) {
      currentFileName = selected;
      currentModified = selectedItem.modified;
      await readAndRenderFile(selectedItem.file);
    }
  } catch (error) {
    console.error(error);
    setStatus(`Folder scan failed: ${error.message || error}`, 'error');
  } finally {
    scanInProgress = false;
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => scanDirectory(), 3000);
}

els.chooseFolder.addEventListener('click', async () => {
  if (!('showDirectoryPicker' in window)) {
    els.browserNote.classList.remove('hidden');
    els.browserNote.textContent = 'Folder access is not supported in this browser. Use Chrome or Edge, or choose a single CSV instead.';
    return;
  }
  try {
    directoryHandle = await window.showDirectoryPicker({ mode: 'read' });
    els.sourceLabel.textContent = directoryHandle.name;
    els.refreshFolder.disabled = false;
    currentFileName = null;
    currentModified = null;
    currentParsed = null;
    await scanDirectory({ forceNewest: true });
    startPolling();
  } catch (error) {
    if (error.name !== 'AbortError') setStatus(`Could not open folder: ${error.message || error}`, 'error');
  }
});

els.refreshFolder.addEventListener('click', () => scanDirectory({ forceNewest: false }));
els.autoNewest.addEventListener('change', () => scanDirectory({ forceNewest: els.autoNewest.checked }));
els.csvSelect.addEventListener('change', async () => {
  const item = directoryFiles.get(els.csvSelect.value);
  if (!item) return;
  currentFileName = item.name;
  currentModified = item.modified;
  await readAndRenderFile(item.file);
});

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files?.[0];
  if (!file) return;
  if (pollTimer) clearInterval(pollTimer);
  directoryHandle = null;
  directoryFiles.clear();
  currentFileName = file.name;
  currentModified = file.lastModified;
  els.sourceLabel.textContent = file.name;
  els.refreshFolder.disabled = true;
  els.csvSelect.replaceChildren(new Option(file.name, file.name));
  els.csvSelect.disabled = true;
  await readAndRenderFile(file);
});

els.downloadPng.addEventListener('click', () => {
  if (!currentParsed) return;
  Plotly.downloadImage(els.plot, {
    format: 'png',
    filename: `RDP_event_${currentParsed.metadata['Event number'] ?? 'plot'}`,
    width: 1600,
    height: 1000,
    scale: 2,
  });
});

window.addEventListener('load', () => {
  if (!('showDirectoryPicker' in window)) {
    els.browserNote.classList.remove('hidden');
    els.browserNote.textContent = 'For automatic folder scanning, use current Chrome or Edge. Other browsers can still open one CSV at a time.';
  }
});
