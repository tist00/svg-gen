/**
 * oeil_de_boeuf.js — Lucarne œil-de-bœuf médiévale
 * ────────────────────────────────────────────────────
 * Fenêtre circulaire ("œil-de-bœuf") avec croisillon central en croix.
 *
 * 3 éléments livrés :
 *   A. Découpe mur hôte : cercle + croisillon gravé
 *   B. Pièce 1 : Cadre circulaire (anneau à coller en relief sur le mur)
 *   C. Pièce 2 : Croisillon (croix à 4 branches, s'encastre dans le cadre)
 *
 * GÉOMÉTRIE
 *   Mur hôte :  ○ (cercle, Ø = winD)
 *              ╋ (croisillon gravé, 2 traits centrés)
 *
 *   Cadre      :  ╭─╮
 *              ╰─╯  (anneau, ép. = frameW)
 *
 *   Croisillon :  ╋  (4 branches largeur = mullionW, longueur = winD - 2*frameW)
 */

import { circlePath, linePath, roundRect, F, REF } from './geometry.js';

export default {
  id:    'oeil_de_boeuf',
  label: 'Œil-de-bœuf (lucarne circulaire)',

  // ─────────────────────────────────────────────
  // DIMENSIONS INTERNES
  // ─────────────────────────────────────────────

  _dims(scaleN) {
    // Dimensions réelles 1:1 (mm) → converties à l'échelle
    const winD = REF.WINDOW_H / scaleN;       // ~21.4mm @ 1:56 (1200mm réel)
    const frameW = toModel(80, scaleN);       // ~1.4mm cadre (80mm réel)
    const mullionW = toModel(60, scaleN);     // ~1.1mm branches croisillon (60mm réel)
    return { winD, frameW, mullionW };
  },

  // ─────────────────────────────────────────────
  // CONTRAINTES DE PLACEMENT
  // ─────────────────────────────────────────────

  minWidth(scaleN) {
    const { winD, frameW } = this._dims(scaleN);
    return winD + 2 * frameW + 12;            // fenêtre + cadre + 6mm marge chaque côté
  },

  minHeight(scaleN) {
    return this.minWidth(scaleN);             // circulaire → même contrainte
  },

  minSpacing() { return 10; },

  // ─────────────────────────────────────────────
  // DÉCOUPES / GRAVURES SUR LE MUR HÔTE
  // ─────────────────────────────────────────────

  /**
   * @param {number} netCX,netCY  Centre en coords nettes (mm)
   * @param {number} scaleN
   * @param {number} mat          Épaisseur matériau
   * @param {number} kerf         Compensation laser (élargit le cercle)
   * @param {object} params
   *   - mullionStyle: 'cross' | 'x' | 'none'  (type de croisillon gravé)
   */
  getWallCuts(netCX, netCY, scaleN, mat, kerf = 0, params = {}) {
    const { winD, frameW } = this._dims(scaleN);
    const mullionStyle = params.mullionStyle ?? 'cross';

    // Rayon avec compensation kerf (mortaise = élargie)
    const r = winD / 2 + kerf;

    // A. Découpe circulaire principale
    const circleCut = circlePath(netCX, netCY, r);

    // B. Croisillon gravé (engrave, pas cut)
    const mullionEngraves = [];
    if (mullionStyle !== 'none') {
      const armLen = r - frameW - kerf;       // longueur branche jusqu'au bord intérieur cadre
      if (mullionStyle === 'cross' || mullionStyle === 'both') {
        // Croix + (vertical + horizontal)
        mullionEngraves.push(linePath(netCX, netCY - armLen, netCX, netCY + armLen));
        mullionEngraves.push(linePath(netCX - armLen, netCY, netCX + armLen, netCY));
      }
      if (mullionStyle === 'x' || mullionStyle === 'both') {
        // Croix × (diagonales)
        const d = armLen * 0.7071;
        mullionEngraves.push(linePath(netCX - d, netCY - d, netCX + d, netCY + d));
        mullionEngraves.push(linePath(netCX - d, netCY + d, netCX + d, netCY - d));
      }
    }

    return [
      { type: 'engrave', path: circleCut },
      ...mullionEngraves.map(p => ({ type: 'engrave', path: p })),
    ];
  },

  // ─────────────────────────────────────────────
  // PIÈCES D'ASSEMBLAGE
  // ─────────────────────────────────────────────

  /**
   * @returns { cut, engrave, labels, width, height }
   *   Pièce 1 (gauche) : Cadre circulaire (anneau)
   *   Pièce 2 (droite) : Croisillon séparé (4 branches)
   */
  getAssemblyParts(scaleN, mat, params = {}) {
    const { winD, frameW, mullionW } = this._dims(scaleN);
    const mullionStyle = params.mullionStyle ?? 'cross';
    const gap = 8;                            // espace entre les 2 pièces

    // ── PIÈCE 1 : Cadre circulaire (anneau) ───────────────────────
    const outerR = winD / 2 + frameW;
    const innerR = winD / 2;

    // Anneau via evenodd (extérieur - intérieur)
    const outerCircle = circlePath(0, 0, outerR);
    const innerCircle = circlePath(0, 0, innerR);
    const framePath = `${outerCircle} ${innerCircle}`;

    const frameWtotal = outerR * 2;
    const frameHtotal = outerR * 2;

    // ── PIÈCE 2 : Croisillon (4 branches) ─────────────────────────
    // Longueur branche = rayon intérieur - petit jeu
    const armLen = innerR - 0.3;
    const hw = mullionW / 2;

    // 4 rectangles centrés (vertical, horizontal, 2 diagonales si style 'both')
    const arms = [];

    // Branche verticale
    arms.push(roundRect(-hw, -armLen, mullionW, armLen * 2, Math.min(0.5, hw)));
    // Branche horizontale
    arms.push(roundRect(-armLen, -hw, armLen * 2, mullionW, Math.min(0.5, hw)));

    if (mullionStyle === 'x' || mullionStyle === 'both') {
      // Diagonales : rectangles rotatés → on approxime par path
      const d = armLen * 0.7071;
      const dhw = mullionW * 0.7071;
      // Diagonale \ (bas-gauche → haut-droit)
      arms.push(
        `M${F(-d - dhw/2)},${F(-d - dhw/2)} ` +
        `L${F(d + dhw/2)},${F(d + dhw/2)} ` +
        `L${F(d - dhw/2)},${F(d - dhw/2)} ` +
        `L${F(-d + dhw/2)},${F(-d + dhw/2)} Z`
      );
      // Diagonale / (haut-gauche → bas-droit)
      arms.push(
        `M${F(-d + dhw/2)},${F(d - dhw/2)} ` +
        `L${F(d - dhw/2)},${F(-d + dhw/2)} ` +
        `L${F(d + dhw/2)},${F(-d - dhw/2)} ` +
        `L${F(-d - dhw/2)},${F(d + dhw/2)} Z`
      );
    }

    const mullionPath = arms.join(' ');
    const mullionSize = armLen * 2 + mullionW;

    // ── ASSEMBLAGE SVG ───────────────────────────────────────────
    const p2x = outerR * 2 + gap;

    const cut =
      // Pièce 1 — Cadre (evenodd creuse le centre)
      `<path fill-rule="evenodd" d="${framePath}" ` +
      `fill="none" stroke="#FF0000" stroke-width="0.25"/>` +
      // Pièce 2 — Croisillon
      `<g transform="translate(${F(p2x)},${F(outerR)})">` +
        `<path d="${mullionPath}" fill="none" stroke="#FF0000" stroke-width="0.25"/>` +
      `</g>`;

    const engrave = ''; // Pas de gravure supplémentaire sur les pièces

    const labels =
      `<text x="${F(outerR)}" y="${F(frameHtotal + 3)}" ` +
      `text-anchor="middle" font-size="2.5" fill="#555" font-family="monospace">` +
      `Cadre Ø${F(winD)}mm (×1/fenêtre)</text>` +
      `<g transform="translate(${F(p2x)},${F(outerR + mullionSize/2 + 3)})">` +
        `<text x="0" y="0" text-anchor="middle" font-size="2.5" fill="#555" font-family="monospace">` +
        `Croisillon ${mullionStyle} (×1/fenêtre)</text>` +
      `</g>`;

    const totalW = p2x + mullionSize;
    const totalH = Math.max(frameHtotal, mullionSize) + 6;

    return { cut, engrave, labels, width: totalW, height: totalH };
  },

  // ─────────────────────────────────────────────
  // PARAMÈTRES UI
  // ─────────────────────────────────────────────

  getParamDefs() {
    return [
      {
        id:      'mullionStyle',
        label:   'Style croisillon',
        type:    'select',
        default: 'cross',
        options: ['cross', 'x', 'both', 'none'],
      },
    ];
  },
};

// Helper local (pour éviter d'importer toModel depuis geometry)
function toModel(realMM, scaleN) {
  return realMM / scaleN;
}