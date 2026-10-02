# RDP Web Visualizer

A browser-only visualizer for RDP5 CSV exports. No Python, Conda, Docker, or local server is required.

The app currently supports **RDP CSV Codes 1 through 9**, based on real exports from RDP v5.93. It recreates the event view as an interactive Plotly figure with:

- a six-track ORF map labeled `+1`, `+2`, `+3`, `-1`, `-2`, `-3`;
- ORF direction arrowheads derived from the RDP orientation field;
- Code 1 pairwise-comparison curves;
- Code 2 GENECONV box plots;
- Code 3 SiScan substitution-series Z-score plots;
- Code 4 3SEQ cumulative-height plots with permutation-bound envelopes;
- Code 5 multi-sequence 3SEQ plots with colored envelopes;
- Code 6 MaxChi comparison curves and significance cutoffs;
- Code 7 CHIMAERA curves with per-sequence informative-site positions;
- Code 8 single-recombinant CHIMAERA curves;
- Code 9 PhylPro correlation curves;
- beginning and ending breakpoint calls;
- 95% and 99% breakpoint confidence intervals;
- event metadata and gene tables; and
- PNG, SVG, JPEG, and WebP figure export with comparison legends and annotation guidance.

## Exploring and exporting figures

- Click a comparison in the legend to show or hide its curves or boxes. **Only** isolates that comparison; **Show all** restores every comparison. ORFs, breakpoint calls, and confidence intervals remain visible. Loading an export resets comparison visibility.
- **Zoom to event** fits the reported breakpoints and available 95%/99% confidence intervals with surrounding context. It is disabled when either breakpoint is missing. Intervals crossing the alignment origin use the full alignment so both ends stay visible.
- **Full alignment** restores the original axes. The existing +/− buttons, arrow-key panning, and 0/double-click reset remain available.
- **Export figure** saves the current view and comparison selection with a title, comparison legend, event identifier, and annotation key. Export preparation leaves the on-screen chart unchanged. The chart's separate camera shortcut is removed so downloads use this shared export flow.

## ORF frame mapping

The exports provide a frame and an orientation for each ORF. The web view combines those into a signed reading-frame track:

- orientation `1` (left → right) maps to `+1`, `+2`, or `+3`;
- orientation `2` (right → left) maps to `-1`, `-2`, or `-3`.

For example, frame `1` + orientation `1` is shown on `+1`, while frame `1` + orientation `2` is shown on `-1`. Directional arrowheads are also drawn at the end of each ORF.

## RDP comparison colors

The RDP export color order for the two recombinant comparisons is corrected in the browser view so the displayed comparisons match the RDP figure:

- Major Parent - Minor Parent: yellow
- Major Parent - Recombinant: green
- Minor Parent - Recombinant: purple

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

CSV Code 9 contains raw T, L, and K correlation coefficients, displayed in green, blue, and red. The parser uses the sequence header following `Colours` rather than the earlier pairwise preamble. Informative-site ticks, breakpoint confidence bands, and a red event outline accompany a y-axis fitted to the correlation range. The supplied [reference screenshot](images/rdp-code-9-reference.png) accompanies `examples/rdp-code-9-phylpro.csv`.

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

Use **About** in the header to open [the About page](about.html), which includes a project overview, privacy and scope information, citation guidance, and contact details. Use **Visualizer** to return to the app.

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
- Code 5 multi-block 3SEQ sequence series, colors, and line/flood-fill transparency; and
- Code 6 MaxChi comparison values, plot colors, and upper/lower cutoffs; and
- Code 7 CHIMAERA values, per-sequence informative-site positions, plot colors, and upper/lower cutoffs; and
- Code 8 single-recombinant CHIMAERA values, informative-site positions, plot color, and upper/lower cutoffs; and
- Code 9 PhylPro sequence correlations, plot colors, and alignment positions.

Additional RDP CSV codes should be added from real example exports.

## Local development

Because this is a static site, any simple local web server works. For example:

```bash
python -m http.server 8000
```

This is only for development. End users do **not** need Python when using the GitHub Pages site.

With the local server running, open `tests/code6.html`, `tests/code7.html`, `tests/code8.html`, or `tests/code9.html` for parser checks against Darren's supplied CSVs. The matching `code6-preview.html`, `code7-preview.html`, `code8-preview.html`, and `code9-preview.html` pages load each CSV in the full visualizer and check its chart rendering. The example exports are stored under `examples/`.

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
- `rdp-parser.js` — RDP CSV Code 1 through Code 9 parser
- `app.js` — directory access and Plotly renderer
- `examples/rdp-code-6-maxchi.csv` — supplied MaxChi example export
- `examples/rdp-code-7-chimaera.csv` — supplied CHIMAERA example export
- `examples/rdp-code-8-chimaera.csv` — supplied single-recombinant CHIMAERA export
- `images/rdp-code-8-reference.png` — corresponding RDP screenshot
- `tests/code8.html`, `tests/code8-preview.html` — Code 8 parser and rendering checks
- `tests/code6.html`, `tests/code6-preview.html`, `tests/code7.html`, and `tests/code7-preview.html` — browser checks for parsing and chart rendering

- `examples/rdp-code-9-phylpro.csv` — supplied PhylPro export
- `images/rdp-code-9-reference.png` — corresponding RDP screenshot
- `tests/code9.html`, `tests/code9-preview.html` — Code 9 parser and rendering checks

## Scope

This tool visualizes RDP output. It does not rerun recombination detection or independently validate an event.
