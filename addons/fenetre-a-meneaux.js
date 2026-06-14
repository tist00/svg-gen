/**
 * fenetre-a-meneaux.js — Fenêtre à meneaux médiévale
 * ────────────────────────────────────────────────────────
 * Fenêtre rectangulaire avec meneaux (barreaux verticaux/horizontaux).
 *
 * 3 éléments livrés :
 *   A. Découpe mur hôte : ouverture rectangulaire + meneaux gravés
 *   B. Pièce 1 : Cadre fenêtre (anneau rectangulaire, à coller en relief sur le mur)
 *   C. Pièce 2 : Meneaux séparés (grille à emboîter dans le cadre)
 *
 * GÉOMÉTRIE
 *   Mur hôte :  ┌───────────────┐
 *              │  ○  ○  ○  ○  │  ← meneaux verticaux gravés
 *              ├─┼─┼─┼─┼─┼─┤  ← meneaux horizontaux gravés
 *              │  ○  ○  ○  ○  │
 *              └───────────────┘
 *
 *   Cadre     :  ╔═════════════╗
 *              ║             ║
 *              ║             ║  (anneau, ép. = frameW)
 *              ╚═════════════╝
 *
 *   Meneaux   :  Pièces droites séparées (s'emboîtent dans rainures du cadre)
 */

import { roundRect, linePath, F, REF, toModel } from '../geometry.js';

export default {
  id:    'fenetre-a-meneaux',
  label: 'Fenêtre à meneaux',

  // ─────────────────────────────────────────────
  // DIMENSIONS INTERNES
  // ─────────────────────────────────────────────

  _dims(scaleN) {
    // Dimensions réelles 1:1 (mm) → converties à l'échelle
    const winW = toModel(REF.WINDOW_W, scaleN);   // ~21.4mm @ 1:56 (1200mm réel)
    const winH = toModel(REF.WINDOW_H, scaleN);   // ~21.4mm @ 1:56 (1200mm réel)
    const frameW = toModel(80, scaleN);           // ~1.4mm cadre (80mm réel)
    const mullionW = toModel(40, scaleN);         // ~0.7mm meneaux (40mm réel)
    return { winW, winH, frameW, mullionW };
  },

  // ─────────────────────────────────────────────
  // CONTRAINTES DE PLACEMENT
  // ─────────────────────────────────────────────

  minWidth(scaleN) {
    const { winW, frameW } = this._dims(scaleN);
    return winW + 2 * frameW + 16;                // fenêtre + cadre + 8mm marge chaque côté
  },

  minHeight(scaleN) {
    const { winH, frameW } = this._dims(scaleN);
    return winH + 2 * frameW + 16;
  },

  minSpacing() { return 10; },

  // ─────────────────────────────────────────────
  // DÉCOUPES / GRAVURES SUR LE MUR HÔTE
  // ─────────────────────────────────────────────

  /**
   * @param {number} netCX,netCY  Centre en coords nettes (mm)
   * @param {number} scaleN
   * @param {number} mat          Épaisseur matériau
   * @param {number} kerf         Compensation laser (élargit l'ouverture)
   * @param {object} params
   *   - vMullions: number         Nombre de meneaux verticaux (défaut 2)
   *   - hMullions: number         Nombre de meneaux horizontaux (défaut 1)
   *   - mullionStyle: 'grid'|'cross'|'vertical'|'horizontal'|'none'
   */
  getWallCuts(netCX, netCY, scaleN, mat, kerf = 0, params = {}) {
    const { winW, winH, frameW, mullionW } = this._dims(scaleN);
    const vMullions = params.vMullions ?? 2;
    const hMullions = params.hMullions ?? 1;
    const mullionStyle = params.mullionStyle ?? 'grid';

    // Ouverture élargie par kerf (mortaise = élargie)
    const ow = winW + 2 * kerf;
    const oh = winH + 2 * kerf;
    const x0 = netCX - ow / 2;
    const y0 = netCY - oh / 2;

    // A. Découpe rectangulaire principale (opening dans le mur)
    const openCut = roundRect(x0, y0, ow, oh, 0);

    // B. Meneaux gravés (engrave, pas cut) — centrés dans l'ouverture
    const mullionEngraves = [];

    if (mullionStyle !== 'none') {
      // Coordonnées de l'ouverture INNER (sans kerf) pour positionner les meneaux
      const ix0 = netCX - winW / 2;
      const iy0 = netCY - winH / 2;

      // Meneaux verticaux
      if (mullionStyle === 'grid' || mullionStyle === 'vertical' || mullionStyle === 'cross') {
        const nV = mullionStyle === 'cross' ? 1 : vMullions; // cross = 1 central
        for (let i = 1; i <= nV; i++) {
          const x = ix0 + (i / (nV + 1)) * winW;
          mullionEngraves.push(linePath(x, iy0, x, iy0 + winH));
        }
      }

      // Meneaux horizontaux
      if (mullionStyle === 'grid' || mullionStyle === 'horizontal' || mullionStyle === 'cross') {
        const nH = mullionStyle === 'cross' ? 1 : hMullions;
        for (let i = 1; i <= nH; i++) {
          const y = iy0 + (i / (nH + 1)) * winH;
          mullionEngraves.push(linePath(ix0, y, ix0 + winW, y));
        }
      }
    }

    return [
      { type: 'cut', path: openCut },
      ...mullionEngraves.map(p => ({ type: 'engrave', path: p })),
    ];
  },

  // ─────────────────────────────────────────────
  // PIÈCES D'ASSEMBLAGE
  // ─────────────────────────────────────────────

  /**
   * @returns { cut, engrave, labels, width, height }
   *   Pièce 1 (gauche) : Cadre fenêtre (anneau rectangulaire)
   *   Pièce 2 (droite) : Meneaux (grille séparée)
   */
  getAssemblyParts(scaleN, mat, params = {}) {
    const { winW, winH, frameW, mullionW } = this._dims(scaleN);
    const vMullions = params.vMullions ?? 2;
    const hMullions = params.hMullions ?? 1;
    const mullionStyle = params.mullionStyle ?? 'grid';
    const gap = 8;                            // espace entre les 2 pièces

    // ── PIÈCE 1 : Cadre fenêtre (anneau rectangulaire) ──────────────
    const outerW = winW + 2 * frameW;
    const outerH = winH + 2 * frameW;

    // Anneau via evenodd (extérieur - intérieur)
    const outerRect = roundRect(0, 0, outerW, outerH, 1);
    const innerRect = roundRect(frameW, frameW, winW, winH, 0.5);
    const framePath = `${outerRect} ${innerRect}`;

    // ── PIÈCE 2 : Meneaux (grille) ──────────────────────────────────
    const mullionPaths = [];
    const hw = mullionW / 2;

    if (mullionStyle !== 'none') {
      // Meneaux verticaux
      if (mullionStyle === 'grid' || mullionStyle === 'vertical' || mullionStyle === 'cross') {
        const nV = mullionStyle === 'cross' ? 1 : vMullions;
        const spacing = winW / (nV + 1);
        for (let i = 1; i <= nV; i++) {
          const cx = i * spacing;
          mullionPaths.push(roundRect(cx - hw, -hw, mullionW, winH + 2 * hw, Math.min(0.5, hw)));
        }
      }

      // Meneaux horizontaux
      if (mullionStyle === 'grid' || mullionStyle === 'horizontal' || mullionStyle === 'cross') {
        const nH = mullionStyle === 'cross' ? 1 : hMullions;
        const spacing = winH / (nH + 1);
        for (let i = 1; i <= nH; i++) {
          const cy = i * spacing;
          mullionPaths.push(roundRect(-hw, cy - hw, winW + 2 * hw, mullionW, Math.min(0.5, hw)));
        }
      }
    }

    const mullionPath = mullionPaths.join(' ');
    const mullionWtotal = winW + mullionW;
    const mullionHtotal = winH + mullionW;

    // ── ASSEMBLAGE SVG ──────────────────────────────────────────────
    const p2x = outerW + gap;

    const cut =
      // Pièce 1 — Cadre (evenodd creuse l'intérieur)
      `<path fill-rule="evenodd" d="${framePath}" ` +
      `fill="none" stroke="#FF0000" stroke-width="0.25"/>` +
      // Pièce 2 — Meneaux (grille)
      `<g transform="translate(${F(p2x)},${F(frameW)})">` +
        `<path d="${mullionPath}" fill="none" stroke="#FF0000" stroke-width="0.25"/>` +
      `</g>`;

    const engrave = ''; // Pas de gravure supplémentaire sur les pièces

    const labels =
      `<text x="${F(outerW / 2)}" y="${F(outerH + 3)}" ` +
      `text-anchor="middle" font-size="2.5" fill="#555" font-family="monospace">` +
      `Cadre ${F(winW)}×${F(winH)}mm (×1/fenêtre)</text>` +
      `<g transform="translate(${F(p2x + mullionWtotal/2)},${F(frameW + mullionHtotal/2 + 3)})">` +
        `<text x="0" y="0" text-anchor="middle" font-size="2.5" fill="#555" font-family="monospace">` +
        `Meneaux ${mullionStyle} V${mullionStyle==='vertical'||mullionStyle==='grid'?vMullions:1} H${mullionStyle==='horizontal'||mullionStyle==='grid'?hMullions:1} (×1/fenêtre)</text>` +
      `</g>`;

    const totalW = p2x + mullionWtotal;
    const totalH = Math.max(outerH, frameW + mullionHtotal) + 6;

    return { cut, engrave, labels, width: totalW, height: totalH };
  },

  // ─────────────────────────────────────────────
  // PARAMÈTRES UI
  // ─────────────────────────────────────────────

  getParamDefs() {
    return [
      {
        id:      'vMullions',
        label:   'Meneaux verticaux',
        type:    'number',
        default: 2,
        min:     0,
        max:     6,
        step:    1,
      },
      {
        id:      'hMullions',
        label:   'Meneaux horizontaux',
        type:    'number',
        default: 1,
        min:     0,
        max:     4,
        step:    1,
      },
      {
        id:      'mullionStyle',
        label:   'Style meneaux',
        type:    'select',
        default: 'grid',
        options: ['grid', 'cross', 'vertical', 'horizontal', 'none'],
      },
    ];
  },
};