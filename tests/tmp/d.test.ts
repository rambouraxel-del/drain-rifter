import { it } from 'vitest';
import { TrackGenerator, computeCorridor } from '../../src/track/TrackGenerator';
it('x',()=>{
  const gen=new TrackGenerator(31337); const segs:any[]=[],specs:any[]=[];let s=0;
  while(s<9800){const g=gen.nextSegment(s);segs.push(g);specs.push(...gen.obstaclesFor(g));s=g.s0+g.length;}
  for(const o of specs.filter(o=>o.s>9560&&o.s<9700)) console.log(o.kind,o.s.toFixed(2),o.u.toFixed(2),o.halfWidth.toFixed(2),o.depth.toFixed(2),JSON.stringify(o.motion));
  for(const x of computeCorridor(specs,segs).filter(x=>x.s1>9600&&x.s0<9690)) console.log(x.s0.toFixed(1),x.s1.toFixed(1),JSON.stringify(x.F.map((f:any)=>[+f.lo.toFixed(2),+f.hi.toFixed(2)])),JSON.stringify(x.R.map((f:any)=>[+f.lo.toFixed(2),+f.hi.toFixed(2)])));
});
