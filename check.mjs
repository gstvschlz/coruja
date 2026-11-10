// The one runnable check: typing averages 80 wpm (150 ms per character) within 3%.
import assert from 'node:assert/strict';
import typing from './extension/typing.js';

let seed = 42; // mulberry32, so the check is repeatable
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const words = ['puella', 'aquam', 'bibit', 'the', 'girl', 'drinks', 'water', 'ego', 'sum', 'Marcus'];
const all = [];
for (let i = 0; i < 2000; i++) {
  const n = 1 + Math.floor(rand() * 8);
  const text = Array.from({ length: n }, () => words[Math.floor(rand() * words.length)]).join(' ');
  const d = typing.keyDelays(text, typing.DEFAULT_SETTINGS, rand);
  assert.equal(d.length, [...text].length);
  all.push(...d);
}

const target = typing.msPerChar(typing.DEFAULT_SETTINGS.wpm);
const mean = all.reduce((a, b) => a + b, 0) / all.length;
const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length);

assert.equal(target, 150);
assert.ok(Math.abs(mean - target) / target <= 0.03, `mean ${mean.toFixed(1)} ms is not 150 ms +/- 3%`);
assert.ok(Math.min(...all) > 0, 'every delay must be positive');
assert.ok(sd > 20, `delays too uniform (sd ${sd.toFixed(1)} ms)`);
console.log(`ok: ${all.length} keys, mean ${mean.toFixed(1)} ms/char (${(60000 / (mean * 5)).toFixed(1)} wpm), sd ${sd.toFixed(1)} ms`);
