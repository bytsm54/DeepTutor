function handleGeoGebraProperty(api, command) {
  const match = command.match(/^\s*(SetCoords|SetPointSize|SetColou?r|SetCaption|SetLabelMode|SetLabelVisible|ShowLabel|SetLineThickness)\s*[\[(]\s*([A-Za-z][\w']*)\s*,\s*(.*?)\s*[\])]\s*$/i);
  if (!match) return null;
  const name = match[1].toLowerCase(), object = match[2], raw = match[3];
  const methods = {setcoords: 'setCoords', setpointsize: 'setPointSize', setcolor: 'setColor', setcolour: 'setColor', setcaption: 'setCaption', setlabelmode: 'setLabelStyle', setlabelvisible: 'setLabelVisible', showlabel: 'setLabelVisible', setlinethickness: 'setLineThickness'};
  const method = methods[name];
  if (typeof api[method] !== 'function') return null;
  let args;
  if (name === 'setcaption') {
    try { args = [JSON.parse(raw)]; } catch { return null; }
    if (typeof args[0] !== 'string') return null;
  } else if (name === 'setlabelvisible' || name === 'showlabel') {
    if (!/^(true|false)$/i.test(raw)) return null;
    args = [raw.toLowerCase() === 'true'];
  } else {
    const parts = raw.split(',').map(x => x.trim());
    if (parts.some(x => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(x))) return null;
    args = parts.map(Number);
    const n = args.length;
    if ((name === 'setcoords' && n !== 2 && n !== 3) || ((name === 'setcolor' || name === 'setcolour') && n !== 3) || (!['setcoords', 'setcolor', 'setcolour'].includes(name) && n !== 1)) return null;
    if (args.some(x => !Number.isFinite(x))) return null;
    if ((name === 'setcolor' || name === 'setcolour') && args.every(x => x >= 0 && x <= 1) && args.some(x => !Number.isInteger(x))) args = args.map(x => Math.round(x * 255));
    if ((name === 'setcolor' || name === 'setcolour') && args.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return null;
    if (name === 'setpointsize' && (!Number.isInteger(args[0]) || args[0] < 1 || args[0] > 9)) return null;
    if (name === 'setlabelmode' && (!Number.isInteger(args[0]) || args[0] < 0 || args[0] > 3)) return null;
    if (name === 'setlinethickness' && (!Number.isInteger(args[0]) || (args[0] !== -1 && (args[0] < 1 || args[0] > 13)))) return null;
  }
  if (api.exists && !api.exists(object)) return false;
  api[method](object, ...args);
  return true;
}
