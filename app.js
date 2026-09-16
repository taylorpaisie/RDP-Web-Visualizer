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
  emptyState: document.querySelector('#empty-state'),
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
  formatBadge: document.querySelector('#format-badge'),
  methodBadge: document.querySelector('#method-badge'),
  comparisonLegend: document.querySelector('#comparison-legend'),
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
let comparisonVisible = [];

function comparisonItems(parsed) {
  return parsed.kind === 'boxes' ? parsed.batches : parsed.series;
}

function updateComparisonVisibility() {
  const traceIndices = [];
  const visibility = [];
  els.plot.data.forEach((trace, index) => {
    if (Number.isInteger(trace.meta?.comparisonIndex)) {
      traceIndices.push(index);
      visibility.push(comparisonVisible[trace.meta.comparisonIndex]);
    }
  });
  if (traceIndices.length) Plotly.restyle(els.plot, { visible: visibility }, traceIndices);
  const update = {};
  (els.plot.layout.shapes || []).forEach((shape, index) => {
    if (shape.name?.startsWith('comparison-')) {
      update[`shapes[${index}].visible`] = comparisonVisible[Number(shape.name.slice(11))];
    }
  });
  if (Object.keys(update).length) Plotly.relayout(els.plot, update);
  renderComparisonLegend(currentParsed);
}

const ORF_TRACK_Y = {
  '+1': 5.5,
  '+2': 4.5,
  '+3': 3.5,
  '-1': 2.5,
  '-2': 1.5,
  '-3': 0.5,
};

// Frame colors are deliberately distinct across direction and reading frame.
const ORF_FRAME_COLORS = {
  '+1': '#2563eb',
  '+2': '#0891b2',
  '+3': '#059669',
  '-1': '#ea580c',
  '-2': '#dc2626',
  '-3': '#9333ea',
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

function signedFrameColor(gene) {
  return ORF_FRAME_COLORS[signedFrameLabel(gene)] ?? '#64748b';
}

function setStatus(message, kind = 'neutral') {
  els.status.textContent = message;
  els.status.className = `status ${kind}`;
}

function showApp() {
  els.emptyState.classList.add('hidden');
  els.summary.classList.remove('hidden');
  els.plotCard.classList.remove('hidden');
  els.details.classList.remove('hidden');
}

function hideApp() {
  els.emptyState.classList.remove('hidden');
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
    line: { color, width: 1.45 },
  };
}

function cutoffShape(y) {
  if (!Number.isFinite(y)) return null;
  return {
    type: 'line', xref: 'x2 domain', yref: 'y2',
    x0: 0, x1: 1, y0: y, y1: y,
    line: { color: '#475569', width: 1.2, dash: 'dot' },
  };
}

function recombinantBaselineShape(metadata) {
  const start = metadata['Beginning breakpoint site'];
  const end = metadata['Ending breakpoint site'];
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    type: 'line', xref: 'x2', yref: 'y2',
    x0: start, x1: end, y0: 0, y1: 0,
    line: { color: '#ef4444', width: 3.2 },
    layer: 'above',
  };
}

function boxShape(box, color, opacity) {
  return {
    type: 'rect', xref: 'x2', yref: 'y2',
    x0: box.start, x1: box.end, y0: 0, y1: box.height,
    line: { color: hexToRgba(color, opacity), width: 1.05 },
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
    width: 0.42,
    marker: {
      color: genes.map(signedFrameColor),
      line: { color: '#ffffff', width: 0.5 },
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
      size: 8,
      color: genes.map(signedFrameColor),
      line: { color: '#ffffff', width: 0.7 },
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
    ciShape(metadata['Beginning breakpoint 99% CI'], 'rgba(100,116,139,0.10)'),
    ciShape(metadata['Beginning breakpoint 95% CI'], 'rgba(100,116,139,0.19)'),
    ciShape(metadata['Ending breakpoint 99% CI'], 'rgba(100,116,139,0.10)'),
    ciShape(metadata['Ending breakpoint 95% CI'], 'rgba(100,116,139,0.19)'),
    breakpointShape(metadata['Beginning breakpoint site'], '#64748b'),
    breakpointShape(metadata['Ending breakpoint site'], '#64748b'),
  ].filter(Boolean);
}

function renderComparisonLegend(parsed) {
  els.comparisonLegend.replaceChildren();
  const items = parsed.kind === 'boxes' ? parsed.batches : parsed.series;
  for (const [index, item] of items.entries()) {
    const card = document.createElement('div');
    card.className = 'comparison-item';

    const swatch = document.createElement('span');
    swatch.className = 'comparison-swatch';
    swatch.style.setProperty('--series-color', item.color || '#64748b');

    const copy = document.createElement('div');
    const role = document.createElement('strong');
    role.textContent = item.role || item.colorName || 'Comparison';
    const name = document.createElement('small');
    name.textContent = item.name || '';
    name.title = item.name || '';
    copy.append(role, name);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'comparison-toggle';
    toggle.setAttribute('aria-pressed', String(comparisonVisible[index]));
    toggle.setAttribute('aria-label', `Show ${item.role || item.name || 'comparison'}`);
    toggle.append(swatch, copy);
    toggle.addEventListener('click', () => {
      comparisonVisible[index] = !comparisonVisible[index];
      updateComparisonVisibility();
      els.comparisonLegend.querySelectorAll('.comparison-toggle')[index].focus();
    });
    const isolate = document.createElement('button');
    isolate.type = 'button';
    isolate.className = 'comparison-isolate';
    isolate.textContent = 'Only';
    isolate.setAttribute('aria-label', `Show only ${item.role || item.name || 'comparison'}`);
    isolate.addEventListener('click', () => {
      comparisonVisible = items.map((_, i) => i === index);
      updateComparisonVisibility();
      els.comparisonLegend.querySelectorAll('.comparison-isolate')[index].focus();
    });
    card.append(toggle, isolate);
    els.comparisonLegend.append(card);
  }
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'btn secondary compact';
  all.textContent = 'Show all';
  all.addEventListener('click', () => {
    comparisonVisible.fill(true);
    updateComparisonVisibility();
    els.comparisonLegend.lastElementChild.focus();
  });
  els.comparisonLegend.append(all);
}

function renderPlot(parsed) {
  const { genes, metadata } = parsed;
  els.plot.__rdpEventMetadata = metadata;
  const traces = buildOrfTraces(genes);
  const shapes = buildCommonShapes(metadata);
  const annotations = [
    {
      xref: 'paper', yref: 'paper', x: 0, y: 1.022,
      text: '<b>ORF map</b> · +1 +2 +3 / −1 −2 −3',
      showarrow: false, xanchor: 'left',
      font: { size: 11, color: '#64748b' },
    },
  ];

  const maxX = metadata['Maximum X-axis value'] || 1;
  let yRange = [0, 1.02];
  let hovermode = 'x unified';
  let plotBackground = '#ffffff';
  let y2Grid = '#e9eef5';
  let x2Ticks = null;
  let y2Ticks = null;
  let y2TickText = null;

  if (parsed.kind === 'lines') {
    for (const [index, s] of parsed.series.entries()) {
      traces.push({
        meta: { comparisonIndex: index },
        type: 'scatter', mode: 'lines', x: parsed.x, y: s.y,
        name: s.role || s.name,
        line: { color: s.color, width: 2.35 },
        opacity: 0.5,
        customdata: s.raw,
        hovertemplate: `${s.role || s.name}<br>Position %{x:,}<br>Pairwise identity %{y:.3f}<br>Raw value %{customdata}<extra></extra>`,
        showlegend: false,
        xaxis: 'x2', yaxis: 'y2',
      });
    }
  } else if (parsed.kind === 'boxes') {
    const opacity = Math.max(0, Math.min(1, Number(parsed.transparency) || 0.25));
    for (const [index, batch] of parsed.batches.entries()) {
      for (const box of batch.boxes) shapes.push({ ...boxShape(box, batch.color, opacity), name: `comparison-${index}` });
    }

    const cutoff = cutoffShape(parsed.upperCutoff);
    if (cutoff) shapes.push(cutoff);
    const baseline = recombinantBaselineShape(metadata);
    if (baseline) shapes.push(baseline);

    const maxHeight = Number.isFinite(parsed.maxHeight) ? parsed.maxHeight : 1;
    const top = Math.max(1, Math.ceil((maxHeight + 0.45) * 10) / 10);
    yRange = [0, top];
    hovermode = 'closest';
    plotBackground = '#f8fafc';
    y2Grid = '#e6ebf1';
    x2Ticks = [
      1,
      Math.floor(maxX * 0.25),
      Math.floor(maxX * 0.5),
      Math.round(maxX * 0.75),
      maxX,
    ];
    y2Ticks = Array.from({ length: 7 }, (_, i) => (top * i) / 6);
    y2TickText = y2Ticks.map((value, i) => {
      if (i === 0) return '0.00';
      if (i === 1) return (Math.floor(value * 100) / 100).toFixed(2);
      return (Math.floor(value * 10) / 10).toFixed(1);
    });
  }

  const layout = {
    autosize: true,
    height: parsed.kind === 'boxes' ? 760 : 720,
    margin: { l: 64, r: 18, t: 36, b: 58 },
    paper_bgcolor: '#ffffff',
    plot_bgcolor: plotBackground,
    font: { family: 'Inter, ui-sans-serif, system-ui, sans-serif', color: '#334155', size: 11 },
    barmode: 'overlay',
    hovermode,
    dragmode: 'zoom',
    showlegend: false,
    hoverlabel: { bgcolor: '#0f172a', bordercolor: '#0f172a', font: { color: '#ffffff', size: 11 } },
    xaxis: {
      domain: [0, 1], anchor: 'y', range: [0, maxX],
      showticklabels: false, showgrid: false, zeroline: false,
      fixedrange: false,
    },
    yaxis: {
      domain: [0.79, 1], anchor: 'x', range: [0, 6],
      tickmode: 'array',
      tickvals: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5],
      ticktext: ['−3', '−2', '−1', '+3', '+2', '+1'],
      tickfont: { color: '#64748b', size: 10 },
      title: { text: 'ORF frame', standoff: 7, font: { color: '#64748b', size: 10 } },
      gridcolor: '#edf1f5', gridwidth: 1, zeroline: false,
      showline: false,
    },
    xaxis2: {
      domain: [0, 1], anchor: 'y2', range: [0, maxX], matches: 'x',
      title: { text: metadata['X-axis label'] || 'Position in alignment', standoff: 10, font: { size: 11, color: '#475569' } },
      gridcolor: parsed.kind === 'boxes' ? '#eef2f6' : '#edf1f5',
      gridwidth: 1,
      zeroline: false,
      showline: true,
      linecolor: '#94a3b8',
      linewidth: 1,
      tickfont: { color: '#64748b', size: 10 },
      ticks: 'outside',
      ticklen: 4,
      tickcolor: '#94a3b8',
      ...(x2Ticks ? { tickmode: 'array', tickvals: x2Ticks, ticktext: x2Ticks.map((v) => v.toLocaleString()) } : {}),
    },
    yaxis2: {
      domain: [0, 0.70], anchor: 'x2', range: yRange,
      title: {
        text: metadata['Y-axis label'] || (parsed.kind === 'boxes' ? '-Log(KA p-val)' : 'Pairwise identity'),
        standoff: 9,
        font: { size: 11, color: '#475569' },
      },
      gridcolor: y2Grid,
      gridwidth: 1,
      zeroline: false,
      showline: true,
      linecolor: '#94a3b8',
      linewidth: 1,
      tickfont: { color: '#64748b', size: 10 },
      ticks: 'outside',
      ticklen: 4,
      tickcolor: '#94a3b8',
      ...(y2Ticks ? { tickmode: 'array', tickvals: y2Ticks, ticktext: y2TickText } : {}),
    },
    shapes,
    annotations,
  };

  Plotly.react(els.plot, traces, layout, {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d', 'toImage'],
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
  comparisonVisible = comparisonItems(parsed).map(() => true);
  const m = parsed.metadata;
  els.plotTitle.textContent = m['Event title'] || parsed.filename;
  els.metricEvent.textContent = m['Event number'] != null ? `#${m['Event number']}` : '—';
  els.metricBreakpoints.textContent = Number.isFinite(m['Beginning breakpoint site']) && Number.isFinite(m['Ending breakpoint site'])
    ? `${m['Beginning breakpoint site'].toLocaleString()}–${m['Ending breakpoint site'].toLocaleString()}` : '—';
  els.metricGenes.textContent = parsed.genes.length.toLocaleString();
  els.metricSeries.textContent = parsed.kind === 'boxes'
    ? parsed.batches.length.toLocaleString()
    : parsed.series.length.toLocaleString();
  els.formatBadge.textContent = `CSV Code ${m['CSV Code'] ?? parsed.code ?? '—'}`;
  els.methodBadge.textContent = parsed.kind === 'boxes' ? 'GENECONV box plot' : 'Pairwise identity';
  renderComparisonLegend(parsed);
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

function figureText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

els.exportFigure.addEventListener('click', async () => {
  if (!currentParsed) return;
  const parsed = currentParsed;
  const filename = exportFilename();
  const format = els.exportFormat.value || 'png';
  const vector = format === 'svg';
  const exportPlot = document.createElement('div');
  exportPlot.style.cssText = 'position:absolute;left:-10000px;top:0;width:1600px;';
  document.body.append(exportPlot);
  els.exportFigure.disabled = true;
  try {
    const data = structuredClone(els.plot.data);
    const layout = structuredClone(els.plot.layout);
    const items = comparisonItems(parsed);
    data.forEach((trace) => {
      const index = trace.meta?.comparisonIndex;
      if (!Number.isInteger(index)) return;
      trace.showlegend = comparisonVisible[index];
      trace.name = figureText(items[index].role || items[index].name || 'Comparison');
    });
    if (parsed.kind === 'boxes') items.forEach((item, index) => {
      if (comparisonVisible[index]) data.push({
        type: 'scatter', x: [null], y: [null], xaxis: 'x2', yaxis: 'y2',
        mode: 'lines', line: { color: item.color, width: 3 },
        name: figureText(item.role || item.name || 'Comparison'), showlegend: true,
      });
    });
    layout.showlegend = true;
    layout.legend = { orientation: 'h', x: 0, y: -0.12, font: { size: 14 } };
    layout.margin = { ...layout.margin, t: 95, b: 165 };
    layout.title = { text: figureText(parsed.metadata['Event title'] || parsed.filename), x: 0.04, font: { size: 20 } };
    layout.annotations = [...(layout.annotations || []), {
      xref: 'paper', yref: 'paper', x: 0, y: -0.23, xanchor: 'left', showarrow: false,
      text: `CSV Code ${figureText(parsed.code ?? parsed.metadata['CSV Code'] ?? '')} · Event ${figureText(parsed.metadata['Event number'] ?? '—')} · ${comparisonVisible.filter(Boolean).length}/${items.length} comparisons shown<br>Gray bands: 95% (darker) / 99% (lighter) CI · Vertical lines: reported breakpoints${parsed.kind === 'boxes' ? '<br>Dotted line: upper cutoff · Red baseline: recombinant interval' : ''}`,
      font: { size: 12, color: '#475569' }, align: 'left',
    }];
    await Plotly.newPlot(exportPlot, data, layout, { staticPlot: true });
    await Plotly.downloadImage(exportPlot, {
    format,
    filename,
    width: 1600,
    height: parsed.kind === 'boxes' ? 1200 : 1110,
    scale: vector ? 1 : 2,
    });
  } catch (error) {
    setStatus(`Figure export failed: ${error.message || error}`, 'error');
  } finally {
    Plotly.purge(exportPlot);
    exportPlot.remove();
    els.exportFigure.disabled = false;
  }
});

window.addEventListener('load', () => {
  if (!('showDirectoryPicker' in window)) {
    els.browserNote.classList.remove('hidden');
    els.browserNote.textContent = 'For automatic folder scanning, use current Chrome or Edge. Other browsers can still open one CSV at a time.';
  }
});
