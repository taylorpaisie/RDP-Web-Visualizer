# RDP Web Visualizer

A browser-only visualizer for RDP5 CSV exports. No Python, Conda, Docker, or local server is required.

The app currently supports **RDP CSV Code 1 and Code 2**, based on real exports from RDP v5.93. It recreates the event view as an interactive Plotly figure with:

- a six-track ORF map labeled `+1`, `+2`, `+3`, `-1`, `-2`, `-3`;
- ORF direction arrowheads derived from the RDP orientation field;
- Code 1 pairwise-comparison curves;
- Code 2 GENECONV box plots;
- beginning and ending breakpoint calls;
- 95% and 99% breakpoint confidence intervals;
- event metadata and gene tables; and
- high-resolution PNG export.

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

## Privacy

CSV content is processed in the browser. The app does not upload the selected RDP files to a server.

## Supported RDP formats

The parser is intentionally grounded on supplied real examples rather than guessing undocumented formats. It recognizes:

- `Gene start`, `Gene end`, frame, and orientation rows;
- `CSV Code` and event metadata;
- beginning/ending breakpoint sites;
- 95% and 99% breakpoint confidence intervals;
- plot colors and comparison roles;
- Code 1 numerical line-plot data; and
- Code 2 three-batch box coordinates, transparency, and upper cutoff.

Additional RDP CSV codes should be added from real example exports.

## Local development

Because this is a static site, any simple local web server works. For example:

```bash
python -m http.server 8000
```

This is only for development. End users do **not** need Python when using the GitHub Pages site.

## GitHub Pages

A Pages deployment workflow is included under `.github/workflows/pages.yml`. If Pages is not already enabled, open **Settings → Pages** for the repository and select **GitHub Actions** as the source.

## Files

- `index.html` — app shell and controls
- `styles.css` — responsive visual design
- `rdp-parser.js` — RDP CSV Code 1 and Code 2 parser
- `app.js` — directory access and Plotly renderer

## Scope

This tool visualizes RDP output. It does not rerun recombination detection or independently validate an event.
