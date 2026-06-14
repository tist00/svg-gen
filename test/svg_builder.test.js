/**
 * svg_builder.test.js — Unit tests for svg_builder.js
 * Run with: node --test test/svg_builder.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the module under test
import { SVGBuilder, loadPattern, loadSVGPattern, loadRasterPattern } from '../svg_builder.js';
import { F } from '../geometry.js';

// ─────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────

function freshBuilder() {
  return new SVGBuilder(100, 50, 12); // 100x50 content, 12mm padding
}

// ─────────────────────────────────────────────
// SVG BUILDER
// ─────────────────────────────────────────────

describe('SVGBuilder', () => {
  it('calculates total dimensions with padding', () => {
    const b = new SVGBuilder(100, 50, 12);
    assert.equal(b.totalW, 124);
    assert.equal(b.totalH, 74);
  });

  it('extendHeight increases content height', () => {
    const b = new SVGBuilder(100, 50, 12);
    b.extendHeight(20);
    assert.equal(b.totalH, 94); // 50 + 20 + 12*2
  });

  it('addCutPath adds to cut layer with correct attributes', () => {
    const b = freshBuilder();
    b.addCutPath('M0,0 L100,0 L100,50 L0,50 Z');
    const svg = b.build();
    assert.ok(svg.includes('<g id="layer-cut"'));
    assert.ok(svg.includes('stroke="#FF0000"'));
    assert.ok(svg.includes('stroke-width="0.25"'));
    assert.ok(svg.includes('fill="none"'));
  });

  it('addEngravePath adds to engrave layer', () => {
    const b = freshBuilder();
    b.addEngravePath('M10,10 L20,10');
    const svg = b.build();
    assert.ok(svg.includes('<g id="layer-engrave"'));
    assert.ok(svg.includes('stroke="#111111"'));
    assert.ok(svg.includes('stroke-width="0.15"'));
  });

  it('addLabelRaw adds to labels layer', () => {
    const b = freshBuilder();
    b.addLabelRaw('<text x="50" y="25">Test</text>');
    const svg = b.build();
    assert.ok(svg.includes('<g id="layer-labels"'));
    assert.ok(svg.includes('Test'));
  });

  it('layers have inkscape:label and inkscape:groupmode attributes', () => {
    const b = freshBuilder();
    b.addCutPath('M0,0 L10,0');
    b.addEngravePath('M0,0 L10,0');
    b.addLabelRaw('<text>Label</text>');
    const svg = b.build();
    assert.ok(svg.includes('inkscape:label="Découpe"'));
    assert.ok(svg.includes('inkscape:label="Gravure"'));
    assert.ok(svg.includes('inkscape:label="Étiquettes"'));
    assert.ok(svg.includes('inkscape:groupmode="layer"'));
  });

  it('content is shifted by padding in final SVG', () => {
    const b = freshBuilder();
    b.addCutPath('M0,0 L10,0');
    const svg = b.build();
    // ViewBox should include padding (F() formats with 3 decimals)
    assert.ok(svg.includes('viewBox="0 0 124.000 74.000"'));
    // Group should translate by pad
    assert.ok(svg.includes('transform="translate(12.000,12.000)"'));
  });

  it('setTexturePattern stores pattern in defs', () => {
    const b = freshBuilder();
    const patDef = '<pattern id="tex" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="red"/></pattern>';
    b.setTexturePattern(patDef);
    const svg = b.build();
    assert.ok(svg.includes('<defs>'));
    assert.ok(svg.includes('id="tex"'));
    assert.ok(svg.includes('patternUnits="userSpaceOnUse"'));
  });

  it('addEngraveFill uses texture pattern', () => {
    const b = freshBuilder();
    const patDef = '<pattern id="tex" width="10" height="10"><rect width="10" height="10" fill="red"/></pattern>';
    b.setTexturePattern(patDef);
    b.addEngraveFill('M0,0 L10,0 L10,10 L0,10 Z', 'clip-1');
    const svg = b.build();
    assert.ok(svg.includes('fill="url(#tex)"'));
    assert.ok(svg.includes('clip-path="url(#clip-1)"'));
  });

  it('addDef adds arbitrary defs', () => {
    const b = freshBuilder();
    b.addDef('<clipPath id="custom"><rect width="10" height="10"/></clipPath>');
    const svg = b.build();
    assert.ok(svg.includes('<clipPath id="custom"'));
  });

  it('addScaleBar adds scale bar to cut layer', () => {
    const b = freshBuilder();
    b.addScaleBar(0, 0, 10);
    const svg = b.build();
    assert.ok(svg.includes('id="scale-bar"'));
    assert.ok(svg.includes('10 mm'));
    assert.ok(svg.includes('stroke="#999"'));
  });

  it('download method exists', () => {
    const b = freshBuilder();
    b.addCutPath('M0,0 L10,0');
    assert.ok(typeof b.download === 'function');
    const svg = b.build();
    assert.ok(svg.startsWith('<svg'));
  });

  it('empty layers are omitted from output', () => {
    const b = freshBuilder();
    // Only add cut paths
    b.addCutPath('M0,0 L10,0');
    const svg = b.build();
    assert.ok(!svg.includes('layer-engrave')); // empty engrave layer omitted
    assert.ok(!svg.includes('layer-labels'));  // empty labels layer omitted
  });

  it('SVG has correct namespace and dimensions', () => {
    const b = freshBuilder();
    b.addCutPath('M0,0 L10,0');
    const svg = b.build();
    assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(svg.includes('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"'));
    assert.ok(svg.includes('width="124.000mm"'));
    assert.ok(svg.includes('height="74.000mm"'));
  });

  it('addCutRaw / addEngraveRaw / addLabelRaw support transform', () => {
    const b = freshBuilder();
    b.addCutRaw('<path d="M0,0 L10,0"/>', 5, 10);
    b.addEngraveRaw('<path d="M0,0 L10,0"/>', 5, 10);
    b.addLabelRaw('<text>Test</text>', 5, 10);
    const svg = b.build();
    assert.ok(svg.includes('translate(5.000,10.000)'));
  });

  it('addLabel escapes XML special characters', () => {
    const b = freshBuilder();
    b.addLabel(50, 25, 'A & B < C > D');
    const svg = b.build();
    assert.ok(svg.includes('A &amp; B &lt; C &gt; D'));
    assert.ok(!svg.includes('A & B < C > D')); // unescaped not present
  });
});

// ─────────────────────────────────────────────
// LOAD PATTERN (async - tested separately)
// ─────────────────────────────────────────────

// Note: loadPattern requires browser APIs (FileReader, Image, DOMParser)
// These are tested in browser environment, not Node
describe('loadPattern helpers (structure only)', () => {
  it('loadSVGPattern is a function', () => {
    assert.ok(typeof loadSVGPattern === 'function');
  });

  it('loadRasterPattern is a function', () => {
    assert.ok(typeof loadRasterPattern === 'function');
  });

  it('loadPattern is a function', () => {
    assert.ok(typeof loadPattern === 'function');
  });
});