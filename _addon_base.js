/**
 * _addon_base.js — Template / documentation pour créer un add-on
 * ─────────────────────────────────────────────────────────────────
 * Copier ce fichier → addons/mon_addon.js et implémenter chaque méthode.
 *
 * CYCLE DE VIE
 *   1. main_wall.js appelle validateAddon() → vérifie minWidth/minHeight
 *   2. Si OK → autoPlaceAddons() calcule les positions (cx,cy) en local face
 *   3. Pour chaque instance → getWallCuts() perce la face dans le SVG
 *   4. Une fois par type d'add-on → getAssemblyParts() génère les pièces
 *      séparées à découper/graver pour l'assemblage
 *
 * COORDONNÉES
 *   getWallCuts      → coordonnées NETTES (absolues dans le viewBox SVG)
 *   getAssemblyParts → coordonnées LOCALES (origine 0,0 = coin haut-gauche)
 *   main_wall.js applique un translate() pour positionner les pièces.
 *
 * UNITÉS : tout en mm modèle (viewBox 1 unité = 1 mm).
 */

export default {

  id:    'mon_addon',
  label: 'Mon Add-on',

  // ── Contraintes de placement ─────────────────────────────────────

  minWidth(scaleN)  { return 900  / scaleN + 16; },
  minHeight(scaleN) { return 2100 / scaleN + 16; },
  minSpacing()      { return 8; },

  // ── Découpes / gravures sur le mur hôte ─────────────────────────

  /**
   * @param {number} netCX,netCY  Centre en coordonnées nettes (mm)
   * @param {number} scaleN
   * @param {number} mat          Épaisseur matériau (mm)
   * @param {number} kerf         Compensation laser (mm) — à appliquer sur mortaises/slots
   * @param {object} params
   * @returns {Array<{ type:'cut'|'engrave', path:string }>}
   */
  getWallCuts(netCX, netCY, scaleN, mat, kerf = 0, params = {}) {
    const w = 900 / scaleN, h = 2100 / scaleN;
    // Ouverture élargie de kerf de chaque côté (mortaise dans le mur)
    const ew = w + 2 * kerf, eh = h + kerf;
    const x = netCX - ew / 2,  y = netCY - eh / 2;
    return [{
      type: 'cut',
      path: `M${x.toFixed(3)},${y.toFixed(3)} L${(x+ew).toFixed(3)},${y.toFixed(3)} ` +
            `L${(x+ew).toFixed(3)},${(y+eh).toFixed(3)} L${x.toFixed(3)},${(y+eh).toFixed(3)} Z`,
    }];
  },

  // ── Pièces d'assemblage séparées ────────────────────────────────

  /**
   * @returns {{ cut, engrave, labels, width, height }}
   *   Tous les paths en coordonnées locales (origine 0,0).
   */
  getAssemblyParts(scaleN, mat, params = {}) {
    const w = 30, h = 20;
    return {
      cut:     `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#FF0000" stroke-width="0.25"/>`,
      engrave: '',
      labels:  `<text x="${w/2}" y="${h+3}" text-anchor="middle" font-size="2.5" fill="#444" font-family="monospace">Ma pièce</text>`,
      width:   w,
      height:  h + 5,
    };
  },

  // ── Paramètres UI ────────────────────────────────────────────────

  /**
   * @returns {Array<{ id, label, type:'number'|'boolean'|'select',
   *                   default, min?, max?, step?, options? }>}
   */
  getParamDefs() {
    return [
      { id:'monParam', label:'Mon paramètre (mm)', type:'number', default:5, min:1, max:20, step:0.5 },
      { id:'avecOpt',  label:'Avec option',         type:'boolean', default:true },
    ];
  },
};
