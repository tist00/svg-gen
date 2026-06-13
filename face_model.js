/**
 * face_model.js — Data structures
 * ─────────────────────────────────────────────
 * Plain object factories (no classes — easier to serialize/clone).
 *
 * COORDINATE SYSTEMS
 *  Net coords   : absolute mm position in the flat cut layout (SVG viewBox)
 *  Face-local   : origin at face top-left, same mm scale
 *  Addon center : given in face-local coords, converted to net coords by main_wall
 */

// ─────────────────────────────────────────────
// BUILD PARAMS
// ─────────────────────────────────────────────

/**
 * Create a full parameter object with defaults.
 * All dimension params are in mm (model scale).
 *
 * @param {object} overrides
 * @returns {BuildParams}
 */
export function createBuildParams(overrides = {}) {
  return {
    // ── Box geometry ──
    X:           100,      // width  (left–right)   mm
    Y:           60,       // height (floor–ceiling) mm  per floor
    Z:           40,       // depth  (front–back)    mm
    nFloors:     1,        // number of storeys (walls stack vertically)

    // ── Scale ──
    scaleN:      56,       // 1:N  (e.g. 56 → 1/56th)

    // ── Laser-cut params ──
    mat:         3,        // material thickness mm
    fw:          5,        // target finger width mm (actual adjusted to be odd count)
    kerf:        0.1,      // laser kerf compensation mm — applied ONLY to notches (mortaises)
                           // tabs (tenons) keep exact mat value so the board stays 3 mm
    mode:        'closed', // 'closed' | 'open' (no top) | 'frame' (no top/bottom)

    // ── Layout ──
    padMM:       12,       // SVG outer padding mm
    minSpacing:  8,        // minimum spacing between addon instances mm

    ...overrides,
  };
}

// ─────────────────────────────────────────────
// FACE LAYOUT RECORD
// ─────────────────────────────────────────────

/**
 * Create a face layout record.
 * Produced by placer.computeNetLayout(); consumed by main_wall and addons.
 *
 * @param {string} id    Face ID: 'top'|'bottom'|'front'|'back'|'left'|'right'|'floor{N}'
 * @param {number} x,y   Net position of top-left corner (mm)
 * @param {number} w,h   Face width and height (mm)
 * @param {object} edges { top, right, bottom, left } each 'free'|'tab'|'notch'
 */
export function createFaceLayout(id, x, y, w, h, edges = {}) {
  return {
    id,
    x, y,
    w, h,
    edges,
    // Runtime additions (filled by main_wall during generation):
    addons:   [],   // [{ type, localCX, localCY, params }]
    cutouts:  [],   // SVG path strings to subtract (cut) — filled by addon.getWallCuts()
    engraves: [],   // SVG path strings for engraving inside this face
  };
}

// ─────────────────────────────────────────────
// ADDON REQUEST
// ─────────────────────────────────────────────

/**
 * Describe one addon request attached to a face.
 *
 * @param {string} faceId       Target face ID
 * @param {object} addonModule  The addon module object (must implement addon contract)
 * @param {number} count        How many instances on this face (auto-placed)
 * @param {object} params       Addon-specific overrides (merged with addonModule defaults)
 */
export function createAddonRequest(faceId, addonModule, count = 1, params = {}) {
  return { faceId, addonModule, count, params };
}

// ─────────────────────────────────────────────
// ADDON CONTRACT (documentation)
// ─────────────────────────────────────────────

/**
 * Every addon module MUST export this interface:
 *
 * {
 *   id:     string,          // unique snake_case identifier
 *   label:  string,          // human-readable French label
 *
 *   // Minimum face dimensions for this addon to be accepted
 *   minWidth  (scaleN: number): number,   // mm
 *   minHeight (scaleN: number): number,   // mm
 *   minSpacing():              number,    // mm between two instances
 *
 *   // What to cut / engrave on the HOST face (main wall)
 *   // netCX, netCY: absolute net coordinates of addon center
 *   getWallCuts(netCX, netCY, scaleN, mat, params):
 *     Array<{ type: 'cut'|'engrave', path: string }>
 *
 *   // Separate pieces to cut/engrave for assembly
 *   // Returned in local coordinates (origin 0,0)
 *   // main_wall translates via SVG <g transform>
 *   getAssemblyParts(scaleN, mat, params):
 *     { cut: string, engrave: string, labels: string,
 *       width: number, height: number }   // bounding box for layout
 *
 *   // Parameter definitions for the UI
 *   getParamDefs(): Array<{
 *     id: string, label: string,
 *     type: 'number'|'boolean'|'select',
 *     default: any, min?: number, max?: number, step?: number,
 *     options?: string[]
 *   }>
 * }
 */
export const ADDON_CONTRACT = '/* see JSDoc above */';

// ─────────────────────────────────────────────
// FACE LABELS (FR)
// ─────────────────────────────────────────────

export const FACE_NAMES = {
  top:    'Dessus',
  bottom: 'Dessous',
  front:  'Façade',
  back:   'Arrière',
  left:   'Gauche',
  right:  'Droite',
};

/** Which faces can receive addons (vertical faces only) */
export const ADDON_FACES = ['front', 'back', 'left', 'right'];
