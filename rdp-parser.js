/* Browser-only parser for RDP5 CSV Code 1 event-plot exports. */

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
  const FALLBACK_COLORS = ['#d6cb25', '#b95cc9', '#5b9f3a', '#299bb5'];

  function parsePair(values) {
    if (!values || values.length < 2) return null;
    const a = Number.parseInt(values[0], 10);
    const b = Number.parseInt(values[1], 10);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
  }

  function parseRdpCode1Csv(text, filename = 'RDP export.csv') {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (!lines.length || !lines[0].trim().startsWith('Gene start')) {
      throw new Error('This file does not look like an RDP CSV Code 1 export (gene-map header not found).');
    }

    const blankIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '');
    if (blankIndex < 0) throw new Error('Could not find the end of the gene-map section.');

    const genes = [];
    for (const line of lines.slice(1, blankIndex)) {
      if (!line.trim()) continue;
      const parts = line.split(',').map((x) => x.trim());
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
      const parts = lines[i].split(',').map((x) => x.trim());
      const key = parts[0].replace(/:$/, '');
      const values = parts.slice(1);

      if (/^RDP Plot for event/i.test(key)) {
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

    if (String(metadata['CSV Code']) !== '1') {
      throw new Error(`Unsupported RDP CSV code: ${metadata['CSV Code'] ?? 'unknown'}. This version currently supports Code 1.`);
    }
    if (plotIndex < 0 || plotIndex + 4 > lines.length) {
      throw new Error('The Plot data section is missing or incomplete.');
    }

    const colorNames = lines[plotIndex + 1].split(',').slice(1).map((x) => x.trim()).filter(Boolean);
    const roleLabels = lines[plotIndex + 2].split(',').slice(1).map((x) => x.trim()).filter(Boolean);
    const header = lines[plotIndex + 3].split(',').map((x) => x.trim());
    if (header.length < 2) throw new Error('The plot-data header is missing.');

    const rows = [];
    for (const line of lines.slice(plotIndex + 4)) {
      if (!line.trim()) continue;
      const parts = line.split(',').map((x) => x.trim());
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
    return { filename, genes, metadata, x, series, rawMax, scale };
  }

  window.RDPParser = { parseRdpCode1Csv };
}());
