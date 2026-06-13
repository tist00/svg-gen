/**
 * placer.js — Net layout, edge types, addon placement & validation
 * ─────────────────────────────────────────────────────────────────
 *
 * NET LAYOUT  (cross pattern, left→right)
 *
 *             ┌──────────┐
 *             │  top     │  X × Z
 *             │  (opt.)  │
 *  ┌────┬─────┴──────┬────┬──────────┐
 *  │left│   front    │right│  back   │
 *  │Z×Y │   X × Y   │Z×Y │  X × Y  │
 *  └────┴─────┬──────┴────┴──────────┘
 *             │  bottom  │  X × Z
 *             │  (opt.)  │
 *             └──────────┘
 *
 * Gaps between adjacent faces = mat (material thickness),
 * so that tab protrusions don't visually overlap neighbors.
 *
 * EDGE TYPE TABLE (fully consistent — every shared edge is tab↔notch)
 *
 *  Face    top     right   bottom  left
 *  top     tab     tab     tab     tab     ← all-tab; slots INTO vertical walls
 *  bottom  tab     tab     tab     tab
 *  front   notch   tab     notch   notch
 *  back    notch   tab     notch   notch
 *  left    notch   tab     notch   notch
 *  right   notch   tab     notch   notch
 *
 * Every pair checks out:
 *  top.bottom=tab    ↔ front.top=notch    ✓
 *  top.left=tab      ↔ left.top=notch     ✓
 *  top.right=tab     ↔ right.top=notch    ✓
 *  top.top=tab       ↔ back.top=notch     ✓  (3D fold)
 *  front.left=notch  ↔ left.right=tab     ✓
 *  front.right=tab   ↔ right.left=notch   ✓  (wait — front.right=tab means front protrudes right)
 *
 * NOTE: front.right=tab, right.left should be notch.
 *       In table: right.left = notch ✓
 *       right.right=tab ↔ back.left=notch ✓
 *       back.right=tab ↔ left.left=notch ✓  (3D fold)
 */

import { createFaceLayout } from './face_model.js';

// ─────────────────────────────────────────────
// EDGE TYPES
// ─────────────────────────────────────────────

const BASE_EDGES = {
  top:    { top: 'tab',   right: 'tab', bottom: 'tab',   left: 'notch' },
  bottom: { top: 'tab',   right: 'tab', bottom: 'tab',   left: 'notch' },
  front:  { top: 'notch', right: 'tab', bottom: 'notch', left: 'notch' },
  back:   { top: 'notch', right: 'tab', bottom: 'notch', left: 'notch' },
  left:   { top: 'notch', right: 'tab', bottom: 'notch', left: 'notch' },
  right:  { top: 'notch', right: 'tab', bottom: 'notch', left: 'notch' },
};

/**
 * Compute edge types for all faces, adjusted for box mode.
 *
 * @param {string} mode  'closed' | 'open' | 'frame'
 * @returns {object}     Map { faceId: { top, right, bottom, left } }
 */
export function computeEdgeTypes(mode) {
  // Deep copy so we don't mutate BASE_EDGES
  const E = {};
  for (const [id, edges] of Object.entries(BASE_EDGES)) {
    E[id] = { ...edges };
  }

  if (mode === 'open' || mode === 'frame') {
    // No top face → top edges of vertical walls become free (open rim)
    for (const id of ['front', 'back', 'left', 'right']) {
      E[id].top = 'free';
    }
    // top face itself has no joint on its outer edges now (it won't be generated)
  }

  if (mode === 'frame') {
    // No bottom face either
    for (const id of ['front', 'back', 'left', 'right']) {
      E[id].bottom = 'free';
    }
  }

  return E;
}

// ─────────────────────────────────────────────
// NET LAYOUT
// ─────────────────────────────────────────────

/**
 * Compute the net (flat layout) positions for all faces.
 *
 * @param {number} X        Box width  mm
 * @param {number} Y        Box height mm per floor
 * @param {number} Z        Box depth  mm
 * @param {number} mat      Material thickness mm (gap between faces)
 * @param {string} mode     'closed' | 'open' | 'frame'
 * @param {number} nFloors  Number of storeys
 * @returns {FaceLayout[]}  Array of face layout objects
 */
export function computeNetLayout(X, Y, Z, mat, mode, nFloors = 1) {
  const g       = mat;              // gap between faces = material thickness
  const totalY  = Y * nFloors;     // total wall height
  const layouts = [];
  const edgeMap = computeEdgeTypes(mode);

  /**
   * Helper: create and push a face layout.
   */
  const push = (id, x, y, w, h) => {
    const edges = edgeMap[id] || { top: 'free', right: 'free', bottom: 'free', left: 'free' };
    layouts.push(createFaceLayout(id, x, y, w, h, { ...edges }));
  };

  // ── Main ring of vertical faces ──────────────────────────────
  // Row Y offset: faces start below the top panel (Z + gap)
  const rowY = Z + g;

  push('left',  0,                       rowY, Z, totalY);
  push('front', Z + g,                   rowY, X, totalY);
  push('right', Z + g + X + g,           rowY, Z, totalY);
  push('back',  Z + g + X + g + Z + g,   rowY, X, totalY);

  // ── Horizontal caps ──────────────────────────────────────────
  if (mode !== 'open' && mode !== 'frame') {
    push('top', Z + g, 0, X, Z);
  }
  if (mode === 'closed') {
    push('bottom', Z + g, rowY + totalY + g, X, Z);
  }

  return layouts;
}

/**
 * Compute the net bounding box (without padding).
 *
 * @param {FaceLayout[]} layouts
 * @returns {{ x, y, w, h }}
 */
export function netBounds(layouts) {
  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const f of layouts) {
    minX = Math.min(minX, f.x);
    minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.w);
    maxY = Math.max(maxY, f.y + f.h);
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ─────────────────────────────────────────────
// INTERMEDIATE FLOOR PANELS
// ─────────────────────────────────────────────

/**
 * Generate floor panel layout records for multi-storey boxes.
 * Each intermediate floor is an X×Z panel placed below the main net.
 *
 * @param {number} X
 * @param {number} Z
 * @param {number} mat
 * @param {number} nFloors
 * @param {number} netBottomY  Y coordinate of the bottom of the main net (+ pad)
 * @returns {FaceLayout[]}     Floor panel layouts (id: 'floor1', 'floor2', …)
 */
export function computeFloorPanels(X, Z, mat, nFloors, netBottomY) {
  if (nFloors <= 1) return [];

  const allTabEdges = { top: 'tab', right: 'tab', bottom: 'tab', left: 'tab' };
  const panels = [];

  for (let f = 1; f < nFloors; f++) {
    const y = netBottomY + (f - 1) * (Z + 10);   // 10mm gap between panels
    panels.push(createFaceLayout(`floor${f}`, 0, y, X, Z, { ...allTabEdges }));
  }

  return panels;
}

// ─────────────────────────────────────────────
// ADDON VALIDATION
// ─────────────────────────────────────────────

/**
 * Check whether an addon can fit on a given face.
 *
 * @param {FaceLayout} face
 * @param {object}     addonModule
 * @param {number}     scaleN
 * @param {object}     params
 * @param {number}     minSpacing
 * @returns {{ ok: boolean, reason: string }}
 */
export function validateAddon(face, addonModule, scaleN, params = {}, minSpacing = 8) {
  const requiredW = addonModule.minWidth(scaleN);
  const requiredH = addonModule.minHeight(scaleN);
  const margin    = minSpacing * 2;

  if (face.w < requiredW + margin) {
    return {
      ok: false,
      reason: `Face trop étroite : ${face.w.toFixed(1)} mm disponible, ${(requiredW + margin).toFixed(1)} mm requis`,
    };
  }
  if (face.h < requiredH + margin) {
    return {
      ok: false,
      reason: `Face trop basse : ${face.h.toFixed(1)} mm disponible, ${(requiredH + margin).toFixed(1)} mm requis`,
    };
  }

  return { ok: true, reason: '' };
}

// ─────────────────────────────────────────────
// ADDON AUTO-PLACEMENT
// ─────────────────────────────────────────────

/**
 * Evenly distribute N addon instances across a face (single horizontal row).
 * Centers them vertically at 55% of face height (slight visual emphasis on upper portion).
 *
 * @param {FaceLayout} face
 * @param {object}     addonModule
 * @param {number}     count
 * @param {number}     scaleN
 * @param {number}     mat
 * @param {number}     minSpacing
 * @returns {Array<{cx,cy}>|null}  Face-local coordinates, or null if they don't fit
 */
export function autoPlaceAddons(face, addonModule, count, scaleN, mat, minSpacing) {
  const aw     = addonModule.minWidth(scaleN);
  const ah     = addonModule.minHeight(scaleN);
  const margin = mat * 2 + minSpacing;

  // Check horizontal fit
  const availableW = face.w - 2 * margin;
  const needed     = count * aw + (count - 1) * minSpacing;
  if (needed > availableW) return null;

  // Check vertical fit
  const availableH = face.h - 2 * margin;
  if (ah > availableH) return null;

  const startX = margin + aw / 2 + (availableW - needed) / 2;
  const cy     = face.h * 0.52;   // slightly above centre

  return Array.from({ length: count }, (_, i) => ({
    cx: startX + i * (aw + minSpacing),
    cy,
  }));
}

// ─────────────────────────────────────────────
// COLLISION HELPERS
// ─────────────────────────────────────────────

/**
 * Check whether two axis-aligned rectangles overlap (with optional clearance).
 *
 * @param {{ x,y,w,h }} a
 * @param {{ x,y,w,h }} b
 * @param {number}      clearance  Minimum gap (mm), default 0
 * @returns {boolean}
 */
export function rectsOverlap(a, b, clearance = 0) {
  return !(
    a.x + a.w + clearance <= b.x ||
    b.x + b.w + clearance <= a.x ||
    a.y + a.h + clearance <= b.y ||
    b.y + b.h + clearance <= a.y
  );
}
