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
  exportFormat: document.querySelector('#export-format'),
  exportFigure: document.querySelector('#export-figure'),
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

function hexToRgba(hex, alpha) {
  const clean = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return `rgba(0,0,0,${alpha})`;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
    line: { color, width: 1.8 },
  };
}

function cutoffShape(y) {
  if (!Number.isFinite(y)) return null;
  return {
    type: 'line', xref: 'x2 domain', yref: 'y2',
    x0: 0, x1: 1, y0: y, y1: y,
    line: { color: '#111111', width: 1.25, dash: 'dot' },
  };
}

function recombinantBaselineShape(metadata) {
  const start = metadata['Beginning breakpoint site'];
  const end = metadata['Ending breakpoint site'];
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    type: 'line', xref: 'x2', yref: 'y2',
    x0: start, x1: end, y0: 0, y1: 0,
    line: { color: '#ff3b30', width: 4 },
    layer: 'above',
  };
}

function boxShape(box, color, opacity) {
  return {
    type: 'rect', xref: 'x2', yref: 'y2',
    x0: box.start, x1: box.end, y0: 0, y1: box.height,
    line: { color: hexToRgba(color, opacity), width: 1.15 },
    fillcolor: 'rgba(0,0,0,0)',
    layer: 'above',
  };
}

function buildOrfTraces(genes) {
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

  return [geneTrace, geneDirectionTrace];
}

function buildCommonShapes(metadata) {
  return [
    ciShape(metadata['Beginning breakpoint 99% CI'], 'rgba(100,100,100,0.16)'),
    ciShape(metadata['Beginning breakpoint 95% CI'], 'rgba(100,100,100,0.26)'),
    ciShape(metadata['Ending breakpoint 99% CI'], 'rgba(100,100,100,0.16)'),
    ciShape(metadata['Ending breakpoint 95% CI'], 'rgba(100,100,100,0.26)'),
    breakpointShape(metadata['Beginning breakpoint site'], '#777777'),
    breakpointShape(metadata['Ending breakpoint site'], '#777777'),
  ].filter(Boolean);
}

function code2BatchAnnotations(parsed) {
  const positions = [0.17, 0.50, 0.83];
  return parsed.batches.map((batch, i) => ({
    xref: 'paper', yref: 'paper',
    x: positions[i] ?? ((i + 1) / (parsed.batches.length + 1)),
    y: -0.085,
    text: `${batch.name}<br>(${batch.role})`,
    showarrow: false,
    xanchor: 'center', yanchor: 'top',
    align: 'center',
    font: { size: 10, color: batch.color },
  }));
}

function renderPlot(parsed) {
  const { genes, metadata } = parsed;
  const traces = buildOrfTraces(genes);
  const shapes = buildCommonShapes(metadata);
  const annotations = [
    { xref: 'paper', yref: 'paper', x: 0, y: 1.035, text: '<b>ORF map · six reading frames</b>', showarrow: false, xanchor: 'left', font: { size: 13, color: '#334155' } },
  ];

  const maxX = metadata['Maximum X-axis value'] || 1;
  let yRange = [0, 1.02];
  let hovermode = 'x unified';
  let plotBackground = '#ffffff';
  let y2Grid = '#edf2f7';
  let bottomMargin = 58;
  const legend = { orientation: 'h', x: 1, xanchor: 'right', y: 0.64, yanchor: 'bottom', font: { size: 10 } };
  let x2Ticks = null;
  let y2Ticks = null;

  if (parsed.kind === 'lines') {
    for (const s of parsed.series) {
      traces.push({
        type: 'scatter', mode: 'lines', x: parsed.x, y: s.y,
        name: s.role ? `${s.role}<br>${s.name}` : s.name,
        line: { color: s.color, width: 2.5 },
        opacity: 0.5,
        customdata: s.raw,
        hovertemplate: `${s.role || s.name}<br>Position %{x:,}<br>Pairwise identity %{y:.3f}<br>Raw value %{customdata}<extra></extra>`,
        xaxis: 'x2', yaxis: 'y2',
      });
    }
  } else if (parsed.kind === 'boxes') {
    const opacity = Math.max(0, Math.min(1, Number(parsed.transparency) || 0.25));
    for (const batch of parsed.batches) {
      for (const box of batch.boxes) shapes.push(boxShape(box, batch.color, opacity));
    }

    const cutoff = cutoffShape(parsed.upperCutoff);
    if (cutoff) shapes.push(cutoff);
    const baseline = recombinantBaselineShape(metadata);
    if (baseline) shapes.push(baseline);

    annotations.push(...code2BatchAnnotations(parsed));

    const maxHeight = Number.isFinite(parsed.maxHeight) ? parsed.maxHeight : 1;
    yRange = [0, Math.max(1, Math.ceil(maxHeight * 10) / 10 + 0.5)];
    hovermode = 'closest';
    plotBackground = '#dcdcdc';
    y2Grid = 'rgba(0,0,0,0)';
    bottomMargin = 118;
    x2Ticks = [1, Math.round(maxX * 0.25), Math.round(maxX * 0.5), Math.round(maxX * 0.75), maxX];
    const top = yRange[1];
    y2Ticks = Array.from({ length: 7 }, (_, i) => (top * i) / 6);
  }

  const layout = {
    autosize: true,
    height: parsed.kind === 'boxes' ? 870 : 830,
    margin: { l: 68, r: 22, t: 46, b: bottomMargin },
    paper_bgcolor: '#ffffff',
    plot_bgcolor: plotBackground,
    font: { family: 'Inter, ui-sans-serif, system-ui, sans-serif', color: '#0f172a', size: 12 },
    barmode: 'overlay', hovermode,
    showlegend: parsed.kind === 'lines',
    legend,
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
      gridcolor: parsed.kind === 'boxes' ? 'rgba(0,0,0,0)' : '#edf2f7',
      zeroline: false,
      showline: true,
      linecolor: '#222222',
      linewidth: 1,
      mirror: false,
      ...(x2Ticks ? { tickmode: 'array', tickvals: x2Ticks, ticktext: x2Ticks.map((v) => v.toLocaleString()) } : {}),
    },
    yaxis2: {
      domain: [0, 0.62], anchor: 'x2', range: yRange,
      title: { text: metadata['Y-axis label'] || (parsed.kind === 'boxes' ? '-Log(KA p-val)' : 'Pairwise identity'), standoff: 10 },
      gridcolor: y2Grid,
      zeroline: false,
      showline: true,
      linecolor: '#222222',
      linewidth: 1,
      ...(y2Ticks ? { tickmode: 'array', tickvals: y2Ticks, tickformat: '.3g' } : {}),
    },
    shapes,
    annotations,
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
  els.metricSeries.textContent = parsed.kind === 'boxes'
    ? parsed.batches.length.toLocaleString()
    : parsed.series.length.toLocaleString();
  renderPlot(parsed);
  renderTables(parsed);
  showApp();
  setStatus(`Loaded ${parsed.filename} · RDP CSV Code ${m['CSV Code']} · ${parsed.rowCount.toLocaleString()} plot rows`, 'success');
}

async function readAndRenderFile(file) {
  try {
    const text = await file.text();
    const parsed = window.RDPParser.parseRdpCsv(text, file.name);
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

function exportFilename() {
  const eventNo = currentParsed?.metadata?.['Event number'] ?? 'plot';
  const code = currentParsed?.metadata?.['CSV Code'] ?? 'RDP';
  return `RDP_Code${code}_event_${eventNo}`;
}

els.exportFigure.addEventListener('click', () => {
  if (!currentParsed) return;
  const format = els.exportFormat.value || 'png';
  const vector = format === 'svg';
  Plotly.downloadImage(els.plot, {
    format,
    filename: exportFilename(),
    width: 1600,
    height: currentParsed.kind === 'boxes' ? 1100 : 1000,
    scale: vector ? 1 : 2,
  });
});

window.addEventListener('load', () => {
  if (!('showDirectoryPicker' in window)) {
    els.browserNote.classList.remove('hidden');
    els.browserNote.textContent = 'For automatic folder scanning, use current Chrome or Edge. Other browsers can still open one CSV at a time.';
  }
});
