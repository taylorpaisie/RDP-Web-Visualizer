// Run with: node tests/code12.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const elements = new Map();
const element = () => ({ addEventListener() {}, classList: { add() {}, remove() {} },
  style: { setProperty() {} }, setAttribute() {}, append() {}, replaceChildren() {}, focus() {} });
const context = vm.createContext({ console, window: { addEventListener() {} },
  document: { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  }, createElement: element },
  Plotly: { react(plot, data, layout) { plot.data = data; plot.layout = layout; } } });
vm.runInContext(fs.readFileSync(path.join(root, 'rdp-parser.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
const csv = fs.readFileSync(path.join(root, 'examples/rdp-code-12-breakpoint-distribution.csv'), 'utf8');
const parse = (text) => context.window.RDPParser.parseRdpCsv(text, 'Code 12.csv');
const parsed = parse(csv);
assert.equal(parsed.code, 12);
assert.equal(parsed.rowCount, 4778);
assert.equal(parsed.genes.length, 29);
assert.equal(parsed.metadata['Maximum X-axis value'], 9556);
assert.equal(parsed.x[0], 1);
assert.equal(parsed.x.at(-1), 9555);
assert.equal(parsed.series[0].y[0], 2.130794);
assert.equal(parsed.series[1].y[0], 8.745367); // retain exported first-row bounds
assert.equal(parsed.lowerCutoff, 40.8964385986328);
assert.equal(parsed.upperCutoff, 38.0054817199707);
assert.equal(parsed.breakpointPositions.length, 601);
assert.equal(parsed.breakpointPositions[0], 26);
assert.equal(parsed.breakpointPositions.at(-1), 9465);
const mainPlot = csv.split('Breakpoint positions')[0];
assert.equal(parse(mainPlot).breakpointPositions.length, 0);
assert.equal(parse(mainPlot + 'Breakpoint positions\n26\n26\n').breakpointPositions.length, 2);
assert.throws(() => parse(mainPlot + 'Breakpoint positions\n9557\n'), /Invalid breakpoint/);
assert.throws(() => parse(csv.replace('1,2.130794', '1,bad')), /Invalid Code 12 plot row/);
context.fixture = parsed;
vm.runInContext('renderParsed(fixture)', context);
const plot = elements.get('#rdp-plot');
const ticks = plot.data.find((trace) => trace.name === 'Plotted breakpoint positions');
assert.equal(ticks.x.length, 601 * 3);
assert.equal(ticks.mode, 'lines');
assert.equal(ticks.opacity, 0.25);
assert.equal(ticks.line.width, 1);
assert.equal(ticks.connectgaps, false);
parsed.breakpointPositions.forEach((position, index) => {
  assert.equal(ticks.x[index * 3], position);
  assert.equal(ticks.x[index * 3 + 1], position);
  assert.equal(ticks.x[index * 3 + 2], null);
  assert.equal(ticks.y[index * 3], 0.35);
  assert.equal(ticks.y[index * 3 + 1], 0.65);
  assert.equal(ticks.y[index * 3 + 2], null);
});
const reverseIndex = parsed.genes.findIndex((gene) => gene.orientation === 2);
const reverseGene = parsed.genes[reverseIndex];
assert.equal(reverseGene.start, 7780);
assert.equal(reverseGene.end, 7133);
assert.equal(reverseGene.length, 648);
assert.equal(plot.data[0].base[reverseIndex], 7133);
assert.equal(plot.data[0].x[reverseIndex], 648);
assert.equal(plot.data[1].x[reverseIndex], 7133);
assert.equal(plot.data[1].marker.symbol[reverseIndex], 'triangle-left');
// Orientation, rather than the order of the exported bounds, controls arrows.
context.orfFixtures = [
  {start: 10, end: 20, length: 11, frame: 1, orientation: 2},
  {start: 20, end: 10, length: 11, frame: 1, orientation: 1},
];
const orfTraces = vm.runInContext('buildOrfTraces(orfFixtures)', context);
assert.equal(orfTraces[0].base[0], 10);
assert.equal(orfTraces[0].base[1], 10);
assert.equal(orfTraces[1].x[0], 10);
assert.equal(orfTraces[1].x[1], 20);
assert.equal(orfTraces[1].marker.symbol[0], 'triangle-left');
assert.equal(orfTraces[1].marker.symbol[1], 'triangle-right');
assert.equal(ticks.xaxis, 'x3');
assert.equal(ticks.meta, undefined); // keep ticks visible when curve group hidden
assert.equal(plot.layout.xaxis3.matches, 'x');
assert.ok(plot.layout.yaxis3.domain[0] > plot.layout.yaxis2.domain[1]);
assert.ok(plot.layout.yaxis3.domain[1] < plot.layout.yaxis.domain[0]);
const curves = plot.data.filter((trace) => trace.meta?.comparisonIndex === 0);
assert.equal(curves.length, 5);
assert.equal(curves.filter((trace) => trace.fill === 'tonexty').length, 2);
assert.equal(curves.at(-1).line.color, '#111827');
assert.equal(curves.at(-1).y[0], 2.130794);
assert.equal(plot.layout.shapes.filter((shape) => shape.line.dash === 'dot').length, 2);
assert.equal(elements.get('#method-badge').textContent, 'Breakpoint distribution');
assert.equal(elements.get('#metric-breakpoints').textContent, '601 positions');
// Existing supplied Code 6 still parses and renders; a trailing list is reusable.
const code6 = fs.readFileSync(path.join(root, 'examples/rdp-code-6-maxchi.csv'), 'utf8');
const old = parse(code6);
assert.equal(old.code, 6);
assert.equal(old.metadata['Beginning breakpoint site'], 3498);
assert.equal(old.metadata['Ending breakpoint site'], 9310);
context.fixture = old;
vm.runInContext('renderParsed(fixture)', context);
assert.equal(plot.layout.xaxis3, undefined);
assert.equal(plot.data.filter((trace) => trace.meta?.comparisonIndex !== undefined).length, 3);
assert.equal(parse(code6 + '\nBreakpoint positions\n26\n').breakpointPositions[0], 26);
console.log('PASS: Code 12 source values, envelopes, 601 explicit transparent aligned ticks, descending reverse ORF and arrow endpoint, malformed rows, reusable breakpoint section, Code 6 regression');
