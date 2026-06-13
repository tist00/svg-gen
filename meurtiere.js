/**
 * meurtiere.js — Meurtrière médiévale
 * ─────────────────────────────────────────────
 * 3 éléments :
 *   A. Découpe dans le mur hôte (fente + slot larmier)
 *   B. Pièce 1 : Larmier en T (tige qui glisse dans le slot, barre qui dépasse)
 *   C. Pièce 2 : Encadrement briques (anneau avec briques gravées, à coller en relief)
 *
 * GÉOMÉTRIE MEURTRIÈRE
 *   ┌──┐   ← demi-cercle r = mW/2
 *   │  │   ← rectangle mW × mH
 *   └──┘
 *   [  ]   ← slot T (mat × mat) immédiatement sous la fente
 *
 * LARMIER T (vu de face)
 *   ┌──────────────┐   ← barre (barW × mat) — dépasse de oh de chaque côté
 *         ██           ← tige (mat × mat) — s'enfile dans le slot
 */

import { archRect, roundRect, F, REF } from './geometry.js';

export default {
  id:    'meurtiere',
  label: 'Meurtrière médiévale',

  // ─────────────────────────────────────────────
  // DIMENSIONS INTERNES
  // ─────────────────────────────────────────────

  _dims(scaleN) {
    const mW = REF.MEURTIERE_W / scaleN;   // ~2.68mm @ 1:56
    const mH = REF.MEURTIERE_H / scaleN;   // ~17.86mm @ 1:56
    const r  = mW / 2;                     // rayon arc
    return { mW, mH, r };
  },

  // ─────────────────────────────────────────────
  // CONTRAINTES DE PLACEMENT
  // ─────────────────────────────────────────────

  minWidth(scaleN) {
    const { mW } = this._dims(scaleN);
    return mW + 14;                        // fente + 7mm de marge chaque côté
  },

  minHeight(scaleN) {
    const { mH, r } = this._dims(scaleN);
    return mH + r + 12;                    // ouverture + 6mm haut + 6mm bas
  },

  minSpacing() { return 8; },

  // ─────────────────────────────────────────────
  // DÉCOUPES SUR LE MUR HÔTE
  // ─────────────────────────────────────────────

  /**
   * @param {number} netCX,netCY  Centre de la meurtrière en coords nettes
   * @param {number} scaleN
   * @param {number} mat          Épaisseur matériau
   * @param {number} kerf         Compensation laser (mm) — élargit fente et slot
   * @param {object} params
   */
  getWallCuts(netCX, netCY, scaleN, mat, kerf = 0, params = {}) {
    const { mW, mH, r } = this._dims(scaleN);

    // On positionne le bas de l'ouverture sous le centre (légèrement)
    const botY = netCY + (mH + r) * 0.35;

    // A. Fente principale avec arrondi en haut
    //    Élargie de kerf de chaque côté → +2*kerf en largeur, +kerf en profondeur
    const openPath = archRect(netCX, botY + kerf, mW + 2 * kerf, mH + r + kerf, 'semicircle');

    // B. Slot pour la tige du larmier T
    //    La tige fait exactement mat×mat (c'est la planche — on ne touche pas)
    //    Le slot dans le mur est élargi de 2*kerf en largeur et kerf en profondeur
    const slotW = mat + 2 * kerf;
    const slotH = mat + kerf;
    const slotPath = roundRect(
      netCX - slotW / 2,
      botY,
      slotW,
      slotH,
      0
    );

    return [
      { type: 'cut', path: openPath },
      { type: 'cut', path: slotPath },
    ];
  },

  // ─────────────────────────────────────────────
  // PIÈCES D'ASSEMBLAGE
  // ─────────────────────────────────────────────

  /**
   * Retourne deux pièces en coordonnées locales (0,0 = haut-gauche de la zone).
   *   Pièce 1 (gauche) : Larmier T
   *   Pièce 2 (droite) : Encadrement briques
   */
  getAssemblyParts(scaleN, mat, params = {}) {
    const { mW, mH, r } = this._dims(scaleN);
    const oh      = params.overhang ?? 2;      // débord barre de chaque côté (mm)
    const nB      = params.nBricks  ?? 2;      // nombre de rangs de briques
    const bSz     = REF.BRICK_SIZE / scaleN;   // ~3mm @ 1:56
    const mortar  = 0.3;
    const gap     = 6;                         // espace entre pièce 1 et 2

    // ── PIÈCE 1 : Larmier T ──────────────────────────────────────
    const barW  = mW + 2 * oh;
    const barH  = mat;
    const stemW = mat;
    const stemH = mat;

    // Path en T (coordonnées locales, origine = coin haut-gauche de la barre)
    const tPath =
      `M0,0 L${F(barW)},0 L${F(barW)},${F(barH)} ` +
      `L${F((barW + stemW) / 2)},${F(barH)} ` +
      `L${F((barW + stemW) / 2)},${F(barH + stemH)} ` +
      `L${F((barW - stemW) / 2)},${F(barH + stemH)} ` +
      `L${F((barW - stemW) / 2)},${F(barH)} ` +
      `L0,${F(barH)} Z`;

    const p1H = barH + stemH;

    // ── PIÈCE 2 : Encadrement briques ────────────────────────────
    const frameW = nB * (bSz + mortar);         // largeur de cadre latérale
    const topFr  = nB * (bSz + mortar);         // cadre haut
    const botFr  = bSz + mortar;                // cadre bas (1 rang)

    const pieceW = mW + 2 * frameW;
    const pieceH = mH + r + topFr + botFr;

    // Ouverture dans la pièce 2 (coords locales pièce 2)
    const openCX   = pieceW / 2;
    const openBotY = topFr + mH + r;            // bas de l'ouverture dans la pièce

    // Chemin extérieur (rectangle arrondi)
    const outerPath = roundRect(0, 0, pieceW, pieceH, 1);
    // Chemin de l'ouverture (arch, même forme que le mur)
    const innerPath = archRect(openCX, openBotY, mW, mH + r, 'semicircle');

    // Bounding box de l'ouverture (pour exclure les briques qui se superposent)
    const openL = openCX - mW / 2;
    const openR = openCX + mW / 2;
    const openT = openBotY - mH - r;

    // Génère les briques en décalé (bond pattern)
    const brickEls = [];
    let row = 0;
    for (let by = mortar / 2; by < pieceH - bSz * 0.3; by += bSz + mortar, row++) {
      const xOff = (row % 2) * (bSz * 0.5);
      for (let bx = xOff - bSz * 0.5; bx < pieceW; bx += bSz + mortar) {
        // Clip brique aux bords de la pièce
        const clampX = Math.max(mortar / 2, bx);
        const bw = Math.min(bSz * 0.82, pieceW - clampX - mortar / 2);
        const bh = bSz * 0.82;
        if (bw < 0.3 || bh < 0.2) continue;

        // Exclure si dans la bounding box de l'ouverture (avec petite marge)
        const overlapX = clampX < openR + 0.4 && clampX + bw > openL - 0.4;
        const overlapY = by < openBotY + 0.4  && by + bh  > openT  - 0.4;
        if (overlapX && overlapY) continue;

        brickEls.push(
          `<path d="${roundRect(clampX, by, bw, bh, Math.min(0.7, bh * 0.14))}" ` +
          `fill="none" stroke="#111" stroke-width="0.18"/>`
        );
      }
    }

    // ── ASSEMBLAGE des strings SVG ────────────────────────────────
    const p2x = barW + gap;

    const cut =
      // Pièce 1 — Larmier T
      `<path d="${tPath}" fill="none" stroke="#FF0000" stroke-width="0.25"/>` +
      // Pièce 2 — Encadrement (evenodd creuse l'ouverture)
      `<g transform="translate(${F(p2x)},0)">` +
        `<path fill-rule="evenodd" d="${outerPath} ${innerPath}" ` +
        `fill="none" stroke="#FF0000" stroke-width="0.25"/>` +
      `</g>`;

    const engrave =
      `<g transform="translate(${F(p2x)},0)">` +
        brickEls.join('') +
      `</g>`;

    const labels =
      `<text x="${F(barW / 2)}" y="${F(p1H + 2.8)}" ` +
      `text-anchor="middle" font-size="2.5" fill="#555" font-family="monospace">` +
      `Larmier T (×1/meurtrière)</text>` +

      `<g transform="translate(${F(p2x)},0)">` +
        `<text x="${F(pieceW / 2)}" y="${F(pieceH + 2.8)}" ` +
        `text-anchor="middle" font-size="2.5" fill="#555" font-family="monospace">` +
        `Encadrement ${nB} rangs (×1/meurtrière)</text>` +
      `</g>`;

    const totalW = p2x + pieceW;
    const totalH = Math.max(p1H + 6, pieceH + 6);

    return { cut, engrave, labels, width: totalW, height: totalH };
  },

  // ─────────────────────────────────────────────
  // PARAMÈTRES UI
  // ─────────────────────────────────────────────

  getParamDefs() {
    return [
      {
        id:      'overhang',
        label:   'Débord larmier (mm)',
        type:    'number',
        default: 2,
        min:     0.5,
        max:     10,
        step:    0.5,
      },
      {
        id:      'nBricks',
        label:   'Rangs de briques',
        type:    'number',
        default: 2,
        min:     1,
        max:     5,
        step:    1,
      },
    ];
  },
};
