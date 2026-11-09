const assert=require('node:assert/strict');require('./engine.js');
const e=globalThis.PuzzleEngine;
assert.equal(e.integer('5',2,8,3),5);assert.equal(e.integer('200',2,8,3),3);
assert.equal(e.target(13,5).x,3);assert.equal(e.target(13,5).y,2);
assert(e.snapped(13,5,3.1,2.1));assert(!e.snapped(13,5,2.1,2.1));
for(const [c,r] of [[3,3],[5,4],[8,6]]){const p=e.initialPieces(c,r);assert.equal(p.length,c*r);assert(new Set(p.map(x=>x.piece_index)).size===c*r);const l=e.layout(1920,1080,c,r);assert(l.width<=720);assert(l.height<=405)}
assert.equal(e.edgeSign('v',2,4),e.edgeSign('v',2,4));
console.log('PASS: geometry, position snapping, difficulty and layout');
