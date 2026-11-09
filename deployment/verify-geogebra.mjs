import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = vm.createContext({});
vm.runInContext(fs.readFileSync('/tmp/geogebra-compat.js','utf8'), context);
const calls = [];
const api = {exists: object => ['A','O','t2'].includes(object)};
for (const method of ['setCoords','setPointSize','setColor','setCaption','setLabelStyle','setLabelVisible','setLineThickness']) {
  api[method] = (...args) => calls.push([method,...args]);
}
const cases = [
  ['SetCoords[A,2,0]', ['setCoords','A',2,0]],
  ['SetPointSize[A,7]', ['setPointSize','A',7]],
  ['SetColor[A,31,119,180]', ['setColor','A',31,119,180]],
  ['SetCaption[A,"m"]', ['setCaption','A','m']],
  ['SetLabelMode[A,3]', ['setLabelStyle','A',3]],
  ['SetLabelVisible[A,true]', ['setLabelVisible','A',true]],
  ['SetCaption[O,"0"]', ['setCaption','O','0']],
  ['SetLabelMode[O,3]', ['setLabelStyle','O',3]],
  ['SetLabelVisible[O,true]', ['setLabelVisible','O',true]],
  ['SetColor[t2,31,119,180]', ['setColor','t2',31,119,180]],
  ['ShowLabel(A,false)', ['setLabelVisible','A',false]],
  ['SetColor(A,0.5,0.25,1)', ['setColor','A',128,64,255]],
  ['SetCaption[A,"a\\\\"]', ['setCaption','A','a\\']],
];
for (const [command,expected] of cases) {
  assert.equal(context.handleGeoGebraProperty(api,command),true,command);
  assert.deepEqual(calls.at(-1),expected);
}
const count = calls.length;
assert.equal(context.handleGeoGebraProperty(api,'SetLabelVisible[Missing,true]'),false);
for(const command of ['SetColor[A,256,0,0]','SetCoords[A,2]','SetPointSize[A,0]','A=(2,0)']) {
  assert.equal(context.handleGeoGebraProperty(api,command),null,command);
}
assert.equal(calls.length,count);
console.log(JSON.stringify({geogebra_regression_cases:cases.length+5,passed:true}));
