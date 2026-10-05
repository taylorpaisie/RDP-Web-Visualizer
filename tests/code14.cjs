// Run with: node tests/code14.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const elements = new Map();
const element = () => ({ listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, remove() {}, classList: { add() {}, remove() {} },
  style: { setProperty() {} }, setAttribute() {}, append() {}, replaceChildren() {}, focus() {} });
const context = vm.createContext({ console, structuredClone, window: { addEventListener() {} },
  document: { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  }, createElement: element, body: { append() {} } },
  Plotly: { react(plot, data, layout) { plot.data = data; plot.layout = layout; },
    async newPlot(plot, data, layout) { context.exportCapture = { data, layout }; },
    async downloadImage() {}, purge() {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'rdp-parser.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
const csv = fs.readFileSync(path.join(root, 'examples/rdp-code-14-ldhat.csv'), 'utf8');
const parse = (text) => context.window.RDPParser.parseRdpCsv(text, 'code 14.csv');
const parsed = parse(csv);
assert.equal(parsed.code, 14);
assert.equal(parsed.kind, 'ldhat');
assert.equal(parsed.rowCount, 1690);
assert.equal(parsed.genes.length, 0);
assert.equal(parsed.metadata['Maximum X-axis value'], 9556);
assert.equal(parsed.x[0], 40);
assert.equal(parsed.x.at(-1), 9550);
assert.equal(parsed.series[0].y[0], 3.4038);
assert.equal(parsed.series[1].y[0], 2.34183);
assert.equal(parsed.series[2].y[0], 5.1635);
assert.equal(parsed.maxY, 12.4678);
assert.equal(parsed.series[2].y[parsed.x.indexOf(914)], 0.24449);
assert.equal(parsed.series[2].y[parsed.x.indexOf(916)], 0.24914);
assert.equal(new Set(parsed.x).size, 1656); // keep all 34 duplicate positions
assert.deepEqual(Array.from(parsed.sampledPositions), Array.from(parsed.x));
assert.equal(parsed.breakpointPositions.length, 0);
const sourceRows = csv.trim().split(/\r?\n/).slice(6).map((line) => line.split(',').map(Number));
sourceRows.forEach((row, index) => {
  assert.equal(parsed.x[index], row[0]);
  parsed.series.forEach((series, column) => assert.equal(series.y[index], row[column + 1]));
});
assert.throws(() => parse(csv.replace('40,3.4038', '40,bad')), /Invalid Code 14 plot row/);
assert.throws(() => parse(csv.replace('40,3.4038', '40,')), /Invalid Code 14 plot row/);
assert.throws(() => parse(csv.replace('40,3.4038,2.34183', '40,3.4038,-1')), /Invalid Code 14 plot row/);
assert.throws(() => parse(csv.replace('Mean Rho/bp', 'Unknown')), /Code 14 mean rho/);
assert.throws(() => parse(csv.split('40,3.4038')[0]), /No Code 14/);
const genePrefix = fs.readFileSync(path.join(root, 'examples/rdp-code-12-breakpoint-distribution.csv'), 'utf8').split('CSV Code:')[0];
assert.equal(parse(genePrefix + csv).genes.length, 29);
assert.throws(() => parse(csv.replace('CSV Code:, 14', 'CSV Code:, 13')), /gene-map header/);
context.fixture = parsed;
vm.runInContext('renderParsed(fixture)', context);
const plot = elements.get('#rdp-plot');
assert.equal(plot.layout.yaxis.visible, false);
assert.match(plot.layout.annotations[0].text, /ORF map not supplied/);
assert.deepEqual(Array.from(plot.layout.yaxis2.domain), [0, 0.9]);
assert.equal(plot.layout.yaxis2.range[0], 0);
assert.ok(plot.layout.yaxis2.range[1] > parsed.maxY);
assert.equal(plot.layout.yaxis2.title.text, 'Rho(4Ner) per bp');
const curves = plot.data.filter((trace) => trace.meta?.comparisonIndex === 0);
assert.equal(curves.length, 3);
assert.deepEqual(Array.from(curves[0].y), Array.from(parsed.series[1].y));
assert.deepEqual(Array.from(curves[1].y), Array.from(parsed.series[2].y));
assert.deepEqual(Array.from(curves[2].y), Array.from(parsed.series[0].y));
assert.equal(curves[1].fill, 'tonexty');
assert.equal(curves[2].line.color, '#111827');
assert.equal(curves[2].line.simplify, false);
const ticks = plot.data.find((trace) => trace.name === 'Sampled alignment positions');
assert.equal(ticks.opacity, 0.25);
assert.equal(ticks.x.length, 1690 * 3);
assert.equal(ticks.meta, undefined);
assert.equal(plot.layout.xaxis3.matches, 'x');
assert.ok(plot.layout.yaxis3.domain[0] > plot.layout.yaxis2.domain[1]);
assert.equal(plot.data.filter((trace) => trace.name === 'Plotted breakpoint positions').length, 0);
assert.equal(elements.get('#method-badge').textContent, 'LDhat recombination rate');
assert.equal(elements.get('#metric-series').textContent, '1');
assert.equal(elements.get('#metric-breakpoints').textContent, '—');
(async () => {
  await elements.get('#export-figure').listeners.click();
  let key = context.exportCapture.layout.annotations.at(-1).text;
  assert.match(key, /Gray band: exported 95% CI/);
  assert.match(key, /sampled alignment positions/);
  assert.doesNotMatch(key, /99%|cutoff|reported breakpoints/);
  assert.equal(context.exportCapture.data.filter((trace) => trace.showlegend).length, 1);
  context.fixture = parse(fs.readFileSync(path.join(root, 'examples/rdp-code-13-breakpoint-p-values.csv'), 'utf8'));
  vm.runInContext('renderParsed(fixture)', context);
  await elements.get('#export-figure').listeners.click();
  key = context.exportCapture.layout.annotations.at(-1).text;
  assert.doesNotMatch(key, /Dotted lines: exported cutoffs/);
  context.fixture = parse(fs.readFileSync(path.join(root, 'examples/rdp-code-12-breakpoint-distribution.csv'), 'utf8'));
  vm.runInContext('renderParsed(fixture)', context);
  await elements.get('#export-figure').listeners.click();
  assert.match(context.exportCapture.layout.annotations.at(-1).text, /Dotted lines: exported cutoffs/);
  console.log('PASS: Code 14 all 1690 raw rows, 95% band, 34 duplicates, sample ticks, absent/optional ORFs, malformed input, figure export keys, Code 12/13 export regression');
})().catch((error) => { console.error(error); process.exitCode = 1; });
