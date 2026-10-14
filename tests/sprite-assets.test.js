import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../public/',import.meta.url);
for(const name of ['overhead-water-sprites.webp','overhead-water-settled.webp']){
 test(`photo atlas ${name} is packaged as a valid WebP file`,()=>{
  const bytes=readFileSync(new URL(`assets/${name}`,root));
  assert.ok(bytes.length>10000,'asset should contain actual photographic image data');
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
 });
}
test('overhead photographic sprites are served with the correct MIME and no numerical volume marker',()=>{
 const css=readFileSync(new URL('style.css',root),'utf8');
 const app=readFileSync(new URL('app.js',root),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(css,/\.sprite-photoreal\.pouring \.sprite-animation\{background-image:url\('\/assets\/overhead-water-sprites.webp'\)/);
 assert.match(css,/\.sprite-photoreal \.sprite-animation\{[^}]*overhead-water-settled.webp/);
 assert.match(app,/data-pour-sprite/);
 assert.doesNotMatch(app,/Added \$\{Math\.round\(t\.added\)\} \/ 6 minimum/);
 assert.doesNotMatch(app,/class="glass-scale"/);
 assert.match(server,/'\.webp':'image\/webp'/);
});
