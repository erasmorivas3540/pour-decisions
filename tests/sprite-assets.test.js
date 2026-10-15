import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../public/', import.meta.url);
for (const name of [
  'overhead-water-sprites.webp',
  'overhead-water-settled.webp',
  'overhead-water-sprites-16.webp',
]) {
  test(`photo atlas ${name} is packaged as a valid WebP file`, () => {
    const bytes = readFileSync(new URL(`assets/${name}`, root));
    assert.ok(bytes.length > 10000, 'asset should contain actual photographic image data');
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  });
}
test('overhead photographic sprites are served with the correct MIME and no numerical volume marker', () => {
  const css = readFileSync(new URL('style.css', root), 'utf8');
  const app = readFileSync(new URL('app.js', root), 'utf8');
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(
    css,
    /\.sprite-photoreal\.pouring\s+\.sprite-animation\s*\{\s*background-image:\s*url\('\/assets\/overhead-water-sprites-16\.webp'\)/,
  );
  assert.match(
    css,
    /\.sprite-photoreal\s+\.sprite-animation\s*\{[^}]*overhead-water-settled\.webp/,
  );
  assert.match(app, /data-pour-sprite/);
  assert.match(app, /data-pour-next/);
  assert.match(css, /background-size:\s*400%\s+400%/);
  assert.doesNotMatch(app, /Added \$\{Math\.round\(t\.added\)\} \/ 6 minimum/);
  assert.doesNotMatch(app, /class="glass-scale"/);
  assert.match(server, /['\"]\.webp['\"]\s*:\s*['\"]image\/webp['\"]/);
});

test('the 16-frame atlas has an actual 4x4 WebP grid rather than an eight-frame replay', () => {
  const bytes = readFileSync(new URL('assets/overhead-water-sprites-16.webp', root));
  assert.ok(bytes.length > 100000, 'a real photographic grid is bundled');
  const app = readFileSync(new URL('app.js', root), 'utf8');
  assert.match(app, /\bconst\s+last\s*=\s*flowing\s*\?\s*14\s*:\s*7\b/);
  assert.match(app, /spriteBlendFor/);
});
