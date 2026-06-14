/**
 * placer.test.js — Unit tests for placer.js
 * Run with: node --test test/placer.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Import the module under test
import {
  computeEdgeTypes,
  computeNetLayout,
  netBounds,
  computeFloorPanels,
  validateAddon,
  autoPlaceAddons,
  rectsOverlap,
} from '../placer.js';

import { createFaceLayout, ADDON_FACES } from '../face_model.js';

// ─────────────────────────────────────────────
// MOCK ADDON MODULE
// ─────────────────────────────────────────────

const mockAddon = {
  id: 'test-addon',
  label: 'Test Addon',
  minWidth(scaleN) { return 20 / scaleN; },
  minHeight(scaleN) { return 30 / scaleN; },
  minSpacing() { return 5; },
  getWallCuts() { return []; },
  getAssemblyParts() { return { cut: '', engrave: '', labels: '', width: 20, height: 30 }; },
  getParamDefs() { return []; },
};

// ─────────────────────────────────────────────
// EDGE TYPES
// ─────────────────────────────────────────────

describe('computeEdgeTypes()', () => {
  it('closed mode: all vertical faces have notch top, tab right, notch bottom, notch left', () => {
    const E = computeEdgeTypes('closed');
    for (const id of ADDON_FACES) {
      assert.equal(E[id].top, 'notch', `${id}.top should be notch in closed mode`);
      assert.equal(E[id].right, 'tab', `${id}.right should be tab`);
      assert.equal(E[id].bottom, 'notch', `${id}.bottom should be notch`);
      assert.equal(E[id].left, 'notch', `${id}.left should be notch`);
    }
  });

  it('open mode: vertical faces have free top', () => {
    const E = computeEdgeTypes('open');
    for (const id of ADDON_FACES) {
      assert.equal(E[id].top, 'free', `${id}.top should be free in open mode`);
    }
  });

  it('frame mode: vertical faces have free top and bottom', () => {
    const E = computeEdgeTypes('frame');
    for (const id of ADDON_FACES) {
      assert.equal(E[id].top, 'free', `${id}.top should be free in frame mode`);
      assert.equal(E[id].bottom, 'free', `${id}.bottom should be free in frame mode`);
    }
  });

  it('top/bottom faces always have all tabs in closed mode', () => {
    const E = computeEdgeTypes('closed');
    assert.equal(E.top.top, 'tab');
    assert.equal(E.top.right, 'tab');
    assert.equal(E.top.bottom, 'tab');
    assert.equal(E.top.left, 'tab');
    assert.equal(E.bottom.top, 'tab');
    assert.equal(E.bottom.right, 'tab');
    assert.equal(E.bottom.bottom, 'tab');
    assert.equal(E.bottom.left, 'tab');
  });

  it('returns deep copy (mutating result does not affect subsequent calls)', () => {
    const E1 = computeEdgeTypes('closed');
    E1.front.top = 'free';
    const E2 = computeEdgeTypes('closed');
    assert.equal(E2.front.top, 'notch', 'Second call should not be affected by mutation');
  });
});

// ─────────────────────────────────────────────
// NET LAYOUT
// ─────────────────────────────────────────────

describe('computeNetLayout()', () => {
  const X = 100, Y = 50, Z = 40, mat = 3, nFloors = 1;

  it('closed mode produces 6 faces', () => {
    const layouts = computeNetLayout(X, Y, Z, mat, 'closed', nFloors);
    assert.equal(layouts.length, 6, 'Closed mode should have 6 faces');
    const ids = layouts.map(f => f.id).sort();
    assert.deepEqual(ids, ['back', 'bottom', 'front', 'left', 'right', 'top']);
  });

  it('open mode produces 5 faces (no top)', () => {
    const layouts = computeNetLayout(X, Y, Z, mat, 'open', nFloors);
    assert.equal(layouts.length, 5);
    const ids = layouts.map(f => f.id).sort();
    assert.deepEqual(ids, ['back', 'bottom', 'front', 'left', 'right']);
    assert.ok(!layouts.find(f => f.id === 'top'));
  });

  it('frame mode produces 4 faces (no top, no bottom)', () => {
    const layouts = computeNetLayout(X, Y, Z, mat, 'frame', nFloors);
    assert.equal(layouts.length, 4);
    const ids = layouts.map(f => f.id).sort();
    assert.deepEqual(ids, ['back', 'front', 'left', 'right']);
    assert.ok(!layouts.find(f => f.id === 'top'));
    assert.ok(!layouts.find(f => f.id === 'bottom'));
  });

  it('face dimensions are correct', () => {
    const layouts = computeNetLayout(X, Y, Z, mat, 'closed', nFloors);
    const byId = Object.fromEntries(layouts.map(f => [f.id, f]));
    
    // Vertical faces: height = Y * nFloors
    assert.equal(byId.front.w, X);
    assert.equal(byId.front.h, Y * nFloors);
    assert.equal(byId.back.w, X);
    assert.equal(byId.back.h, Y * nFloors);
    assert.equal(byId.left.w, Z);
    assert.equal(byId.left.h, Y * nFloors);
    assert.equal(byId.right.w, Z);
    assert.equal(byId.right.h, Y * nFloors);
    
    // Horizontal faces: X × Z
    assert.equal(byId.top.w, X);
    assert.equal(byId.top.h, Z);
    assert.equal(byId.bottom.w, X);
    assert.equal(byId.bottom.h, Z);
  });

  it('gap between faces equals material thickness', () => {
    const layouts = computeNetLayout(X, Y, Z, mat, 'closed', nFloors);
    const byId = Object.fromEntries(layouts.map(f => [f.id, f]));
    
    // left.x = 0
    assert.equal(byId.left.x, 0);
    // front.x = Z + mat
    assert.equal(byId.front.x, Z + mat);
    // right.x = Z + mat + X + mat
    assert.equal(byId.right.x, Z + mat + X + mat);
    // back.x = Z + mat + X + mat + Z + mat
    assert.equal(byId.back.x, Z + mat + X + mat + Z + mat);
    
    // top.x = Z + mat (aligned with front)
    assert.equal(byId.top.x, Z + mat);
  });

  it('multi-floor: vertical faces stack height = Y * nFloors', () => {
    const layouts3 = computeNetLayout(X, Y, Z, mat, 'closed', 3);
    const byId = Object.fromEntries(layouts3.map(f => [f.id, f]));
    assert.equal(byId.front.h, Y * 3);
    assert.equal(byId.left.h, Y * 3);
  });
});

// ─────────────────────────────────────────────
// NET BOUNDS
// ─────────────────────────────────────────────

describe('netBounds()', () => {
  it('computes bounding box of all layouts', () => {
    const layouts = [
      createFaceLayout('a', 10, 20, 100, 50),
      createFaceLayout('b', 150, 30, 40, 60),
    ];
    const b = netBounds(layouts);
    assert.equal(b.x, 10);
    assert.equal(b.y, 20);
    assert.equal(b.w, 180); // 150+40 - 10
    assert.equal(b.h, 70);  // 30+60 - 20
  });

  it('handles single layout', () => {
    const layouts = [createFaceLayout('a', 5, 5, 10, 20)];
    const b = netBounds(layouts);
    assert.equal(b.x, 5);
    assert.equal(b.y, 5);
    assert.equal(b.w, 10);
    assert.equal(b.h, 20);
  });
});

// ─────────────────────────────────────────────
// FLOOR PANELS
// ─────────────────────────────────────────────

describe('computeFloorPanels()', () => {
  it('returns empty for single floor', () => {
    const panels = computeFloorPanels(100, 40, 3, 1, 200);
    assert.deepEqual(panels, []);
  });

  it('creates nFloors-1 panels for multi-floor', () => {
    const panels = computeFloorPanels(100, 40, 3, 3, 200);
    assert.equal(panels.length, 2);
    assert.equal(panels[0].id, 'floor1');
    assert.equal(panels[1].id, 'floor2');
  });

  it('floor panels have all-tab edges', () => {
    const panels = computeFloorPanels(100, 40, 3, 2, 200);
    for (const p of panels) {
      assert.equal(p.edges.top, 'tab');
      assert.equal(p.edges.right, 'tab');
      assert.equal(p.edges.bottom, 'tab');
      assert.equal(p.edges.left, 'tab');
    }
  });

  it('floor panels positioned below main net with 10mm gap', () => {
    const netBottomY = 200;
    const panels = computeFloorPanels(100, 40, 3, 2, netBottomY);
    assert.equal(panels.length, 1); // nFloors-1 = 1
    assert.equal(panels[0].y, netBottomY); // first at netBottomY
    // With 3 floors: 2 panels
    const panels3 = computeFloorPanels(100, 40, 3, 3, netBottomY);
    assert.equal(panels3.length, 2);
    assert.equal(panels3[0].y, netBottomY);
    assert.equal(panels3[1].y, netBottomY + 40 + 10); // second 10mm below first
  });
});

// ─────────────────────────────────────────────
// ADDON VALIDATION
// ─────────────────────────────────────────────

describe('validateAddon()', () => {
  const scaleN = 56;
  const minSpacing = 8;

  it('passes when face is large enough', () => {
    // mockAddon needs 20/56=0.36mm + 2*8=16mm = 16.36mm width
    const face = createFaceLayout('front', 0, 0, 50, 60);
    const result = validateAddon(face, mockAddon, scaleN, {}, minSpacing);
    assert.ok(result.ok, result.reason);
  });

  it('fails when face too narrow', () => {
    const face = createFaceLayout('front', 0, 0, 10, 60); // only 10mm wide
    const result = validateAddon(face, mockAddon, scaleN, {}, minSpacing);
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('trop étroite'));
  });

  it('fails when face too short', () => {
    const face = createFaceLayout('front', 0, 0, 50, 10); // only 10mm high
    const result = validateAddon(face, mockAddon, scaleN, {}, minSpacing);
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('trop basse'));
  });
});

// ─────────────────────────────────────────────
// ADDON AUTO-PLACEMENT
// ─────────────────────────────────────────────

describe('autoPlaceAddons()', () => {
  const scaleN = 56;
  const mat = 3;
  const minSpacing = 8;

  it('returns positions for single addon', () => {
    const face = createFaceLayout('front', 0, 0, 100, 50);
    const positions = autoPlaceAddons(face, mockAddon, 1, scaleN, mat, minSpacing);
    assert.ok(positions !== null);
    assert.equal(positions.length, 1);
    const p = positions[0];
    assert.ok(p.cx > 0 && p.cx < face.w);
    assert.ok(p.cy > 0 && p.cy < face.h);
  });

  it('distributes multiple addons horizontally', () => {
    const face = createFaceLayout('front', 0, 0, 100, 50);
    const positions = autoPlaceAddons(face, mockAddon, 3, scaleN, mat, minSpacing);
    assert.ok(positions !== null);
    assert.equal(positions.length, 3);
    // Check they're ordered left to right
    assert.ok(positions[0].cx < positions[1].cx);
    assert.ok(positions[1].cx < positions[2].cx);
  });

  it('returns null when too many addons horizontally', () => {
    const face = createFaceLayout('front', 0, 0, 30, 50); // very narrow
    const positions = autoPlaceAddons(face, mockAddon, 5, scaleN, mat, minSpacing);
    assert.equal(positions, null);
  });

  it('returns null when addon too tall for face', () => {
    const tallFace = createFaceLayout('front', 0, 0, 100, 10); // very short
    const positions = autoPlaceAddons(tallFace, mockAddon, 1, scaleN, mat, minSpacing);
    assert.equal(positions, null);
  });

  it('centers vertically at ~52% of face height', () => {
    const face = createFaceLayout('front', 0, 0, 100, 100);
    const positions = autoPlaceAddons(face, mockAddon, 1, scaleN, mat, minSpacing);
    const expectedCy = face.h * 0.52;
    assert.ok(Math.abs(positions[0].cy - expectedCy) < 1);
  });
});

// ─────────────────────────────────────────────
// RECT OVERLAP
// ─────────────────────────────────────────────

describe('rectsOverlap()', () => {
  it('detects overlap', () => {
    assert.ok(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  });

  it('detects no overlap when separated', () => {
    assert.ok(!rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }));
  });

  it('detects no overlap when touching edges', () => {
    assert.ok(!rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }));
  });

  it('clearance prevents touching', () => {
    assert.ok(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }, 1));
  });
});