/**
 * svg_builder.js — 3-layer SVG accumulator
 * ─────────────────────────────────────────────
 * Collects cut / engrave / label elements and builds the final SVG string.
 *
 * LASER CONVENTIONS
 *  Cut layer    → stroke #FF0000, stroke-width 0.25 (industry standard)
 *  Engrave layer→ stroke #111111 or fill pattern
 *  Label layer  → purely visual, easily hidden in LightBurn / Inkscape
 *
 * INKSCAPE LAYER COMPATIBILITY
 *  Groups carry inkscape:label and inkscape:groupmode="layer" attributes
 *  so they appear as named layers when opened in Inkscape.
 */

import { F } from './geometry.js';

export class SVGBuilder {
  /**
   * @param {number} contentW   Total content width  (mm) — without padding
   * @param {number} contentH   Total content height (mm) — without padding
   * @param {number} padMM      Outer padding (mm), default 12
   */
  constructor(contentW, contentH, padMM = 12) {
    this._contentW = contentW;
    this._contentH = contentH;
    this._pad      = padMM;

    /** @private Inkscape/SVG defs (patterns, clipPaths) */
    this._defs     = [];
    /** @private Cut layer elements */
    this._cut      = [];
    /** @private Engrave layer elements */
    this._engrave  = [];
    /** @private Label layer elements */
    this._labels   = [];

    this._texPatId = null;
  }

  // ── Size helpers ────────────────────────────────────────────────

  get totalW() { return this._contentW + this._pad * 2; }
  get totalH() { return this._contentH + this._pad * 2; }

  /** Extend height after construction (e.g. to accommodate assembly parts) */
  extendHeight(extraMM) { this._contentH += extraMM; }

  // ── Content adders ─────────────────────────────────────────────

  /**
   * Add a cut path.
   * @param {string} d   SVG path data
   * @param {object} [extraAttrs]  Additional SVG attributes to merge
   */
  addCutPath(d, extraAttrs = {}) {
    const attrs = {
      fill: 'none',
      stroke: '#FF0000',
      'stroke-width': '0.25',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      ...extraAttrs,
    };
    this._cut.push(`<path d="${d}" ${svgAttrs(attrs)}/>`);
  }

  /**
   * Add an engrave path (stroke only).
   * @param {string} d   SVG path data
   */
  addEngravePath(d, extraAttrs = {}) {
    const attrs = {
      fill: 'none',
      stroke: '#111111',
      'stroke-width': '0.15',
      'stroke-linecap': 'round',
      ...extraAttrs,
    };
    this._engrave.push(`<path d="${d}" ${svgAttrs(attrs)}/>`);
  }

  /**
   * Fill a shape with the texture pattern (for engraving raster areas).
   * Requires setTexturePattern() to have been called.
   * @param {string} d   Clip path data (shape boundary)
   * @param {string} clipId  Unique clip ID
   */
  addEngraveFill(d, clipId) {
    if (!this._texPatId) return;
    this._defs.push(`<clipPath id="${clipId}"><path d="${d}"/></clipPath>`);
    this._engrave.push(
      `<path d="${d}" fill="url(#${this._texPatId})" stroke="none" clip-path="url(#${clipId})"/>`
    );
  }

  /**
   * Add raw SVG string to cut layer (for complex addon geometry).
   * @param {string} svg   Raw SVG elements (no wrapping tags needed)
   * @param {number} [tx]  Optional X translate
   * @param {number} [ty]  Optional Y translate
   */
  addCutRaw(svg, tx, ty) {
    this._cut.push(
      (tx !== undefined || ty !== undefined)
        ? `<g transform="translate(${F(tx||0)},${F(ty||0)})">${svg}</g>`
        : svg
    );
  }

  addEngraveRaw(svg, tx, ty) {
    this._engrave.push(
      (tx !== undefined || ty !== undefined)
        ? `<g transform="translate(${F(tx||0)},${F(ty||0)})">${svg}</g>`
        : svg
    );
  }

  addLabelRaw(svg, tx, ty) {
    this._labels.push(
      (tx !== undefined || ty !== undefined)
        ? `<g transform="translate(${F(tx||0)},${F(ty||0)})">${svg}</g>`
        : svg
    );
  }

  /**
   * Add a text label.
   * @param {number} cx      Center X (net coords)
   * @param {number} cy      Baseline Y
   * @param {string} text
   * @param {number} [size]  Font size in mm, default 5
   * @param {string} [fill]  CSS color, default #1a1a1a
   */
  addLabel(cx, cy, text, size = 5, fill = '#1a1a1a') {
    this._labels.push(
      `<text x="${F(cx)}" y="${F(cy)}" ` +
      `text-anchor="middle" dominant-baseline="middle" ` +
      `font-size="${F(size, 1)}" fill="${fill}" font-family="monospace">${escapeXML(text)}</text>`
    );
  }

  /**
   * Register a texture pattern (SVG <pattern> element string).
   * @param {string} patternDef   Full <pattern ...>...</pattern> string
   * @param {string} [patId]      Pattern id attribute (must match what patternDef declares)
   */
  setTexturePattern(patternDef, patId = 'tex') {
    this._defs.push(patternDef);
    this._texPatId = patId;
  }

  addDef(svgDef) {
    this._defs.push(svgDef);
  }

  // ── Scale bar ───────────────────────────────────────────────────

  /**
   * Append a 10 mm scale bar at the given net coordinates.
   */
  addScaleBar(x, y, barMM = 10) {
    const el =
      `<line x1="${F(x)}" y1="${F(y)}" x2="${F(x+barMM)}" y2="${F(y)}" stroke="#999" stroke-width="0.2"/>` +
      `<line x1="${F(x)}" y1="${F(y-1.2)}" x2="${F(x)}" y2="${F(y+1.2)}" stroke="#999" stroke-width="0.2"/>` +
      `<line x1="${F(x+barMM)}" y1="${F(y-1.2)}" x2="${F(x+barMM)}" y2="${F(y+1.2)}" stroke="#999" stroke-width="0.2"/>` +
      `<text x="${F(x+barMM/2)}" y="${F(y-2.5)}" text-anchor="middle" ` +
      `font-size="3" fill="#999" font-family="monospace">${barMM} mm</text>`;
    this._cut.push(`<g id="scale-bar">${el}</g>`);
  }

  // ── Final build ─────────────────────────────────────────────────

  /**
   * Assemble and return the complete SVG string.
   * @returns {string}
   */
  build() {
    const W = this.totalW;
    const H = this.totalH;

    const pad = this._pad;
    const lines = [
      `<svg xmlns="http://www.w3.org/2000/svg"`,
      `     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"`,
      `     width="${F(W)}mm" height="${F(H)}mm"`,
      `     viewBox="0 0 ${F(W)} ${F(H)}">`,

      this._defs.length
        ? `  <defs>\n    ${this._defs.join('\n    ')}\n  </defs>`
        : '',

      // Shift all content by padMM so it sits centred in the SVG
      `  <g transform="translate(${F(pad)},${F(pad)})">`,
      layer('layer-engrave', 'Gravure',    this._engrave),
      layer('layer-cut',     'Découpe',    this._cut),
      layer('layer-labels',  'Étiquettes', this._labels),
      `  </g>`,

      `</svg>`,
    ];

    return lines.filter(Boolean).join('\n');
  }

  /**
   * Trigger a browser download of the SVG.
   * @param {string} [filename]
   */
  download(filename = 'patron.svg') {
    const blob = new Blob([this.build()], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ─────────────────────────────────────────────
// TEXTURE LOADERS  (static helpers, no class)
// ─────────────────────────────────────────────

/**
 * Load an SVG file from a File object and return a <pattern> definition string.
 * The pattern tiles at the physical size of the SVG (scaled by DPI to mm).
 *
 * @param {File}   file     .svg file
 * @param {number} dpi      DPI assumption for the SVG's own width/height
 * @param {string} [patId]  Pattern id
 * @returns {Promise<string>}  <pattern>…</pattern> string
 */
export function loadSVGPattern(file, dpi = 96, patId = 'tex') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const parser = new DOMParser();
      const doc    = parser.parseFromString(e.target.result, 'image/svg+xml');
      const svgEl  = doc.querySelector('svg');
      if (!svgEl) return reject(new Error('Invalid SVG'));

      const vb = (svgEl.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const vW = vb[2] || parseFloat(svgEl.getAttribute('width'))  || dpi;
      const vH = vb[3] || parseFloat(svgEl.getAttribute('height')) || dpi;

      // Physical tile size in mm
      const tileW = (vW / dpi) * 25.4;
      const tileH = (vH / dpi) * 25.4;

      const ser   = new XMLSerializer();
      const inner = Array.from(svgEl.children).map(c => ser.serializeToString(c)).join('');

      const vbStr = vb.length >= 4
        ? vb.join(' ')
        : `0 0 ${vW} ${vH}`;

      resolve(
        `<pattern id="${patId}" patternUnits="userSpaceOnUse" ` +
        `width="${tileW.toFixed(3)}" height="${tileH.toFixed(3)}">` +
        `<svg viewBox="${vbStr}" width="${tileW.toFixed(3)}" height="${tileH.toFixed(3)}" ` +
        `xmlns="http://www.w3.org/2000/svg">${inner}</svg>` +
        `</pattern>`
      );
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Load a raster image (PNG/JPG) from a File object and return a <pattern> string.
 * @param {File}   file
 * @param {number} dpi
 * @param {string} [patId]
 * @returns {Promise<string>}
 */
export function loadRasterPattern(file, dpi = 300, patId = 'tex') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const tileW = (img.naturalWidth  / dpi) * 25.4;
        const tileH = (img.naturalHeight / dpi) * 25.4;
        resolve(
          `<pattern id="${patId}" patternUnits="userSpaceOnUse" ` +
          `width="${tileW.toFixed(3)}" height="${tileH.toFixed(3)}">` +
          `<image href="${e.target.result}" ` +
          `width="${tileW.toFixed(3)}" height="${tileH.toFixed(3)}"/>` +
          `</pattern>`
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Detect file type and dispatch to the right loader.
 * @param {File}   file
 * @param {number} dpi
 * @returns {Promise<string>}
 */
export async function loadPattern(file, dpi = 300) {
  const isSVG = file.name.toLowerCase().endsWith('.svg') ||
                file.type === 'image/svg+xml';
  return isSVG
    ? loadSVGPattern(file, dpi)
    : loadRasterPattern(file, dpi);
}

// ─────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────

function layer(id, inkscapeLabel, elements) {
  if (!elements.length) return '';
  return (
    `  <g id="${id}" ` +
    `inkscape:label="${inkscapeLabel}" ` +
    `inkscape:groupmode="layer">\n` +
    elements.map(e => '    ' + e).join('\n') +
    `\n  </g>`
  );
}

function svgAttrs(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}="${v}"`).join(' ');
}

function escapeXML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
