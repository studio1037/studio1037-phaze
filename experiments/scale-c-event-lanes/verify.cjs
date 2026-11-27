const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const elements = new Map();
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, {innerHTML:'',textContent:'',addEventListener(){}});
    return elements.get(id);
  },
  querySelector() { return {addEventListener(){},classList:{toggle(){}}}; },
  querySelectorAll() { return []; }
};
const source = fs.readFileSync(path.join(__dirname,'demo.js'),'utf8');
const context = vm.createContext({document,assert,print:console.log});
vm.runInContext(source,context);
vm.runInContext(`
 for (const n of [4,8,12,20]) {
  density=n;
  render();
  const counts=Array.from({length:DAY},(_,minute)=>model.sorted.filter(e=>e.start<=minute&&e.end>minute).length);
  assert.equal(model.sorted.length,n);
  assert.equal(model.occupied,counts.filter(n=>n>0).length);
  assert.equal(model.overlap,counts.filter(n=>n>1).length);
  assert.equal(model.peak,Math.max(...counts));
  assert.equal(model.sum,counts.reduce((a,b)=>a+b,0));
  assert.equal(model.occupied+model.free,960);
  for(const [i,count] of counts.entries()){
   const active=model.sorted.filter(e=>e.start<=i&&e.end>i);
   assert.equal(new Set(active.map(e=>e.lane)).size,count);
   assert.equal(model.overflow.find(e=>e.start<=i&&e.end>i)?.hidden.length??0,active.filter(e=>e.lane>=3).length);
  }
  assert.equal(($('hybrid').innerHTML.match(/class="anchor"/g)||[]).length,4);
  assert.equal(($('current').innerHTML.match(/<text/g)||[]).length,19);
  print(n,model.occupied,model.free,model.sum,model.peak,model.overlap,model.overflow.length);
 }
 const edge=analyze([[-30,10,'a'],[10,20,'b'],[950,1000,'c'],[960,980,'d'],[2,2,'e']]);
 assert.equal(edge.occupied,30);assert.equal(edge.peak,1);assert.equal(edge.sorted.length,3);
 assert.equal(analyze([]).free,960);
 assert.equal(analyze([[0,960,'all']]).occupied,960);
 wake=1385;render();
 assert.deepEqual([0,240,480,720,960,218].map(time).join(','),'23:05,03:05,07:05,11:05,15:05,02:43');
 assert.match($('hybrid').innerHTML,/>03:05</);
 late=true;render();assert.match($('hybrid').innerHTML,/Иди спать/);
 mode='clock';render();assert.doesNotMatch($('hybrid').innerHTML,/tabindex=/);
 mode='planner';render();assert.match($('hybrid').innerHTML,/data-overflow=/);
 showDetail({hasAttribute:x=>x==='data-overflow',dataset:{overflow:'0'}});
 assert.match($('detail').textContent,/ещё/);
`,context);

if (process.argv.includes('--plates')) {
  for (const density of [4,8,12,20]) {
    vm.runInContext(`wake=420;late=false;mode='planner';density=${density};render();`, context);
    for(const id of ['current','hybrid']) {
      const markup=elements.get(id).innerHTML;
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="468" height="456" viewBox="-14 -8 468 456"><style>text{font-family:DejaVu Sans;text-anchor:middle;dominant-baseline:middle;fill:#d3dff1}.anchor,.time{fill:#f4f6fb;font-weight:bold}.now-text{fill:#87e7c5;font-weight:bold}</style><rect x="-14" y="-8" width="468" height="456" fill="#151e30"/>${markup}</svg>`;
      fs.writeFileSync(path.join(__dirname,`plate-${density}-${id}.svg`),svg);
    }
  }
}
