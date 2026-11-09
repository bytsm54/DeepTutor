import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const base = '/app/web/.next';
const dir = path.join(base, 'static/chunks');
const marker = '!function(e,r){let t=r.match(/^SetLineThickness';
// Locate the actual execution module, rather than relying on a release's
// webpack chunk number. Still fail closed if its implementation changes.
const files = fs.readdirSync(dir).filter(n => /\.[a-f0-9]+\.js$/.test(n)
  && fs.readFileSync(path.join(dir,n),'utf8').includes(marker));
if (files.length !== 1) throw Error('Expected one GeoGebra chunk');
const oldName = files[0], file = path.join(dir, oldName);
const oldHash = oldName.split('.')[1];
const src = fs.readFileSync(file, 'utf8');
if (src.split(marker).length !== 2) throw Error('Unexpected GeoGebra execution module');
const helper = fs.readFileSync('/tmp/geogebra-compat.js', 'utf8');
const patched = src.replace(marker, '!function(e,r){' + helper + ';let handled=handleGeoGebraProperty(e,r);if(handled!==null)return handled;let t=r.match(/^SetLineThickness');
new vm.Script(patched);
const hash = crypto.createHash('sha256').update(patched).digest('hex').slice(0, oldHash.length);
const newName = oldName.replace(oldHash, hash);
fs.writeFileSync(path.join(dir, newName), patched);
// Existing tabs can still have the old webpack loader cached. Keep its URL
// available too; a hard refresh will pick up the new content-addressed URL.
fs.writeFileSync(file, patched);
function* walk(d) { for (const e of fs.readdirSync(d, {withFileTypes:true})) { const p=path.join(d,e.name); if(e.isDirectory()) yield* walk(p); else if(e.isFile()) yield p; } }
let references=0;
for (const p of walk(base)) {
  if (!/\.(js|json|html|rsc)$/.test(p)) continue;
  const s=fs.readFileSync(p,'utf8');
  if (!s.includes(oldHash)) continue;
  references += s.split(oldHash).length-1;
  fs.writeFileSync(p,s.replaceAll(oldHash,hash));
}
if (!references) throw Error('No GeoGebra chunk references updated');
const builtin='/app/deeptutor/visualizers/builtin.py';
const py=fs.readFileSync(builtin,'utf8');
const old='SetPointSize, SetLabelVisible and SetLabelMode sparingly';
const patchedPrompt='SetPointSize, ShowLabel and SetLabelMode sparingly';
// The prompt lives in Python, so rebuilding only the frontend re-runs this
// script against a file that already carries the patch. Keep that idempotent;
// the chunk half above still fails closed if the build changed shape.
if(!py.includes(patchedPrompt)){
  if(py.split(old).length!==2) throw Error('Unexpected GeoGebra prompt');
  fs.writeFileSync(builtin,py.replace(old,patchedPrompt));
}
console.log(JSON.stringify({oldName,newName,references}));
