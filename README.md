# RDP Web Visualizer

A browser-only visualizer for RDP5 CSV exports. No Python, Conda, Docker, or local server is required.

The app supports **RDP CSV Codes 1 through 12**, based on supplied exports from RDP v5.93. It displays the ORF map alongside interactive plots, with breakpoint calls, 95% and 99% confidence intervals, significance cutoffs, and other annotations when the export provides them.

| CSV code | Plot | Key features |
| --- | --- | --- |
| 1 | Pairwise comparisons | Comparison curves normalized to the largest exported value; raw values in hover details |
| 2 | GENECONV | Box coordinates, heights, exported transparency, and upper cutoff |
| 3 | SiScan | Substitution-series Z-scores, comparison groups, and significance cutoffs |
| 4 | 3SEQ | Cumulative-height curve and permutation-bound envelope |
| 5 | Multi-sequence 3SEQ | Separate sequence curves and colored permutation envelopes |
| 6 | MaxChi | Parent/recombinant comparison curves and significance cutoffs |
| 7 | CHIMAERA | Three curves with each sequence's own informative-site positions |
| 8 | Single-recombinant CHIMAERA | One black curve with informative-site ticks and significance cutoffs |
| 9 | PhylPro | Raw sequence correlation coefficients and informative-site ticks |
| 10 | Distance | Raw pairwise distances, with zero at the top and increasing distance downward |
| 11 | Recombination event map | One outlined box per event, exact exported hex colors, and boundary-hover metadata |
| 12 | Breakpoint distribution | Density curve, nested 95%/99% confidence envelopes, both cutoffs, and transparent breakpoint ticks |

The viewer also provides a six-track ORF map (`+1`, `+2`, `+3`, `-1`, `-2`, `-3`) with direction arrows, metadata and gene tables, and PNG, SVG, JPEG, and WebP figure downloads.

## Exploring and exporting figures

- Click a comparison or Code 11 event in the legend to show or hide its curves or boxes. **Only** isolates that item; **Show all** restores every item. ORFs, breakpoint calls, and confidence intervals remain visible. Loading an export resets comparison visibility.
- Hover over a curve for its values. In Code 11, hover near a box boundary to see all exported event fields, including the method, recombinant, parents, coordinates, statistic, distance, and color.
- **Zoom to event** fits the reported breakpoints and available 95%/99% confidence intervals with surrounding context. It is disabled when either breakpoint is missing, including the supplied Code 11 overview. Intervals crossing the alignment origin use the full alignment so both ends stay visible.
- **Full alignment** restores the original axes. The existing +/− buttons, arrow-key panning, and 0/double-click reset remain available.
- **Export figure** saves the current view and comparison selection with a title, comparison legend, event identifier, and annotation key. Export preparation leaves the on-screen chart unchanged. The chart's separate camera shortcut is removed so downloads use this shared export flow.

## ORF frame mapping

The exports provide a frame and an orientation for each ORF. The web view combines those into a signed reading-frame track:

- orientation `1` (left → right) maps to `+1`, `+2`, or `+3`;
- orientation `2` (right → left) maps to `-1`, `-2`, or `-3`.

For example, frame `1` + orientation `1` is shown on `+1`, while frame `1` + orientation `2` is shown on `-1`. Directional arrowheads are also drawn at the end of each ORF.

## RDP comparison colors

For pairwise comparison plots, the RDP export color order for the two recombinant comparisons is corrected in the browser view so the displayed comparisons match the RDP figure:

- Major Parent - Minor Parent: yellow
- Major Parent - Recombinant: green
- Minor Parent - Recombinant: purple

CHIMAERA and PhylPro sequence plots use their own sequence colors. Code 11 uses the hexadecimal color supplied for each event without remapping it.

## Code 2 box plots

CSV Code 2 is rendered as batches of rectangles. Each numeric row is interpreted as:

1. start position in the alignment;
2. end position in the alignment; and
3. box height on the y-axis.

The first coordinate batch is yellow, the second is green, and the third is purple. Boxes use the transparency supplied by the export; the supplied Code 2 example specifies `0.25`. The exported upper cutoff is drawn as a dotted horizontal line.

## Code 3 SiScan plots

CSV Code 3 is rendered from the raw substitution-series Z-scores in the export. RDP v5.93's exported Code 3 color names are translated to the colors drawn in its SiScan panel; the viewer groups visibility controls by the resulting yellow, green, purple, and gray trace families and preserves the exported opacity. The exported upper and lower cutoffs are drawn as dotted lines. A black zero baseline and a subtle red recombinant-interval outline reproduce the important visual cues from RDP's SiScan panel.

## Code 4 3SEQ plots

CSV Code 4 is rendered from the exported 3SEQ cumulative-height series. The primary statistic is drawn as a black line, while the permutation upper and lower bounds form a gray envelope using the export's line and flood-fill transparency settings. Breakpoint calls, confidence intervals, and the recombinant-interval outline remain aligned with the ORF map.

## Code 5 multi-sequence 3SEQ plots

CSV Code 5 contains consecutive plot blocks for the event's L, K, and O sequences. The viewer renders these as green, blue, and red line/envelope groups, preserves each block's exported line and flood-fill opacity, and provides one visibility control per sequence. It also repairs the missing comma in the `KPermutation upper bound` and `OPermutation upper bound` headers emitted by the supplied RDP v5.93 export and ignores their all-zero placeholder series.

## Code 6 MaxChi plots

CSV Code 6 is rendered from the exported MaxChi `-Log(chi2 p-val)` comparison values at their alignment positions. The viewer displays the three parent/recombinant comparisons in the colors shown by RDP, both exported significance cutoffs, the reported breakpoint sites and confidence intervals, and the red recombinant interval along the baseline. The supplied event #7 example has breakpoints at 3,498 and 9,310 in a 9,594-position alignment.

## Code 7 CHIMAERA plots

CSV Code 7 is rendered from the three exported CHIMAERA height curves. RDP v5.93 gives R, T, and U different informative-site coordinate arrays, so the parser uses each sequence's own positions rather than treating the first block as a shared x-axis. The viewer reproduces Darren's example with green, blue, and red curves, informative-site ticks at the top of the panel, both dotted significance cutoffs, nested 95%/99% confidence bands, reported breakpoint lines, and the red recombinant interval.

## Code 8 single-recombinant CHIMAERA plots

CSV Code 8 contains one black CHIMAERA curve for U as recombinant with R and T as parents. The viewer preserves its informative-site positions and raw heights, both significance cutoffs, breakpoint calls, nested confidence bands, and red recombinant interval. Darren's supplied CSV is stored in `examples/rdp-code-8-chimaera.csv`; its corresponding [RDP screenshot](images/rdp-code-8-reference.png) is kept for visual comparison.

## Code 9 PhylPro plots

CSV Code 9 contains raw T, L, and K correlation coefficients, displayed in green, blue, and red. The parser uses the sequence header following `Colours` rather than the earlier pairwise preamble. Informative-site ticks, breakpoint confidence bands, and a red event outline accompany a y-axis fitted to the correlation range. The supplied CSV contains 6,053 positions and a minimum correlation of 0.8023456; its [reference screenshot](images/rdp-code-9-reference.png) shows dips near 0.72. The viewer preserves the CSV values. The example is stored in `examples/rdp-code-9-phylpro.csv`.

## Code 10 distance plots

CSV Code 10 contains three pairwise distance curves. The viewer displays T–L in yellow, T–K in teal, and L–K in purple, with zero at the top and increasing distance downward. Exported distances are preserved without normalization. The supplied CSV has 477 sampled positions and a maximum distance of 1.0, whereas the [reference screenshot](images/rdp-code-10-reference.png) shows a scale ending near 0.45; the viewer fits its axis to the CSV values. Breakpoint calls, confidence bands, and the red event outline remain aligned with the ORF map.

## Code 11 recombination event maps

CSV Code 11 renders one outlined box per event, using columns 6 and 7 for alignment coordinates, column 8 for the height, and the literal hexadecimal color in column 10. Hover near a box boundary to see all source columns, including the event number, method, recombinant, parents, coordinates, p-value statistic, distance, and color. Each event can be hidden or isolated through the legend. The supplied [reference screenshot](images/rdp-code-11-reference.png) accompanies `examples/rdp-code-11-event-map.csv`. The supplied overview contains 14 events and has no single event breakpoint or confidence interval; those annotations are drawn only when supplied in the metadata.

## CSV Code 12: breakpoint distribution

Code 12 shows the exported breakpoint density per 200 nt window as a black curve, with a lighter 99% confidence envelope and darker 95% envelope. Both dotted cutoffs retain their exported values and labels, even when the value labeled “Lower” exceeds the value labeled “Upper”. The supplied CSV contains 4,778 plot rows, 29 ORFs, and 601 breakpoint positions across a 9,556-position alignment.

The separate `Breakpoint positions` section after the main plot supplies the short vertical ticks between the plot and ORF map. These use 0.18 opacity (82% transparency), remain visible when the density group is hidden, and share the alignment axis for zooming and figure export. Positions and repeated calls are preserved; these are distinct from a single event's beginning/ending breakpoint lines. The parser reads this trailing section for any supported export that supplies it.

## Use the web app

Open:

**https://taylorpaisie.github.io/RDP-Web-Visualizer/**

### Best workflow: choose an RDP output folder

In current Chrome or Edge:

1. Click **Choose RDP folder**.
2. Grant read access to the folder where RDP writes CSV exports.
3. The page scans for `.csv` files and opens the newest one.
4. While the page remains open, the directory is rescanned every 3 seconds. New or updated CSV exports are picked up automatically when **Follow newest CSV** is enabled.

The browser requires an explicit folder permission grant; a normal website cannot silently inspect local directories.

### Fallback: choose one CSV

Browsers without the File System Access API can still use **Choose one CSV**. This works without automatic folder watching.

## About page

Use **About** in the header to open [the About page](about.html), which includes supported plot types, event-map hover guidance, file-loading and export options, privacy and scope information, citation guidance, and contact details. Use **Visualizer** to return to the app.

The About page displays `images/ham-and-peng.png` at its original aspect ratio with descriptive alternative text. To replace the image, update its `src`, `width`, `height`, and `alt` attributes in `about.html`. Keep image assets in `images/` and use relative paths so they work under the GitHub Pages repository URL.

## Privacy

CSV content is processed in the browser. The app does not upload the selected RDP files to a server.

## Supported RDP formats

The parser is intentionally grounded on supplied real examples rather than guessing undocumented formats. It recognizes:

- `Gene start`, `Gene end`, frame, and orientation rows;
- `CSV Code` and event metadata;
- beginning/ending breakpoint sites;
- 95% and 99% breakpoint confidence intervals;
- plot colors and comparison roles;
- Code 1 numerical line-plot data;
- Code 2 three-batch box coordinates, transparency, and upper cutoff;
- Code 3 SiScan substitution types, plot colors, raw Z-scores, transparency, and upper/lower cutoffs;
- Code 4 3SEQ heights, permutation bounds, plot colors, and line/flood-fill transparency;
- Code 5 multi-block 3SEQ sequence series, colors, and line/flood-fill transparency;
- Code 6 MaxChi comparison values, plot colors, and upper/lower cutoffs;
- Code 7 CHIMAERA values, per-sequence informative-site positions, plot colors, and upper/lower cutoffs;
- Code 8 single-recombinant CHIMAERA values, informative-site positions, plot color, and upper/lower cutoffs;
- Code 9 PhylPro sequence correlations, plot colors, and alignment positions;
- Code 10 raw pairwise distances, comparison colors, and alignment positions;
- Code 11 event box coordinates, heights, hexadecimal colors, and per-event metadata;
- Code 12 breakpoint density, 95%/99% envelopes, cutoffs, and trailing breakpoint positions.

Additional RDP CSV codes should be added from real example exports.

## Local development

Because this is a static site, any simple local web server works. For example:

```bash
python -m http.server 8000
```

This is only for development. End users do **not** need Python when using the GitHub Pages site.

Run `node tests/code12.cjs` to verify Code 12 parsing, rendered trace geometry, transparent ticks, and the supplied Code 6 regression.

With the local server running, open the parser or visualizer checks listed below. Each visualizer check loads its CSV through the app's file picker and verifies the resulting Plotly figure. Code 10 checks also verify that Code 1 normalization still works; Code 11 checks cover event geometry, colors, hover metadata, and isolate/show-all controls.

| Code | Example CSV | Parser check | Visualizer check | RDP reference |
| --- | --- | --- | --- | --- |
| 6 | [MaxChi](examples/rdp-code-6-maxchi.csv) | [Parser](tests/code6.html) | [Visualizer](tests/code6-preview.html) | — |
| 7 | [CHIMAERA](examples/rdp-code-7-chimaera.csv) | [Parser](tests/code7.html) | [Visualizer](tests/code7-preview.html) | — |
| 8 | [Single-recombinant CHIMAERA](examples/rdp-code-8-chimaera.csv) | [Parser](tests/code8.html) | [Visualizer](tests/code8-preview.html) | [Screenshot](images/rdp-code-8-reference.png) |
| 9 | [PhylPro](examples/rdp-code-9-phylpro.csv) | [Parser](tests/code9.html) | [Visualizer](tests/code9-preview.html) | [Screenshot](images/rdp-code-9-reference.png) |
| 10 | [Distance](examples/rdp-code-10-distance.csv) | [Parser](tests/code10.html) | [Visualizer](tests/code10-preview.html) | [Screenshot](images/rdp-code-10-reference.png) |
| 11 | [Event map](examples/rdp-code-11-event-map.csv) | [Parser](tests/code11.html) | [Visualizer](tests/code11-preview.html) | [Screenshot](images/rdp-code-11-reference.png) |
| 12 | [Breakpoint distribution](examples/rdp-code-12-breakpoint-distribution.csv) | [Parser and renderer](tests/code12.cjs) | — | [Screenshot](images/rdp-code-12-reference.png) |

## GitHub Pages

A Pages deployment workflow is included under `.github/workflows/pages.yml`. If Pages is not already enabled, open **Settings → Pages** for the repository and select **GitHub Actions** as the source.

## Files

- `index.html` — app shell and controls
- `about.html` — project information, contact details, and featured image
- `images/` — static image assets, including `ham-and-peng.png`
- `styles.css` — responsive visual design
- `base.css` — shared layout and component styles
- `dark-shell.css` — dark theme (imported by `styles.css`)
- `contact.js` — shared contact footer used on both pages
- `zoom-controls.js` — event zoom, full-alignment reset, and keyboard navigation
- `rdp-parser.js` — RDP CSV Code 1 through Code 11 parser
- `app.js` — directory access and Plotly renderer
- `examples/` — supplied CSV fixtures listed above
- `tests/` — browser parser and visualizer checks listed above
- `images/rdp-code-*-reference.png` — supplied desktop screenshots for comparison

## Scope

This tool visualizes RDP output. It does not rerun recombination detection or independently validate an event.
