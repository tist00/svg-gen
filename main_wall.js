/**
 * main_wall.js — Main orchestrator
 * ─────────────────────────────────────────────
 * Ties together geometry, placer, svg_builder and all addon modules
 * to produce the final 3-layer SVG.
 *
 * USAGE
 *   import { generateMainWall } from './main_wall.js';
 *
 *   const svg = await generateMainWall(params, addonRequests, texPatternDef);
 *   document.getElementById('preview').innerHTML = svg.build();
 *   svg.download('ma_maison.svg');
 *
 * ADDON REQUEST FORMAT  (from face_model.createAddonRequest)
 *   {
 *     faceId:      'front',          // which face
 *     addonModule: meurtiereModule,  // imported addon object
 *     count:       2,                // how many instances (auto-placed)
 *     params:      { ... }           // addon-specific overrides
 *   }
 */

import { facePath, F }                        from './geometry.js';
import { FACE_NAMES, ADDON_FACES }            from './face_model.js';
import { SVGBuilder }                         from './svg_builder.js';
import {
  computeNetLayout,
  computeEdgeTypes,
  computeFloorPanels,
  netBounds,
  validateAddon,
  autoPlaceAddons,
}                                             from './placer.js';

// ─────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────

/**
 * Generate a complete box SVG (3 layers).
 *
 * @param {BuildParams}        params         From createBuildParams()
 * @param {AddonRequest[]}     addonRequests  From createAddonRequest() — may be empty
 * @param {string|null}        texPatternDef  <pattern> SVG string, or null
 *
 * @returns {SVGBuilder}  Call .build() for the SVG string, .download() to save
 */
export async function generateMainWall(params, addonRequests = [], texPatternDef = null) {
  const { X, Y, Z, nFloors, scaleN, mat, fw, kerf = 0, mode, padMM, minSpacing } = params;

  // ── 1. Layout ───────────────────────────────────────────────────
  const faceLayouts  = computeNetLayout(X, Y, Z, mat, mode, nFloors);
  const bounds       = netBounds(faceLayouts);

  // We'll extend the SVG height dynamically as we add floor panels + assembly parts
  let totalContentH = bounds.h;

  // ── 2. Floor panels (multi-storey) ──────────────────────────────
  const floorPanels = computeFloorPanels(
    X, Z, mat, nFloors,
    bounds.y + bounds.h + 15    // start below main net
  );
  if (floorPanels.length) {
    const lastFloor = floorPanels[floorPanels.length - 1];
    totalContentH = Math.max(totalContentH, lastFloor.y + lastFloor.h - bounds.y);
  }

  // ── 3. Initialise builder ────────────────────────────────────────
  const builder = new SVGBuilder(bounds.w, totalContentH, padMM);
  if (texPatternDef) builder.setTexturePattern(texPatternDef);

  // ── 4. Draw main faces ──────────────────────────────────────────
  for (const fl of faceLayouts) {
    drawFace(fl, builder, params, texPatternDef, nFloors, Y);
  }

  // ── 5. Draw floor panels ────────────────────────────────────────
  const allTabEdges = { top: 'tab', right: 'tab', bottom: 'tab', left: 'tab' };
  for (const fp of floorPanels) {
    // Floor panels have only tabs → kerf has no effect here, but pass it for consistency
    const path = facePath(fp.x, fp.y, fp.w, fp.h, allTabEdges, fw, mat, kerf);
    builder.addCutPath(path);
    const cx = fp.x + fp.w / 2;
    const cy = fp.y + fp.h / 2;
    addFaceLabel(builder, cx, cy, `Plancher ${fp.id}`, fp.w, fp.h);
  }

  // ── 6. Process addon requests ────────────────────────────────────
  /** Map: addonId → { module, params, instanceCount } */
  const assemblyMap = {};

  for (const req of addonRequests) {
    const { faceId, addonModule, count = 1, params: addonParams = {} } = req;
    const fl = faceLayouts.find(f => f.id === faceId);
    if (!fl) continue;

    // 6a. Validate
    const val = validateAddon(fl, addonModule, scaleN, addonParams, minSpacing);
    if (!val.ok) {
      builder.addLabelRaw(warnLabel(fl.x + fl.w / 2, fl.y - 3, val.reason));
      continue;
    }

    // 6b. Auto-place instances
    const positions = autoPlaceAddons(fl, addonModule, count, scaleN, mat, minSpacing);
    if (!positions) {
      builder.addLabelRaw(warnLabel(fl.x + fl.w / 2, fl.y - 3,
        `Trop d'éléments (${count}) pour cette face (${fl.w.toFixed(0)}mm)`));
      continue;
    }

    // 6c. Apply wall cuts for each instance
    for (const pos of positions) {
      // Convert face-local coords to net coords
      const netCX = fl.x + pos.cx;
      const netCY = fl.y + pos.cy;

      const cuts = addonModule.getWallCuts(netCX, netCY, scaleN, mat, kerf, addonParams);
      for (const c of cuts) {
        if      (c.type === 'cut')     builder.addCutPath(c.path);
        else if (c.type === 'engrave') builder.addEngravePath(c.path);
      }
    }

    // 6d. Collect assembly parts (deduplicated by addon type)
    if (!assemblyMap[addonModule.id]) {
      assemblyMap[addonModule.id] = {
        module:    addonModule,
        params:    addonParams,
        instances: 0,
      };
    }
    assemblyMap[addonModule.id].instances += count;
  }

  // ── 7. Draw assembly parts area ─────────────────────────────────
  let assemblyY = bounds.y + totalContentH + 20;

  for (const entry of Object.values(assemblyMap)) {
    const { module: m, params: ap, instances } = entry;
    const parts = m.getAssemblyParts(scaleN, mat, ap);

    // Section label
    builder.addLabelRaw(
      `<text x="${F(bounds.x)}" y="${F(assemblyY - 4)}" ` +
      `font-size="3.5" fill="#333" font-family="monospace">` +
      `— Pièces ${m.label} (×${instances}) —</text>`
    );

    // Multiply parts across N instances  (simple horizontal row)
    const partW = parts.width  || 40;
    const partH = parts.height || 40;
    const gapX  = 5;

    for (let i = 0; i < instances; i++) {
      const tx = bounds.x + i * (partW + gapX);
      const ty = assemblyY;

      if (parts.cut)     builder.addCutRaw(parts.cut,     tx, ty);
      if (parts.engrave) builder.addEngraveRaw(parts.engrave, tx, ty);
      if (parts.labels)  builder.addLabelRaw(parts.labels,  tx, ty);
    }

    assemblyY += partH + 15;
    builder.extendHeight(partH + 15);
  }

  // ── 8. Scale bar ─────────────────────────────────────────────────
  builder.addScaleBar(bounds.x, bounds.y + bounds.h + 6);

  return builder;
}

// ─────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────

function drawFace(fl, builder, params, texPatternDef, nFloors, floorY) {
  const { fw, mat, kerf = 0, scaleN } = params;
  const path = facePath(fl.x, fl.y, fl.w, fl.h, fl.edges, fw, mat, kerf);

  // ── Engrave: texture fill (clipped to face outline) ──
  if (texPatternDef) {
    const clipId = `clip-${fl.id}`;
    builder.addDef(`<clipPath id="${clipId}"><path d="${path}"/></clipPath>`);
    builder.addEngraveRaw(
      `<path d="${path}" fill="url(#tex)" stroke="none" clip-path="url(#${clipId})"/>`
    );
  }

  // ── Cut: face outline ──
  builder.addCutPath(path);

  // ── Engrave: multi-floor lines ──
  if (nFloors > 1 && ADDON_FACES.includes(fl.id)) {
    for (let f = 1; f < nFloors; f++) {
      const lineY = fl.y + floorY * f;
      builder.addEngravePath(`M${F(fl.x)},${F(lineY)} L${F(fl.x + fl.w)},${F(lineY)}`);
    }
  }

  // ── Labels: face name + dimensions ──
  const cx = fl.x + fl.w / 2;
  const cy = fl.y + fl.h / 2;
  addFaceLabel(builder, cx, cy, FACE_NAMES[fl.id] || fl.id, fl.w, fl.h);
}

function addFaceLabel(builder, cx, cy, name, w, h) {
  const fs  = Math.max(3, Math.min(7, Math.min(w, h) * 0.11));
  const dim = `${w.toFixed(1)} × ${h.toFixed(1)} mm`;
  builder.addLabelRaw(
    `<text x="${F(cx)}" y="${F(cy - fs * 0.65)}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-size="${F(fs, 1)}" font-weight="500" fill="#111" font-family="monospace">${name}</text>` +
    `<text x="${F(cx)}" y="${F(cy + fs * 0.75)}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-size="${F(fs * 0.78, 1)}" fill="#555" font-family="monospace">${dim}</text>`
  );
}

function warnLabel(cx, y, text) {
  return (
    `<text x="${F(cx)}" y="${F(y)}" text-anchor="middle" ` +
    `font-size="3" fill="#e8341a" font-family="monospace">⚠ ${text}</text>`
  );
}
