// Run with: node tests/code13.cjs
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
const csv = fs.readFileSync(path.join(root, 'examples/rdp-code-13-breakpoint-p-values.csv'), 'utf8');
const parse = (text) => context.window.RDPParser.parseRdpCsv(text, 'code 13b.csv');
const parsed = parse(csv);
assert.equal(parsed.code, 13);
assert.equal(parsed.rowCount, 4778);
assert.equal(parsed.genes.length, 29);
assert.equal(parsed.metadata['Maximum X-axis value'], 9556);
assert.equal(parsed.x[0], 1);
assert.equal(parsed.x.at(-1), 9555);
assert.equal(parsed.series[0].y[0], 1.318759);
assert.equal(parsed.minY, -3.004365);
assert.equal(parsed.maxY, 3.004365);
assert.equal(parsed.upperCutoff, null);
assert.equal(parsed.lowerCutoff, null);
assert.equal(parsed.series[1].y[0], -2);
assert.equal(parsed.series[2].y[0], -2); // preserve unusual first-row bound
assert.equal(parsed.series[2].y[1], 2);
const sourcePositions = csv.split('Breakpoint positions')[1].trim().split(/\s+/).map(Number);
assert.equal(parsed.breakpointPositions.length, sourcePositions.length);
assert.deepEqual(Array.from(parsed.breakpointPositions), sourcePositions);
assert.equal(parsed.breakpointPositions[0], 26);
assert.equal(parsed.breakpointPositions.at(-1), 9465);
assert.throws(() => parse(csv.replace('1,1.318759', '1,bad')), /Invalid Code 13 plot row/);
assert.throws(() => parse(csv.replace('Upper 99% CI', 'Unknown bound')), /Code 13 curve/);
context.fixture = parsed;
vm.runInContext('renderParsed(fixture)', context);
const plot = elements.get('#rdp-plot');
assert.deepEqual(Array.from(plot.layout.yaxis2.range), [4, -4]);
assert.equal(plot.layout.yaxis2.title.text, 'Log(P-val)/-log(P-val)');
assert.equal(plot.layout.xaxis2.matches, 'x');
const curves = plot.data.filter((trace) => trace.meta?.comparisonIndex === 0);
assert.equal(curves.length, 5);
assert.equal(curves.filter((trace) => trace.fill === 'tonexty').length, 2);
assert.deepEqual(Array.from(curves.at(-1).y), Array.from(parsed.series[0].y));
curves.forEach((trace) => assert.match(trace.hovertemplate, /Signed log p-value/));
assert.equal(curves.at(-1).line.color, '#111827');
assert.equal(plot.layout.shapes.filter((shape) => shape.line.dash === 'dot').length, 0);
const ticks = plot.data.find((trace) => trace.name === 'Plotted breakpoint positions');
assert.equal(ticks.x.length, sourcePositions.length * 3);
assert.equal(ticks.opacity, 0.25);
assert.equal(ticks.connectgaps, false);
assert.equal(ticks.meta, undefined); // keep ticks visible when the curve is hidden
assert.equal(ticks.xaxis, 'x3');
assert.equal(plot.layout.xaxis3.matches, 'x');
assert.ok(plot.layout.yaxis3.domain[0] > plot.layout.yaxis2.domain[1]);
assert.ok(plot.layout.yaxis3.domain[1] < plot.layout.yaxis.domain[0]);
const reverseIndex = parsed.genes.findIndex((gene) => gene.orientation === 2);
assert.equal(plot.data[1].x[reverseIndex], 7133);
assert.equal(plot.data[1].marker.symbol[reverseIndex], 'triangle-left');
assert.equal(elements.get('#method-badge').textContent, 'Breakpoint clustering p-values');
assert.equal(elements.get('#metric-series').textContent, '1');
assert.equal(elements.get('#metric-breakpoints').textContent, `${sourcePositions.length} positions`);
console.log(`PASS: Code 13 raw signed values, reversed [-4, 4] display, exported envelopes, ${sourcePositions.length} aligned transparent ticks, reverse ORF, hover labels, malformed rows`);
