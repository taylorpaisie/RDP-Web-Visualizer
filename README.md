# RDP Web Visualizer

A browser-only visualizer for RDP5 CSV exports. No Python, Conda, Docker, or local server is required.

The first supported format is **RDP CSV Code 1**, based on a real event-plot export from RDP v5.93. The app recreates the event view as an interactive Plotly figure with:

- the gene map from the export;
- three pairwise-comparison curves;
- beginning and ending breakpoint calls;
- 95% and 99% breakpoint confidence intervals;
- event metadata and gene tables; and
- high-resolution PNG export.

## Use the web app

Once GitHub Pages is enabled for this repository, open:

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

## Supported RDP format

The current parser is intentionally grounded on a supplied **CSV Code 1** example rather than guessing undocumented formats. It recognizes:

- `Gene start`, `Gene end`, frame, and orientation rows;
- `CSV Code` and event metadata;
- beginning/ending breakpoint sites;
- 95% and 99% breakpoint confidence intervals;
- plot colors and comparison roles; and
- the numerical `Plot data` section.

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
- `app.js` — directory access, Code 1 parser, and Plotly renderer

## Scope

This tool visualizes RDP output. It does not rerun recombination detection or independently validate an event.
