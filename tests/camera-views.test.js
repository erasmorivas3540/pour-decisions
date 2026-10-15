import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const section=(start,end)=>{
  // Identify function declarations, not their whitespace-sensitive formatting.
  const name=(marker)=>{
    const match=/function\\s+([A-Za-z_$][\\w$]*)\\s*\\(/.exec(marker);
    assert.ok(match,`Invalid function marker: ${marker}`);
    return match[1];
  };
  const functionStart=(marker,offset=0)=>{
    const declaration=new RegExp(`\\bfunction\\s+${name(marker)}\\s*\\(`,'g');
    declaration.lastIndex=offset;
    return declaration.exec(source)?.index??-1;
  };
  const a=functionStart(start);
  const b=functionStart(end,a+1);
  assert.ok(a>=0&&b>a,`Source functions ${start} / ${end} must be present`);
  return source.slice(a,b);
};
const functions=section('function cupScene(','function home(){')+'\n'+section('function pourScreen(){','function revealScreen(){');

function screenFor(me,pourerId='player1',phase='pour',jinx='fog'){
 const room={me,level:42,phase,turnNumber:2,spills:0,spillLimit:3,duel:null,
  turn:{pourerId,jinxerId:pourerId==='player1'?'player2':'player1',jinxDetail:me===pourerId?{id:jinx,name:'Foggy Glasses',icon:'🌫️',mult:1.5,desc:'Blurry cup'}:null,
    foam:false,flowing:true,elapsedMs:500,headToHead:true,added:3,started:true,pourRemainingMs:9000,dripping:false,guessed:false,options:[]}};
 const context={state:{room,held:false},nameFor:id=>id,countdown:()=>'',scoreboardSidebar:()=>'',guessButtons:()=>'',Math};
 vm.createContext(context);vm.runInContext(functions+'\nthis.screen=pourScreen();',context);
 return context.screen;
}

test('active pourer sees overhead glass; rival sees side; roles reverse next turn',()=>{
 const first=screenFor('player1');
 assert.match(first,/data-camera="overhead"/);assert.doesNotMatch(first,/data-camera="side"/);
 assert.match(first,/blurry/,'pourer retains Foggy Glasses effect');
 const rival=screenFor('player2');
 assert.match(rival,/data-camera="side"/);assert.doesNotMatch(rival,/data-camera="overhead"/);
 assert.doesNotMatch(rival,/\bblurry\b/,'spectators do not inherit pourer-only effects');
 const secondPourer=screenFor('player2','player2');
 assert.match(secondPourer,/data-camera="overhead"/);
 const firstWatching=screenFor('player1','player2');
 assert.match(firstWatching,/data-camera="side"/);
});

test('side camera has continuously updated water height; overhead shows synced photographic frames',()=>{
 const src=section('function updateVitals(){','let audioCtx=null;');
 const helpers=section('function spriteBlendFor(','function home(){');
 for(const camera of ['side','overhead']){
  const water={style:{setProperty(){}}};
  const sprite={style:{backgroundPosition:''}};const next={style:{backgroundPosition:'',opacity:''}};
  const stage={dataset:{camera,spriteFrame:'0'},style:{setProperty(){}},classList:{toggle(){}},querySelector:selector=>selector==='[data-water]'?(camera==='side'?water:null):selector==='[data-pour-sprite]'?sprite:selector==='[data-pour-next]'?next:null};
  const context={state:{room:{phase:'pour',level:40,turn:{pourerId:'other',foam:false,flowing:false,started:false,dripping:false,elapsedMs:0}},held:false},document:{querySelectorAll:()=>[]},$:selector=>selector==='[data-cup-stage]'?stage:null,relativeTimer:()=>0,seconds:()=>'',performance:{now:()=>0},sound:()=>{},Math};
  vm.createContext(context);vm.runInContext(helpers+'\n'+src+'\nupdateVitals()',context);
  if(camera==='side')assert.equal(water.style.height,'40%');
  else {assert.equal(stage.dataset.spriteFrame,'2');assert.equal(sprite.style.backgroundPosition,'66.66666666666667% 0%');assert.equal(next.style.opacity,'0.8000000000000003');}
 }
});

test('photo frames advance with water, and no numerical cup markers reveal its level',()=>{
 const helper=section('function spriteBlendFor(','function home(){');
 const context={Math};vm.createContext(context);vm.runInContext(helper+'\nthis.pick=spriteFrameFor;this.pos=spritePosition;',context);
 assert.equal(context.pick(0,false),0);
 assert.equal(context.pick(48,false),3);
 assert.equal(context.pick(100,false),7);
 assert.equal(context.pick(48,true,10),6);
 assert.equal(context.pick(48,true,400),6);
 assert.equal(context.pos(6),'66.66666666666667% 100%');
 const pour=screenFor('player1');
 assert.match(pour,/data-pour-sprite/);
 assert.doesNotMatch(pour,/center-readout|class="measure|class="glass-scale|Added 3 \/ 6/);
 const spectator=screenFor('player2');
 assert.doesNotMatch(spectator,/class="glass-scale|75<\/span>|50<\/span>|25<\/span>/);
});

test('16 photographic frames progress with fill and blend smoothly without advancing backwards',()=>{
 const helpers=section('function spriteBlendFor(','function home(){');
 const context={Math};vm.createContext(context);vm.runInContext(helpers+'\nthis.blend=spriteBlendFor;this.pos=spritePosition;',context);
 const pick=context.blend,pos=context.pos;
 assert.equal(pick(0,true).frame,0);
 assert.equal(pick(50,true).frame,7);
 assert.equal(pick(100,true).frame,14);
 assert.equal(pick(100,true).next,14);
 assert.equal(pos(0,true),'0% 0%');
 assert.equal(pos(6,true),'66.66666666666667% 33.333333333333336%');
 assert.equal(pos(14,true),'66.66666666666667% 100%');
 assert.equal(pos(7,false),'100% 100%');
 assert.ok(pick(41,true).mix>0&&pick(41,true).mix<1);
 for(let n=1;n<=100;n++)assert.ok(pick(n,true).frame>=pick(n-1,true).frame);
 const pour=screenFor('player1');
 assert.match(pour,/data-pour-next/);
 assert.doesNotMatch(pour,/center-readout|class="measure|class="glass-scale/);
});
