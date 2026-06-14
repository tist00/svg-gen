/**
 * TEMPLATE ADDON — LaserBox
 * 
 * Copier ce fichier → addons/mon-addon.js
 * Renommer `id` et `label`, implémenter chaque méthode.
 * Supprimer ce commentaire et adapter les valeurs.
 * 
 * CONTRAT : voir laserbox-shared/references/addon-contract.md
 * RÈGLES KERF : voir laserbox-shared/references/kerf-rules.md
 * RÈGLE 3-FACES : voir laserbox-shared/references/corner-rule-3faces.md
 */

import { archRect, roundRect, F, REF } from '../geometry.js';  // Seuls imports autorisés

export default {

  // ─── IDENTITÉ ──────────────────────────────────────────────
  id:    'fenetre-a-meneaux',        // snake_case, UNIQUE global
  label: 'Fenêtre à meneaux',     // Français, affiché dans UI sidebar

  // ─── CONTRAINTES DE PLACEMENT ──────────────────────────────
  // Reçoivent scaleN (ex: 56) → retournent dimensions mm MODÈLE
  minWidth:  (scaleN) => 900  / scaleN + 16,  // Largeur min face + marges
  minHeight: (scaleN) => 2100 / scaleN + 16,  // Hauteur min face + marges
  minSpacing: () => 8,                        // Espacement min بين instances (mm)

  // ─── DÉCOUPES / GRAVURES SUR LE MUR HÔTE ───────────────────
  /**
   * @param {number} netCX, netCY  Centre de l'addon en coordonnées NET (viewBox absolues)
   * @param {number} scaleN        Échelle 1:N
   * @param {number} mat           Épaisseur matériau mm
   * @param {number} kerf          Kerf laser mm — À APPLIQUER sur mortaises uniquement
   * @param {object} params        Paramètres utilisateur (merged avec getParamDefs defaults)
   * @returns {Array<{type:'cut'|'engrave', path:string}>}
   */
  getWallCuts(netCX, netCY, scaleN, mat, kerf = 0, params = {}) {
    // 1. Calculer dimensions réelles → modèle via scaleN
    const w = 900 / scaleN;   // ex: largeur ouverture
    const h = 2100 / scaleN;  // ex: hauteur ouverture
    
    // 2. Positionner par rapport au centre (netCX, netCY)
    //    Ici : centre = milieu de l'ouverture
    const ew = w + 2 * kerf;   // EliteLargeur = ouverture + 2×kerf (mortaises)
    const eh = h + kerf;       // ElasticHauteur = ouverture + kerf (fond)
    const x = netCX - ew / 2;
    const y = netCY - eh / 2;
    
    // 3. Construire path(s) SVG
    //    RÈGLE D'OR : tenons (onglets) = mat EXACT, mortaises = mat + kerf
    //    Utiliser geometry.js helpers : archRect, roundRect, F()
    
    return [
      { 
        type: 'cut', 
        path: `M${F(x)},${F(y)} L${F(x+ew)},${F(y)} L${F(x+ew)},${F(y+eh)} L${F(x)},${F(y+eh)} Z` 
      }
      // Ajouter { type: 'engrave', path: ... } si gravure nécessaire
    ];
  },

  // ─── PIÈCES D'ASSEMBLAGE SÉPARÉES ──────────────────────────
  /**
   * @returns {{ cut, engrave, labels, width, height }}
   *   Tous paths en coordonnées LOCALES (origine 0,0 = coin haut-gauche zone)
   *   main_wall.js applique translate() pour positionner côté à côté × instances
   */
  getAssemblyParts(scaleN, mat, params = {}) {
    // Dimensions pièce(s)
    const pieceW = 30;  // mm
    const pieceH = 20;  // mm
    
    // Paths SVG (coords locales 0,0)
    const cut = 
      `<path d="M0,0 L${F(pieceW)},0 L${F(pieceW)},${F(pieceH)} L0,${F(pieceH)} Z" ` +
      `fill="none" stroke="#FF0000" stroke-width="0.25"/>`;
    
    const engrave = '';  // Ou paths gravure #111 stroke-width 0.15
    
    const labels = 
      `<text x="${F(pieceW/2)}" y="${F(pieceH + 3)}" ` +
      `text-anchor="middle" font-size="2.5" fill="#444" font-family="monospace">` +
      `Ma Pièce</text>`;
    
    return { cut, engrave, labels, width: pieceW, height: pieceH + 5 };
  },

  // ─── PARAMÈTRES UI ─────────────────────────────────────────
  /**
   * @returns {Array<{id, label, type:'number'|'boolean'|'select', default, min?, max?, step?, options?}>}
   *   UI générée automatiquement dans index.html (buildAddonUI)
   */
  getParamDefs() {
    return [
      { 
        id: 'monParam', 
        label: 'Mon paramètre (mm)', 
        type: 'number', 
        default: 5, 
        min: 1, 
        max: 20, 
        step: 1 
      }
      // Exemple select:
      // { id: 'style', label: 'Style', type: 'select', default: 'croisillon',
      //   options: ['croisillon', 'meneaux-x', 'meneaux-quadre', 'vide'] }
    ];
  }

};