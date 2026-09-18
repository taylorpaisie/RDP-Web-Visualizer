/* Browser-only parser for RDP5 CSV Code 1 through Code 5 plot exports. */

(function () {
  const COLOR_MAP = {
    // These are tuned to match the colors used by the RDP v5.93 plots.
    yellow: '#d4c91f',
    purple: '#a22aa8',
    green: '#159a9a',
    blue: '#299bb5',
    cyan: '#159a9a',
    red: '#ef4444',
    orange: '#d97706',
    black: '#111827',
    grey: '#64748b',
    gray: '#64748b',
  };
  const FALLBACK_COLORS = ['#d4c91f', '#159a9a', '#a22aa8', '#299bb5'];
  const CODE5_COLORS = {
    // A higher-contrast teal / indigo / coral trio keeps overlapping
    // envelopes distinct without the harshness of browser-primary colors.
    green: '#159D82',
    blue: '#5865D8',
    red: '#D95D70',
  };

  function parsePair(values) {
    if (!values || values.length < 2) return null;
    const a = Number.parseInt(values[0], 10);
    const b = Number.parseInt(values[1], 10);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
  }

  function splitCsvLine(line) {
    const fields = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const character = line[i];
      if (character === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (character === ',' && !inQuotes) {
        fields.push(field.trim());
        field = '';
      } else {
        field += character;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  function normalizeDisplayLabel(value) {
    // Some RDP CSV exports contain the literal typo "paret" in the
    // Major/Minor parent role labels. Preserve the source file itself while
    // correcting only the human-readable label shown by this viewer.
    return String(value || '').replace(/\bparet\b/gi, 'parent');
  }

  function correctedPlotColors(rawNames) {
    const names = [...rawNames];
    // In the supplied RDP exports, slots 2 and 3 need to be swapped to
    // reproduce the colors shown by RDP itself.
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
    const roleLabels = splitCsvLine(lines[plotIndex + 2]).slice(1).filter(Boolean).map(normalizeDisplayLabel);
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
    const roleLabels = splitCsvLine(lines[plotIndex + 2]).slice(1).filter(Boolean).map(normalizeDisplayLabel);

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
          name: normalizeDisplayLabel(parts.slice(2).filter(Boolean).join(', ')),
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

  function parseCode3(common) {
    const { filename, lines, genes, metadata, plotIndex } = common;
    if (plotIndex + 3 > lines.length) throw new Error('The Code 3 Plot data section is incomplete.');

    let upperCutoff = null;
    let lowerCutoff = null;
    let transparency = 0.5;
    let substitutionTypes = [];
    let colorNames = [];
    let header = null;
    let dataStart = -1;

    for (let i = plotIndex + 1; i < lines.length; i += 1) {
      if (!lines[i].trim()) continue;
      const parts = splitCsvLine(lines[i]);
      const first = parts[0].replace(/:$/, '');
      const values = parts.slice(1).filter(Boolean);

      if (first === 'Upper cutoff dotted line') {
        const value = Number(parts[1]);
        if (Number.isFinite(value)) upperCutoff = value;
      } else if (first === 'Lower cutoff dotted line') {
        const value = Number(parts[1]);
        if (Number.isFinite(value)) lowerCutoff = value;
      } else if (/^Transpar/i.test(first)) {
        const value = Number(parts[1]);
        if (Number.isFinite(value)) transparency = value;
      } else if (first === 'Substitution type') {
        substitutionTypes = values;
      } else if (first === 'Plot colours' || first === 'Plot colors') {
        colorNames = values;
      } else if (first === 'Position in alignment') {
        header = parts;
        dataStart = i + 1;
        break;
      }
    }

    if (!header || header.length < 2 || dataStart < 0) {
      throw new Error('The Code 3 plot-data header is missing.');
    }

    const rows = [];
    for (const line of lines.slice(dataStart)) {
      if (!line.trim()) continue;
      const parts = splitCsvLine(line);
      if (parts.length !== header.length) continue;
      const values = parts.map(Number);
      if (!values.every(Number.isFinite)) continue;
      rows.push(values);
    }
    if (!rows.length) throw new Error('No numeric Code 3 plot data were found.');

    const code3DisplayColor = {
      // RDP v5.93's Code 3 export names are rotated relative to the colors
      // drawn in its SiScan event panel. This mapping reproduces that panel.
      yellow: 'purple',
      purple: 'green',
      green: 'yellow',
    };
    const normalizedColorNames = colorNames.map((name) => {
      const normalized = name.toLowerCase();
      const canonical = normalized === 'gray' ? 'grey' : normalized;
      return code3DisplayColor[canonical] || canonical;
    });
    const presentColors = [...new Set(normalizedColorNames.filter(Boolean))];
    const preferredOrder = ['yellow', 'green', 'purple', 'grey'];
    const orderedColors = [
      ...preferredOrder.filter((name) => presentColors.includes(name)),
      ...presentColors.filter((name) => !preferredOrder.includes(name)),
    ];
    const roleByColor = {
      yellow: 'Major Parent – Minor Parent',
      green: 'Major Parent – Recombinant',
      purple: 'Minor Parent – Recombinant',
      grey: 'Auxiliary substitution traces',
    };
    const groups = orderedColors.map((colorName, index) => ({
      index,
      name: `${colorName[0].toUpperCase()}${colorName.slice(1)} SiScan traces`,
      role: roleByColor[colorName] || `${colorName} traces`,
      colorName,
      color: COLOR_MAP[colorName] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    }));
    const groupIndexByColor = new Map(groups.map((group) => [group.colorName, group.index]));

    const x = rows.map((row) => row[0]);
    const series = header.slice(1).map((name, index) => {
      const colorName = normalizedColorNames[index] || '';
      return {
        name,
        role: substitutionTypes[index] || name,
        colorName,
        color: COLOR_MAP[colorName] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
        groupIndex: groupIndexByColor.get(colorName) ?? 0,
        y: rows.map((row) => row[index + 1]),
      };
    });
    const allValues = series.flatMap((item) => item.y);

    metadata['Upper cutoff dotted line'] = upperCutoff;
    metadata['Lower cutoff dotted line'] = lowerCutoff;
    metadata['Transparency'] = transparency;
    metadata['Substitution series'] = series.length;
    metadata['Maximum X-axis value'] ??= Math.max(...x);

    return {
      filename,
      code: 3,
      kind: 'siscan',
      genes,
      metadata,
      x,
      series,
      groups,
      upperCutoff,
      lowerCutoff,
      transparency,
      minY: Math.min(...allValues, upperCutoff ?? 0, lowerCutoff ?? 0, 0),
      maxY: Math.max(...allValues, upperCutoff ?? 0, lowerCutoff ?? 0, 0),
      rowCount: rows.length,
    };
  }

  function parseCode4(common) {
    const { filename, lines, genes, metadata, plotIndex } = common;
    if (plotIndex + 3 > lines.length) throw new Error('The Code 4 Plot data section is incomplete.');

    let transparency = [];
    let floodFillTransparency = [];
    let colorNames = [];
    let floodFillPlots = [];
    let header = null;
    let dataStart = -1;

    for (let i = plotIndex + 1; i < lines.length; i += 1) {
      if (!lines[i].trim()) continue;
      const parts = splitCsvLine(lines[i]);
      const first = parts[0].replace(/:$/, '');
      const numericSettings = parts.slice(1).map((value) => {
        const number = Number(value);
        return value !== '' && Number.isFinite(number) ? number : null;
      });

      if (first === 'Transparency') {
        transparency = numericSettings;
      } else if (first === 'Flood fill transparency') {
        floodFillTransparency = numericSettings;
      } else if (first === 'Colours' || first === 'Colors' || first === 'Plot colours' || first === 'Plot colors') {
        colorNames = parts.slice(1);
      } else if (first === 'Flood fill plots') {
        floodFillPlots = numericSettings.filter(Number.isFinite);
      } else if (first === 'Position in alignment') {
        header = parts;
        dataStart = i + 1;
        break;
      }
    }

    if (!header || header.length < 2 || dataStart < 0) {
      throw new Error('The Code 4 plot-data header is missing.');
    }

    const rows = [];
    for (const line of lines.slice(dataStart)) {
      if (!line.trim()) continue;
      const parts = splitCsvLine(line);
      if (parts.length !== header.length) continue;
      const values = parts.map(Number);
      if (!values.every(Number.isFinite)) continue;
      rows.push(values);
    }
    if (!rows.length) throw new Error('No numeric Code 4 plot data were found.');

    const x = rows.map((row) => row[0]);
    const series = header.slice(1).map((name, index) => {
      const colorName = (colorNames[index] || 'black').toLowerCase();
      return {
        name,
        role: name,
        colorName,
        color: COLOR_MAP[colorName] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
        opacity: Number.isFinite(transparency[index]) ? transparency[index] : 1,
        floodFillOpacity: Number.isFinite(floodFillTransparency[index]) ? floodFillTransparency[index] : 0,
        floodFill: floodFillPlots.includes(index + 1),
        groupIndex: 0,
        y: rows.map((row) => row[index + 1]),
      };
    });
    const allValues = series.flatMap((item) => item.y);
    const primarySeries = series.find((item) => !/permutation\s+(upper|lower)\s+bound/i.test(item.name)) || series[0];
    const upperBound = series.find((item) => /permutation\s+upper\s+bound/i.test(item.name));
    const lowerBound = series.find((item) => /permutation\s+lower\s+bound/i.test(item.name));
    const finalIndex = x.length - 1;
    // RDP writes 0,0 as the final bound pair to close the flooded polygon.
    // Its desktop plot closes that envelope on the primary series, rather
    // than drawing the two bounds vertically back to zero.
    if (upperBound && lowerBound && primarySeries
      && upperBound.y[finalIndex] === 0 && lowerBound.y[finalIndex] === 0
      && primarySeries.y[finalIndex] !== 0) {
      upperBound.y[finalIndex] = primarySeries.y[finalIndex];
      lowerBound.y[finalIndex] = primarySeries.y[finalIndex];
    }
    const exportedBandOpacities = [upperBound?.floodFillOpacity, lowerBound?.floodFillOpacity]
      .filter((value) => Number.isFinite(value) && value > 0);
    const bandOpacity = exportedBandOpacities.length ? Math.max(...exportedBandOpacities) : 0.25;

    metadata['Transparency'] = transparency.filter(Number.isFinite).join(', ');
    metadata['Flood fill transparency'] = floodFillTransparency.filter(Number.isFinite).join(', ');
    metadata['Flood fill plots'] = floodFillPlots.join(', ');
    metadata['Maximum X-axis value'] ??= Math.max(...x);

    return {
      filename,
      code: 4,
      kind: 'three-seq',
      genes,
      metadata,
      x,
      series,
      groups: [{
        index: 0,
        name: primarySeries?.name || '3SEQ cumulative plot',
        role: '3SEQ statistic and permutation bounds',
        colorName: primarySeries?.colorName || 'black',
        color: primarySeries?.color || COLOR_MAP.black,
      }],
      primarySeries,
      upperBound,
      lowerBound,
      bandOpacity,
      minY: Math.min(...allValues),
      maxY: Math.max(...allValues),
      rowCount: rows.length,
    };
  }

  function repairCode5Header(parts) {
    if (parts.length !== 3) return parts;
    const match = parts[1].match(/^(.+?)(Permutation\s+upper\s+bound)$/i);
    return match ? [parts[0], match[1], match[2], parts[2]] : parts;
  }

  function parseCode5(common) {
    const { filename, lines, genes, metadata, plotIndex } = common;
    const groups = [];
    let index = plotIndex + 1;

    while (index < lines.length) {
      while (index < lines.length && !/^Transparency:/i.test(lines[index].trim())) index += 1;
      if (index >= lines.length) break;

      let transparency = [];
      let floodFillTransparency = [];
      let colorNames = [];
      let floodFillPlots = [];
      let header = null;
      let dataStart = -1;

      for (; index < lines.length; index += 1) {
        if (!lines[index].trim()) continue;
        const parts = splitCsvLine(lines[index]);
        const first = parts[0].replace(/:$/, '');
        const numericSettings = parts.slice(1).map((value) => {
          const number = Number(value);
          return value !== '' && Number.isFinite(number) ? number : null;
        });

        if (first === 'Transparency') {
          transparency = numericSettings;
        } else if (first === 'Flood fill transparency') {
          floodFillTransparency = numericSettings;
        } else if (first === 'Colours' || first === 'Colors' || first === 'Plot colours' || first === 'Plot colors') {
          colorNames = parts.slice(1);
        } else if (first === 'Flood fill plots') {
          floodFillPlots = numericSettings.filter(Number.isFinite);
        } else if (first === 'Position in alignment') {
          header = repairCode5Header(parts);
          dataStart = index + 1;
          break;
        }
      }

      if (!header || header.length < 3 || dataStart < 0) break;
      const rows = [];
      index = dataStart;
      for (; index < lines.length; index += 1) {
        if (!lines[index].trim()) break;
        const parts = splitCsvLine(lines[index]);
        if (parts.length !== header.length) continue;
        const values = parts.map(Number);
        if (values.every(Number.isFinite)) rows.push(values);
      }
      if (!rows.length) continue;

      const groupIndex = groups.length;
      const x = rows.map((row) => row[0]);
      const exportedColorName = (colorNames.find(Boolean) || '').toLowerCase();
      const color = CODE5_COLORS[exportedColorName]
        || COLOR_MAP[exportedColorName]
        || FALLBACK_COLORS[groupIndex % FALLBACK_COLORS.length];
      const series = header.slice(1).map((name, seriesIndex) => {
        const y = rows.map((row) => row[seriesIndex + 1]);
        return {
          name,
          role: name,
          colorName: exportedColorName,
          color,
          opacity: Number.isFinite(transparency[seriesIndex]) ? transparency[seriesIndex] : 1,
          floodFillOpacity: Number.isFinite(floodFillTransparency[seriesIndex]) ? floodFillTransparency[seriesIndex] : 0,
          floodFill: floodFillPlots.includes(seriesIndex + 1),
          placeholder: y.every((value) => value === 0),
          groupIndex,
          y,
        };
      });
      const primarySeries = series.find((item) => !/permutation\s+(upper|lower)\s+bound/i.test(item.name));
      const upperBound = series.find((item) => /permutation\s+upper\s+bound/i.test(item.name));
      const lowerBound = series.find((item) => /permutation\s+lower\s+bound/i.test(item.name));
      const finalIndex = x.length - 1;
      // Code 5 uses the same 0,0 polygon-closing sentinel as Code 4. Close
      // it on the primary statistic so the browser does not draw a spike to
      // zero at the right edge of a sequence envelope.
      if (upperBound && lowerBound && primarySeries && !primarySeries.placeholder
        && upperBound.y[finalIndex] === 0 && lowerBound.y[finalIndex] === 0) {
        upperBound.y[finalIndex] = primarySeries.y[finalIndex];
        lowerBound.y[finalIndex] = primarySeries.y[finalIndex];
      }
      const substantiveSeries = series.filter((item) => !item.placeholder);
      const exportedBandOpacities = [upperBound?.floodFillOpacity, lowerBound?.floodFillOpacity]
        .filter((value) => Number.isFinite(value) && value > 0);
      groups.push({
        index: groupIndex,
        name: primarySeries?.name || `Sequence ${groupIndex + 1}`,
        role: `${primarySeries?.name || `Sequence ${groupIndex + 1}`} 3SEQ envelope`,
        colorName: exportedColorName,
        color,
        x,
        series,
        substantiveSeries,
        primarySeries: primarySeries?.placeholder ? null : primarySeries,
        upperBound,
        lowerBound,
        bandOpacity: exportedBandOpacities.length ? Math.max(...exportedBandOpacities) : 0.25,
        rowCount: rows.length,
      });
    }

    if (!groups.length) throw new Error('No Code 5 3SEQ plot blocks were found.');
    const plottedValues = groups.flatMap((group) => group.substantiveSeries.flatMap((item) => item.y));
    metadata['3SEQ sequence groups'] = groups.map((group) => group.name).join(', ');
    metadata['Maximum X-axis value'] ??= Math.max(...groups.flatMap((group) => group.x));

    return {
      filename,
      code: 5,
      kind: 'three-seq-overview',
      genes,
      metadata,
      groups,
      minY: Math.min(...plottedValues),
      maxY: Math.max(...plottedValues),
      rowCount: groups.reduce((total, group) => total + group.rowCount, 0),
    };
  }

  function parseRdpCsv(text, filename = 'RDP export.csv') {
    const common = parseCommon(text, filename);
    const code = String(common.metadata['CSV Code'] ?? '');
    if (code === '1') return parseCode1(common);
    if (code === '2') return parseCode2(common);
    if (code === '3') return parseCode3(common);
    if (code === '4') return parseCode4(common);
    if (code === '5') return parseCode5(common);
    throw new Error(`Unsupported RDP CSV code: ${code || 'unknown'}. This version supports Codes 1, 2, 3, 4, and 5.`);
  }

  function parseRdpCode1Csv(text, filename = 'RDP export.csv') {
    const parsed = parseRdpCsv(text, filename);
    if (parsed.code !== 1) throw new Error(`Expected RDP CSV Code 1 but found Code ${parsed.code}.`);
    return parsed;
  }

  window.RDPParser = { parseRdpCsv, parseRdpCode1Csv };
}());
