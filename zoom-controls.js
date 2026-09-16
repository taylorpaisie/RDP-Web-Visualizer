/* Safer, deliberate zoom controls for the RDP Plotly figure. */
(() => {
  if (!document.querySelector('script[data-rdp-contact]')) {
    const contactScript = document.createElement('script');
    contactScript.src = 'contact.js';
    contactScript.defer = true;
    contactScript.dataset.rdpContact = 'true';
    document.head.append(contactScript);
  }

  const plotly = window.Plotly;
  if (!plotly) return;

  const ZOOM_IN_FACTOR = 0.85;
  const PAN_FRACTION = 0.12;
  const originalReact = plotly.react.bind(plotly);

  function copyRange(range) {
    return Array.isArray(range) && range.length === 2 ? [Number(range[0]), Number(range[1])] : null;
  }

  function rememberInitialView(gd, layout) {
    const x = copyRange(layout?.xaxis?.range);
    const x2 = copyRange(layout?.xaxis2?.range);
    const y = copyRange(layout?.yaxis?.range);
    const y2 = copyRange(layout?.yaxis2?.range);
    if (!x2 || !y2) return;
    gd.__rdpInitialView = { x, x2, y, y2 };
  }

  plotly.react = function saferReact(gd, data, layout = {}, config = {}) {
    if (gd?.id !== 'rdp-plot') return originalReact(gd, data, layout, config);

    rememberInitialView(gd, layout);
    const safeLayout = { ...layout, dragmode: 'pan' };
    const safeConfig = {
      ...config,
      scrollZoom: false,
      doubleClick: false,
    };

    const rendered = originalReact(gd, data, safeLayout, safeConfig);
    Promise.resolve(rendered).then(() => {
      gd.tabIndex = 0;
      gd.setAttribute('aria-label', `${gd.getAttribute('aria-label') || 'RDP event visualization'}. Zoom with the toolbar or plus/minus keys; arrow keys pan; double-click resets.`);
    });
    return rendered;
  };

  function plot() {
    return document.querySelector('#rdp-plot');
  }

  function currentXRange(gd) {
    return copyRange(gd?._fullLayout?.xaxis2?.range) || copyRange(gd?.layout?.xaxis2?.range) || copyRange(gd?.__rdpInitialView?.x2);
  }

  function initialXRange(gd) {
    return copyRange(gd?.__rdpInitialView?.x2);
  }

  function clampRange(range, bounds) {
    if (!range || !bounds) return range;
    const fullSpan = bounds[1] - bounds[0];
    const span = range[1] - range[0];
    if (span >= fullSpan) return [...bounds];
    let [lo, hi] = range;
    if (lo < bounds[0]) {
      hi += bounds[0] - lo;
      lo = bounds[0];
    }
    if (hi > bounds[1]) {
      lo -= hi - bounds[1];
      hi = bounds[1];
    }
    return [Math.max(bounds[0], lo), Math.min(bounds[1], hi)];
  }

  function setXRange(gd, range) {
    if (!gd || !range) return;
    plotly.relayout(gd, {
      'xaxis.range': range,
      'xaxis2.range': range,
    });
  }

  function zoom(factor) {
    const gd = plot();
    const range = currentXRange(gd);
    const bounds = initialXRange(gd);
    if (!range || !bounds) return;
    const center = (range[0] + range[1]) / 2;
    const half = ((range[1] - range[0]) * factor) / 2;
    setXRange(gd, clampRange([center - half, center + half], bounds));
  }

  function pan(direction) {
    const gd = plot();
    const range = currentXRange(gd);
    const bounds = initialXRange(gd);
    if (!range || !bounds) return;
    const shift = (range[1] - range[0]) * PAN_FRACTION * direction;
    setXRange(gd, clampRange([range[0] + shift, range[1] + shift], bounds));
  }

  function resetView() {
    const gd = plot();
    const initial = gd?.__rdpInitialView;
    if (!gd || !initial) return;
    const update = {};
    if (initial.x) update['xaxis.range'] = initial.x;
    if (initial.x2) update['xaxis2.range'] = initial.x2;
    if (initial.y) update['yaxis.range'] = initial.y;
    if (initial.y2) update['yaxis2.range'] = initial.y2;
    plotly.relayout(gd, update);
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .view-controls{display:inline-flex;align-items:center;gap:5px;padding-right:3px}
      .view-control{min-width:34px;min-height:36px;padding:6px 9px;border:1px solid #34455c;border-radius:9px;background:#111c2c;color:#dce6f3;font:700 .78rem/1 Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
      .view-control:hover{background:#172438;border-color:#52657f;transform:translateY(-1px)}
      .view-control.reset{min-width:auto;padding-inline:11px}
      .zoom-help{display:block;margin:0 18px 9px;color:#7f8fa5;font-size:.67rem;line-height:1.4;text-align:right}
      #rdp-plot:focus{outline:2px solid rgba(96,165,250,.55);outline-offset:-2px;border-radius:8px}
      @media(max-width:760px){.zoom-help{text-align:left}.view-control.reset{padding-inline:8px}}
    `;
    document.head.append(style);
  }

  function button(label, title, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `view-control ${className || ''}`.trim();
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('click', () => {
      onClick();
      plot()?.focus({ preventScroll: true });
    });
    return btn;
  }

  function installControls() {
    const exportControls = document.querySelector('.export-controls');
    const plotFrame = document.querySelector('.plot-frame');
    if (!exportControls || !plotFrame || document.querySelector('.view-controls')) return;

    const group = document.createElement('div');
    group.className = 'view-controls';
    group.setAttribute('aria-label', 'Plot view controls');
    group.append(
      button('−', 'Zoom out', '', () => zoom(1 / ZOOM_IN_FACTOR)),
      button('+', 'Zoom in', '', () => zoom(ZOOM_IN_FACTOR)),
      button('Reset', 'Reset graph to original view', 'reset', resetView),
    );
    exportControls.prepend(group);

    const help = document.createElement('small');
    help.className = 'zoom-help';
    help.textContent = 'Trackpad/wheel zoom is disabled · +/− zoom · ←/→ pan · 0 or double-click resets';
    plotFrame.before(help);

    const gd = plot();
    if (!gd) return;
    gd.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetView();
    }, true);
    gd.addEventListener('click', () => gd.focus({ preventScroll: true }));
    gd.addEventListener('keydown', (event) => {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoom(ZOOM_IN_FACTOR);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoom(1 / ZOOM_IN_FACTOR);
      } else if (event.key === '0' || event.key === 'Home') {
        event.preventDefault();
        resetView();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        pan(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        pan(1);
      }
    });
  }

  addStyles();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installControls, { once: true });
  } else {
    installControls();
  }
})();
