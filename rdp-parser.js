/* Browser-only parser for RDP5 CSV Code 1 and Code 2 plot exports. */

(function () {
  const COLOR_MAP = {
    yellow: '#d6cb25',
    purple: '#b95cc9',
    green: '#5b9f3a',
    blue: '#299bb5',
    cyan: '#299bb5',
    red: '#d74a4a',
    orange: '#d97706',
    black: '#111827',
    grey: '#64748b',
    gray: '#64748b',
  };
  const FALLBACK_COLORS = ['#d6cb25', '#5b9f3a', '#b95cc9', '#299bb5'];

  function parsePair(values) {
    if (!values || values.length < 2) return null;
    const a = Number.parseInt(values[0], 10);
    const b = Number.parseInt(values[1], 10);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
  }

  function splitCsvLine(line) {
    return line.split(',').map((x) => x.trim());
  }

  function correctedPlotColors(rawNames) {
    const names = [...rawNames];
    // RDP's export labels the recombinant-major and recombinant-minor colors
    // in the opposite order from the displayed plot. Swap slots 2 and 3.
    if (names.length >= 3) [names[1], names[2]] = [names[2], names[1]];
    return names;
  }

  function parseCommon(text, filename) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (!lines.length || !lines[0].trim().startsWith('Gene start')) {
      throw new Error('This file does not look like a supported RDP CSV export (gene-map header not found).');
    }

    const blankIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '');
    if (blankIndex < 0) throw new Error('Could not find the end of the gene-map section.');

    const genes = [];
    for (const line of lines.slice(1, blankIndex)) {
      if (!line.trim()) continue;
      const parts = splitCsvLine(line);
      if (parts.length < 4) continue;
      const [start, end, frame, orientation] = parts.slice(0, 4).map(Number);
      if (![start, end, frame, orientation].every(Number.isFinite)) continue;
      genes.push({ start, end, frame, orientation, length: end - start + 1 });
    }

    const metadata = {};
    let plotIndex = -1;
    for (let i = blankIndex + 1; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line === 'Plot data') {
        plotIndex = i;
        break;
      }
      const parts = splitCsvLine(lines[i]);
      const key = parts[0].replace(/:$/, '');
      const values = parts.slice(1);

      if (/plot for event/i.test(key)) {
        metadata['Event title'] = key;
        const match = key.match(/event\s*#?\s*(\d+)/i);
        metadata['Event number'] = match ? Number(match[1]) : null;
      } else if (key === 'CSV Code') {
        metadata['CSV Code'] = values[0] || null;
      } else if (/\bCI$/i.test(key)) {
        metadata[key] = parsePair(values);
      } else if (['Maximum X-axis value', 'Beginning breakpoint site', 'Ending breakpoint site'].includes(key)) {
        const value = Number(values[0]);
        metadata[key] = Number.isFinite(value) ? value : null;
      } else if (['Y-axis label', 'X-axis label'].includes(key)) {
        metadata[key] = values[0] || null;
      } else {
        metadata[key] = values.filter(Boolean).join(', ') || null;
      }
    }

    if (plotIndex < 0) throw new Error('The Plot data section is missing.');
    return { filename, lines, genes, metadata, plotIndex };
  }

  function parseCode1(common) {
    const { filename, lines, genes, metadata, plotIndex } = common;
    if (plotIndex + 4 > lines.length) throw new Error('The Code 1 Plot data section is incomplete.');

    const rawColorNames = splitCsvLine(lines[plotIndex + 1]).slice(1).filter(Boolean);
    const colorNames = correctedPlotColors(rawColorNames);
    const roleLabels = splitCsvLine(lines[plotIndex + 2]).slice(1).filter(Boolean);
    const header = splitCsvLine(lines[plotIndex + 3]);
    if (header.length < 2) throw new Error('The plot-data header is missing.');

    const rows = [];
    for (const line of lines.slice(plotIndex + 4)) {
      if (!line.trim()) continue;
      const parts = splitCsvLine(line);
      if (parts.length !== header.length) continue;
      const values = parts.map(Number);
      if (!values.every(Number.isFinite)) continue;
      rows.push(values);
    }
    if (!rows.length) throw new Error('No numeric plot data were found.');

    const x = rows.map((row) => row[0]);
    const series = header.slice(1).map((name, i) => ({
      name,
      role: roleLabels[i] || '',
      colorName: colorNames[i] || '',
      color: COLOR_MAP[(colorNames[i] || '').toLowerCase()] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      raw: rows.map((row) => row[i + 1]),
    }));

    const rawMax = Math.max(...series.flatMap((s) => s.raw));
    const scale = rawMax > 0 ? rawMax : 1;
    for (const item of series) item.y = item.raw.map((value) => value / scale);

    metadata['Maximum X-axis value'] ??= Math.max(...x);
    return {
      filename,
      code: 1,
      kind: 'lines',
      genes,
      metadata,
      x,
      series,
      rawMax,
      scale,
      rowCount: rows.length,
    };
  }

  function parseCode2(common) {
    const { filename, lines, genes, metadata, plotIndex } = common;
    if (plotIndex + 4 > lines.length) throw new Error('The Code 2 Plot data section is incomplete.');

    const rawColorNames = splitCsvLine(lines[plotIndex + 1]).slice(1).filter(Boolean);
    const colorNames = correctedPlotColors(rawColorNames);
    const roleLabels = splitCsvLine(lines[plotIndex + 2]).slice(1).filter(Boolean);

    const batches = [];
    let currentBatch = null;
    let upperCutoff = null;
    let transparency = 0.25;

    for (let i = plotIndex + 3; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = splitCsvLine(lines[i]);
      const first = parts[0].replace(/:$/, '');

      if (first === 'Upper cutoff dotted line') {
        const value = Number(parts[1]);
        if (Number.isFinite(value)) upperCutoff = value;
        continue;
      }
      if (/^Transpar/i.test(first)) {
        const value = Number(parts[1]);
        if (Number.isFinite(value)) transparency = value;
        continue;
      }
      if (parts[0] === 'Start Position in alignment' && parts[1] === 'End Position in alignment') {
        const batchIndex = batches.length;
        const colorName = colorNames[batchIndex] || ['yellow', 'green', 'purple'][batchIndex] || '';
        currentBatch = {
          index: batchIndex,
          name: parts.slice(2).filter(Boolean).join(', '),
          role: roleLabels[batchIndex] || '',
          colorName,
          color: COLOR_MAP[colorName.toLowerCase()] || FALLBACK_COLORS[batchIndex % FALLBACK_COLORS.length],
          boxes: [],
        };
        batches.push(currentBatch);
        continue;
      }

      if (!currentBatch || parts.length < 3) continue;
      const start = Number(parts[0]);
      const end = Number(parts[1]);
      const height = Number(parts[2]);
      if (![start, end, height].every(Number.isFinite)) continue;
      currentBatch.boxes.push({ start, end, height });
    }

    if (!batches.length || !batches.some((batch) => batch.boxes.length)) {
      throw new Error('No Code 2 box-coordinate batches were found.');
    }

    metadata['Upper cutoff dotted line'] = upperCutoff;
    metadata['Transparency'] = transparency;
    const allBoxes = batches.flatMap((batch) => batch.boxes);
    const maxHeight = Math.max(...allBoxes.map((box) => box.height));
    metadata['Maximum X-axis value'] ??= Math.max(...allBoxes.map((box) => box.end));

    return {
      filename,
      code: 2,
      kind: 'boxes',
      genes,
      metadata,
      batches,
      upperCutoff,
      transparency,
      maxHeight,
      rowCount: allBoxes.length,
    };
  }

  function parseRdpCsv(text, filename = 'RDP export.csv') {
    const common = parseCommon(text, filename);
    const code = String(common.metadata['CSV Code'] ?? '');
    if (code === '1') return parseCode1(common);
    if (code === '2') return parseCode2(common);
    throw new Error(`Unsupported RDP CSV code: ${code || 'unknown'}. This version supports Codes 1 and 2.`);
  }

  // Backward-compatible alias for older app code/bookmarks.
  function parseRdpCode1Csv(text, filename = 'RDP export.csv') {
    const parsed = parseRdpCsv(text, filename);
    if (parsed.code !== 1) throw new Error(`Expected RDP CSV Code 1 but found Code ${parsed.code}.`);
    return parsed;
  }

  window.RDPParser = { parseRdpCsv, parseRdpCode1Csv };
}());
