import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const section=(start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
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
 const helpers=section('function spriteFrameFor(','function home(){');
 for(const camera of ['side','overhead']){
  const water={style:{setProperty(){}}};
  const sprite={style:{backgroundPosition:''}};
  const stage={dataset:{camera,spriteFrame:'0'},style:{setProperty(){}},classList:{toggle(){}},querySelector:selector=>selector==='[data-water]'?(camera==='side'?water:null):selector==='[data-pour-sprite]'?sprite:null};
  const context={state:{room:{phase:'pour',level:40,turn:{pourerId:'other',foam:false,flowing:false,started:false,dripping:false,elapsedMs:0}},held:false},document:{querySelectorAll:()=>[]},$:selector=>selector==='[data-cup-stage]'?stage:null,relativeTimer:()=>0,seconds:()=>'',performance:{now:()=>0},sound:()=>{},Math};
  vm.createContext(context);vm.runInContext(helpers+'\n'+src+'\nupdateVitals()',context);
  if(camera==='side')assert.equal(water.style.height,'40%');
  else {assert.equal(stage.dataset.spriteFrame,'2');assert.equal(sprite.style.backgroundPosition,'66.66666666666667% 0%');}
 }
});

test('photo frames advance with water, and no numerical cup markers reveal its level',()=>{
 const helper=section('function spriteFrameFor(','function home(){');
 const context={Math};vm.createContext(context);vm.runInContext(helper+'\nthis.pick=spriteFrameFor;this.pos=spritePosition;',context);
 assert.equal(context.pick(0,false),0);
 assert.equal(context.pick(48,false),3);
 assert.equal(context.pick(100,false),6);
 assert.equal(context.pick(48,true,10),3);
 assert.equal(context.pick(48,true,400),4);
 assert.equal(context.pos(6),'66.66666666666667% 100%');
 const pour=screenFor('player1');
 assert.match(pour,/data-pour-sprite/);
 assert.doesNotMatch(pour,/center-readout|class="measure|class="glass-scale|Added 3 \/ 6/);
 const spectator=screenFor('player2');
 assert.doesNotMatch(spectator,/class="glass-scale|75<\/span>|50<\/span>|25<\/span>/);
});
