/**
 * geometry.js — Core SVG geometry primitives
 * ─────────────────────────────────────────────
 * All coordinates and dimensions in mm.
 * SVG viewBox unit = 1mm.
 *
 * CONVENTIONS
 *  - Outward normal: perpendicular to edge, pointing OUTSIDE the face
 *  - tab  : protrudes outward  (sign = +1)
 *  - notch: indents inward     (sign = -1)
 *  - free : straight line, no joint
 *
 * CORNER GUARANTEE
 *  n fingers is always ODD → first and last segments are always "flat".
 *  Every corner sits on a flat segment → no floating corner squares.
 */

export const F = (n, d = 3) => (+n).toFixed(d);

// ─────────────────────────────────────────────
// FINGER JOINT SEGMENT
// ─────────────────────────────────────────────

/**
 * Generate one edge's path with finger joints.
 *
 * @param {number} x0,y0  Start corner point (shared with previous edge)
 * @param {number} len    Edge length in mm
 * @param {number} fw     Target finger width in mm
 * @param {number} mat    Material thickness = tab/notch depth in mm
 * @param {string} type   'free' | 'tab' | 'notch'
 * @param {number} dx,dy  Unit vector along edge direction (CCW path)
 * @param {number} nx,ny  Unit vector pointing OUTWARD from face
 * @param {number} kerf   Laser kerf compensation in mm (default 0)
 *                        Applied ONLY to notches (mortaises) :
 *                          - width  += 2 × kerf  (kerf on each lateral wall)
 *                          - depth  += kerf       (kerf on the bottom wall)
 *                        Tabs (tenons) keep exact mat dimension.
 * @returns {string}      SVG path segment string (no leading M)
 */
export function fingerSeg(x0, y0, len, fw, mat, type, dx, dy, nx, ny, kerf = 0) {
  if (type === 'free') {
    return ` L${F(x0 + dx * len)},${F(y0 + dy * len)}`;
  }

  // Number of fingers — always ODD so corners are always flat
  let n = Math.max(3, Math.round(len / fw));
  if (n % 2 === 0) n++;

  const fa   = len / n;               // actual finger width (along edge)
  const sign = type === 'tab' ? 1 : -1;

  // Depth & lateral expansion
  // • tab   : exact mat, no kerf adjustment (the tab IS the board — keep 3 mm)
  // • notch : mat + kerf deeper, and widened by kerf on each side
  const depth   = type === 'notch' ? mat + kerf : mat;
  const lateral = type === 'notch' ? kerf        : 0;   // expansion per side along edge

  let px = x0, py = y0, seg = '';

  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) {
      // ── Flat segment ──
      // If next segment is a notch, shrink by lateral on the right side.
      // If previous segment was a notch, it already consumed lateral on its right.
      // Simplest correct approach: flat segments between notches are NOT shrunk —
      // instead the notch itself is widened by stepping ±lateral before/after.
      px += dx * fa;
      py += dy * fa;
      seg += ` L${F(px)},${F(py)}`;
    } else {
      // ── Tab or notch ──
      // For a notch: step back lateral along edge before entering, step forward after.
      px -= dx * lateral;  py -= dy * lateral;  // widen left side
      px += nx * sign * depth;  py += ny * sign * depth;  seg += ` L${F(px)},${F(py)}`;
      px += dx * (fa + 2 * lateral);  py += dy * (fa + 2 * lateral);  seg += ` L${F(px)},${F(py)}`;
      px -= nx * sign * depth;  py -= ny * sign * depth;  seg += ` L${F(px)},${F(py)}`;
      px -= dx * lateral;  py -= dy * lateral;  // restore position (net advance = fa)
    }
  }
  return seg;
}

// ─────────────────────────────────────────────
// COMPLETE FACE PATH
// ─────────────────────────────────────────────

/**
 * Build a closed SVG path for one face with finger joints on all 4 edges.
 *
 * @param {number} x,y    Top-left corner of face in net coordinates (mm)
 * @param {number} w,h    Face width and height (mm)
 * @param {object} edges  { top, right, bottom, left } each 'free'|'tab'|'notch'
 * @param {number} fw     Target finger width (mm)
 * @param {number} mat    Material thickness (mm)
 * @param {number} kerf   Laser kerf compensation (mm), default 0
 *                        Passed through to fingerSeg — only notches are affected.
 * @returns {string}      SVG path d attribute (closed)
 *
 * Edge directions (CCW path, outward normals):
 *   top    → right  (dx=1,dy=0)   normal up    (nx=0,ny=-1)
 *   right  ↓ down   (dx=0,dy=1)   normal right (nx=1,ny=0)
 *   bottom ← left   (dx=-1,dy=0)  normal down  (nx=0,ny=1)
 *   left   ↑ up     (dx=0,dy=-1)  normal left  (nx=-1,ny=0)
 */
export function facePath(x, y, w, h, edges, fw, mat, kerf = 0) {
  return (
    `M${F(x)},${F(y)}` +
    fingerSeg(x,     y,     w, fw, mat, edges.top,     1,  0,  0, -1, kerf) +
    fingerSeg(x + w, y,     h, fw, mat, edges.right,   0,  1,  1,  0, kerf) +
    fingerSeg(x + w, y + h, w, fw, mat, edges.bottom, -1,  0,  0,  1, kerf) +
    fingerSeg(x,     y + h, h, fw, mat, edges.left,    0, -1, -1,  0, kerf) +
    ' Z'
  );
}

// ─────────────────────────────────────────────
// BASIC SHAPES
// ─────────────────────────────────────────────

/** Rounded rectangle path */
export function roundRect(x, y, w, h, r = 0) {
  r = Math.min(Math.abs(r), w / 2, h / 2);
  if (r < 0.01) {
    return `M${F(x)},${F(y)} L${F(x+w)},${F(y)} L${F(x+w)},${F(y+h)} L${F(x)},${F(y+h)} Z`;
  }
  return (
    `M${F(x+r)},${F(y)} L${F(x+w-r)},${F(y)} Q${F(x+w)},${F(y)} ${F(x+w)},${F(y+r)} ` +
    `L${F(x+w)},${F(y+h-r)} Q${F(x+w)},${F(y+h)} ${F(x+w-r)},${F(y+h)} ` +
    `L${F(x+r)},${F(y+h)} Q${F(x)},${F(y+h)} ${F(x)},${F(y+h-r)} ` +
    `L${F(x)},${F(y+r)} Q${F(x)},${F(y)} ${F(x+r)},${F(y)} Z`
  );
}

/**
 * Arch shape: rectangle with shaped top.
 * @param {number} cx       Center X
 * @param {number} botY     Y of the bottom edge
 * @param {number} w        Total width
 * @param {number} h        Total height (including arch)
 * @param {string} archType 'flat' | 'semicircle' | 'ogive'
 */
export function archRect(cx, botY, w, h, archType = 'flat') {
  const hw  = w / 2;
  const top = botY - h;

  if (archType === 'flat') {
    return `M${F(cx-hw)},${F(botY)} L${F(cx-hw)},${F(top)} L${F(cx+hw)},${F(top)} L${F(cx+hw)},${F(botY)} Z`;
  }

  if (archType === 'semicircle') {
    const r    = hw;
    const flatTop = top + r;
    return (
      `M${F(cx-hw)},${F(botY)} L${F(cx-hw)},${F(flatTop)} ` +
      `A${F(r)},${F(r)} 0 0 1 ${F(cx+hw)},${F(flatTop)} ` +
      `L${F(cx+hw)},${F(botY)} Z`
    );
  }

  if (archType === 'ogive') {
    // Two circular arcs forming a pointed arch
    const r       = w * 0.65;
    const flatTop = top + hw * 0.55;
    return (
      `M${F(cx-hw)},${F(botY)} L${F(cx-hw)},${F(flatTop)} ` +
      `A${F(r)},${F(r)} 0 0 1 ${F(cx)},${F(top)} ` +
      `A${F(r)},${F(r)} 0 0 1 ${F(cx+hw)},${F(flatTop)} ` +
      `L${F(cx+hw)},${F(botY)} Z`
    );
  }

  throw new Error(`archRect: unknown archType '${archType}'`);
}

/** Circle (two 180° arcs — SVG can't do a full circle in one arc) */
export function circlePath(cx, cy, r) {
  return (
    `M${F(cx - r)},${F(cy)} ` +
    `A${F(r)},${F(r)} 0 1 0 ${F(cx + r)},${F(cy)} ` +
    `A${F(r)},${F(r)} 0 1 0 ${F(cx - r)},${F(cy)} Z`
  );
}

/** Straight line path (for engraving) */
export function linePath(x1, y1, x2, y2) {
  return `M${F(x1)},${F(y1)} L${F(x2)},${F(y2)}`;
}

// ─────────────────────────────────────────────
// SCALE HELPERS
// ─────────────────────────────────────────────

/**
 * Convert a real-world dimension to model dimension.
 * @param {number} realMM  Real dimension in mm
 * @param {number} scaleN  Scale denominator (e.g. 56 for 1:56)
 * @returns {number}       Model dimension in mm
 */
export function toModel(realMM, scaleN) {
  return realMM / scaleN;
}

/**
 * Convert a model dimension back to real-world mm.
 * @param {number} modelMM  Model dimension in mm
 * @param {number} scaleN   Scale denominator
 * @returns {number}        Real dimension in mm
 */
export function toReal(modelMM, scaleN) {
  return modelMM * scaleN;
}

/**
 * Reference dimensions for common medieval house elements at 1:1 (mm).
 * Use toModel(REF.xxx, scaleN) to get model dimensions.
 */
export const REF = {
  FLOOR_H:        2800,   // storey height
  DOOR_H:         2100,   // door opening height
  DOOR_W:          900,   // door opening width
  WINDOW_H:       1200,
  WINDOW_W:       1200,
  MEURTIERE_H:    1000,
  MEURTIERE_W:     150,
  BRICK_SIZE:      168,   // standard brick + mortar (68mm brick + 10mm joint × ~2.3)
  WALL_THICKNESS:  300,
};
