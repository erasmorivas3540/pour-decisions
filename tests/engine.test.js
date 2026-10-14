import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine,JINXES} from '../game.js';
function setup(){
 let time=100000;const engine=new GameEngine({clock:()=>time,random:()=>.22});
 const A=engine.create('Alex','🦊');const B=engine.join(A.code,'Ben','🐸');const C=engine.join(A.code,'Cam','🐱');
 const people=[A,B,C];for(const p of people)engine.connection(p.code,p.id,p.token,1);
 const room=engine.room(A.code);
 const advance=(ms)=>{for(let x=0;x<ms;x+=50){time+=Math.min(50,ms-x);engine.tick();}}
 const run=(p,type,value)=>engine.action(p.code,p.id,p.token,type,value||{});
 const state=p=>engine.state(room,room.players.find(v=>v.id===p.id));
 const current=()=>people.find(p=>p.id===room.turn?.pourerId);
 const jinxer=()=>people.find(p=>p.id===room.turn?.jinxerId);
 const start=()=>{run(A,'start');for(const p of people)run(p,'ready');assert.equal(room.phase,'pour');};
 return {engine,room,A,B,C,people,advance,run,state,current,jinxer,start,get time(){return time;}};
}
test('create, join, duplicate names and basic access control',()=>{
 const s=setup();assert.match(s.A.code,/^[A-Z]{4}$/);
 assert.equal(s.room.players.length,3);
 const named=s.engine.join(s.A.code,'Alex','🐯');assert.equal(named.name,'Alex 2');
 assert.throws(()=>s.engine.join('OOOO','Unknown','🐻'),/Room not found/);
 assert.throws(()=>s.engine.auth(s.A.code,s.B.id,'bad'),/seat was not found/);
 assert.throws(()=>s.engine.create('','🦊'),/friendly name/);
});
test('host-only start, settings and required 2 connected',()=>{
 const s=setup();assert.throws(()=>s.run(s.B,'start'),/Only the host/);
 s.run(s.A,'settings',{spillLimit:5});assert.equal(s.room.settings.spillLimit,5);
 assert.throws(()=>s.run(s.A,'settings',{spillLimit:4}),/Choose 3, 5, or 7/);
 s.engine.connection(s.C.code,s.C.id,s.C.token,-1);
 s.engine.connection(s.B.code,s.B.id,s.B.token,-1);
 assert.throws(()=>s.run(s.A,'start'),/At least 2/);
 s.engine.connection(s.B.code,s.B.id,s.B.token,1);
 s.engine.connection(s.C.code,s.C.id,s.C.token,1);
 s.start();assert.equal(s.room.turn.turnNumber,1);
});
test('minimum 6, guess secrecy, one guess, correct scoring',()=>{
 const s=setup();s.start();const t=s.room.turn;t.jinx='fog';t.options=['fog',...t.options.filter(x=>x!=='fog').slice(0,3)];const p=s.current(),guessers=s.people.filter(x=>x.id!==p.id);
 assert.equal(t.jinx!=null,true);
 for(const g of guessers){const st=s.state(g);assert.equal(st.turn.jinx,null);assert.equal(st.turn.jinxDetail,null);assert.equal(st.turn.options.length,4);assert.equal(st.turn.cards.length,0);}
 assert.equal(s.state(p).turn.jinx,t.jinx);
 s.run(p,'pourDown');s.advance(50);s.run(p,'pourUp');s.advance(2000);
 assert.equal(s.room.phase,'guess');assert.ok(s.room.turn.added>=6-0.0001);
 s.run(guessers[0],'guess',{jinx:t.jinx});assert.throws(()=>s.run(guessers[0],'guess',{jinx:t.jinx}),/already guessed/);
 const wrong=t.options.find(x=>x!==t.jinx);s.run(guessers[1],'guess',{jinx:wrong});
 assert.throws(()=>s.run(p,'guess',{jinx:t.jinx}),/already know/);
 s.advance(5100);assert.equal(s.room.phase,'reveal');
 assert.equal(s.room.players.find(x=>x.id===guessers[0].id).score,5);
 assert.equal(s.room.players.find(x=>x.id===p.id).score,Math.round(10*JINXES.find(j=>j.id===t.jinx).mult)+2);
 assert.equal(s.state(guessers[1]).turn.jinx,t.jinx);
});
test('spill costs 15, sabotage earns 5, cup resets; 3 spills ends',()=>{
 const s=setup();s.start();
 s.room.settings.spillLimit=3;
 for(let attempt=0;attempt<3;attempt++){
  if(s.room.phase==='jinx'){const jin=s.jinxer();s.run(jin,'pickJinx',{jinx:s.room.turn.offered[0]});}
  assert.equal(s.room.phase,'pour');s.room.turn.jinx='fire';s.room.cup=99;s.room.turn.startCup=99;
  const pour=s.current(),jin=s.jinxer();
  s.run(pour,'pourDown');s.advance(1200);
  assert.equal(s.room.phase,'guess');
  s.advance(5100);assert.equal(s.room.phase,'reveal');assert.equal(s.room.reveal.spilled,true);
  assert.equal(s.room.players.find(x=>x.id===pour.id).score<=0,true);
  if(jin)assert.equal(s.room.players.find(x=>x.id===jin.id).sabotages>=1,true);
  s.advance(4600);assert.equal(s.room.phase,'scoreboard');assert.equal(s.room.cup,0);
  s.advance(5200);
  if(attempt<2)assert.ok(['jinx','pour'].includes(s.room.phase));
 }
 assert.ok(['gameover','pour'].includes(s.room.phase)); // tied scores may trigger a showdown
 assert.equal(s.room.spills,3);
});
test('every jinx is offered and timing effects change server water',()=>{
 const s=setup();s.start();assert.equal(JINXES.length,12);
 const t=s.room.turn,p=s.current();
 t.jinx='fire';s.room.cup=0;s.run(p,'pourDown');s.advance(500);assert.ok(s.room.cup>4&&s.room.cup<5);
 s.run(p,'pourUp');s.advance(1300);assert.equal(s.room.phase,'guess');
 const another=setup();another.start();another.room.turn.jinx='eye';another.run(another.current(),'pourDown');another.advance(1000);assert.ok(another.room.cup>=.9&&another.room.cup<=1.1);
 another.advance(7100);assert.equal(another.room.phase,'guess');assert.ok(another.room.turn.added>=6);
});
test('jinxer selects only offered cards; hidden until reveal',()=>{
 const s=setup();s.start();s.room.turn.jinx='fire';s.run(s.current(),'pourDown');s.advance(600);s.run(s.current(),'pourUp');s.advance(2500);s.advance(5100);s.advance(4600);
 assert.equal(s.room.phase,'jinx');const jin=s.jinxer();
 assert.ok(s.state(jin).turn.cards.length===3);
 const who=s.people.find(p=>p.id!==jin.id&&p.id!==s.room.turn.pourerId);
 assert.equal(s.state(who).turn.cards.length,0);
 assert.throws(()=>s.run(jin,'pickJinx',{jinx:'not-an-option'}),/Choose one/);
 s.run(jin,'pickJinx',{jinx:s.room.turn.offered[0]});
 assert.equal(s.state(who).turn.jinx,null);
 assert.equal(s.state(jin).turn.jinx,s.room.turn.jinx);
});
test('host handoff, pause on disconnect, reconnect preserves score',()=>{
 const s=setup();s.start();s.room.players[0].score=99;
 s.engine.connection(s.A.code,s.A.id,s.A.token,-1);
 s.advance(2100);assert.equal(s.room.hostId,s.B.id);
 assert.equal(s.room.pauseStarted,0,'two remaining players can continue');
 s.engine.connection(s.C.code,s.C.id,s.C.token,-1);
 assert.equal(s.room.pauseStarted>0,true,'one connected player pauses the game');
 s.engine.connection(s.A.code,s.A.id,s.A.token,1);
 assert.equal(s.room.pauseStarted,0);assert.equal(s.state(s.A).players[0].score,99);
 s.engine.connection(s.A.code,s.A.id,s.A.token,-1);s.advance(120100);
 assert.equal(s.room.phase,'gameover');assert.equal(s.room.winner,s.A.id);
});
test('mid-game join is spectator until a new cup, wrong/empty names filtered',()=>{
 const s=setup();s.start();
 const spectator=s.engine.join(s.A.code,'Dana','🐼');
 const d=s.room.players.find(p=>p.id===spectator.id);
 assert.equal(d.spectator,true);assert.equal(d.waitingSeat,true);
 s.engine.connection(s.A.code,spectator.id,spectator.token,1);
 assert.throws(()=>s.engine.join(s.A.code,'shit','🐼'),/friendly name/);
 assert.throws(()=>s.engine.action(spectator.code,spectator.id,spectator.token,'guess',{jinx:s.room.turn.options[0]}),/next turn/);
 s.room.turn.jinx='fire';s.room.cup=99;s.run(s.current(),'pourDown');s.advance(2000);s.advance(5100);s.advance(4600);
 assert.equal(s.room.phase,'scoreboard');assert.equal(d.spectator,false);
});
test('rematch clears scores, reshuffles participants and retains room',()=>{
 const s=setup();s.room.players[0].score=200;s.room.phase='gameover';s.room.winner=s.A.id;
 s.run(s.A,'rematch');assert.equal(s.room.phase,'lobby');assert.equal(s.room.spills,0);
 assert.equal(s.room.players.every(p=>p.score===0&&p.correct===0),true);
 assert.equal(s.room.code,s.A.code);
});
test('strict tie triggers same-jinx sudden death with turns for all finalists',()=>{
 const s=setup();s.room.phase='scoreboard';s.room.spills=3;s.room.deadline=s.time;
 s.room.players.forEach(p=>{p.score=10;p.correct=1;});s.advance(50);
 assert.equal(s.room.phase,'pour');assert.equal(s.room.duel.active,true);
 const j=s.room.turn.jinx;
 for(let i=0;i<3;i++){
  const p=s.current();s.run(p,'pourDown');s.advance(2550+i*350);s.run(p,'pourUp');s.advance(2100);assert.equal(s.room.phase,'guess');
  s.advance(5100);s.advance(4600);
  if(i<2)assert.equal(s.room.turn.jinx,j);
 }
 assert.equal(s.room.phase,'gameover');assert.ok(s.room.winner);
});
test('8 seats across independent players; ninth participant becomes a spectator',()=>{
 const s=setup();const added=[];
 for(let i=4;i<=8;i++){const p=s.engine.join(s.A.code,'Player '+i,'🐙');s.engine.connection(p.code,p.id,p.token,1);added.push(p);}
 assert.equal(s.room.players.filter(p=>!p.spectator).length,8);
 assert.equal(s.room.players.filter(p=>p.connectedAt>0).length,8);
 const ninth=s.engine.join(s.A.code,'Player Nine','🦄');
 assert.equal(s.room.players.find(p=>p.id===ninth.id).spectator,true);
 assert.equal(s.engine.sorted(s.room).length,8);
 assert.equal(s.room.players.length,9);
});
test('all 12 jinxes: timing, rate, foam, delayed view and inverted input',()=>{
 for(const j of JINXES){
  const s=setup();s.start();const {room,engine,advance}=s;
  room.cup=30;room.turn.startCup=30;engine.chooseJinx(room,j.id);
  const t=room.turn,p=s.current();
  assert.equal(s.state(p).turn.jinxDetail.id,j.id);
  if(j.id==='opposite'){
   assert.equal(t.started,true);advance(250);const before=room.cup;assert.ok(before>30);
   s.run(p,'pourDown');advance(200);assert.equal(room.cup,before);
   s.run(p,'pourUp');advance(200);assert.ok(room.cup>before);
   s.run(p,'stop');advance(2200);assert.equal(room.phase,'guess');continue;
  }
  s.run(p,'pourDown');advance(500);
  if(j.id==='fire')assert.ok(t.added>4&&t.added<5,'Fire Hose should pour at 9 units per second');
  if(j.id==='eye')assert.ok(t.added<3,'Eyedropper should pour slowly');
  if(j.id==='heavy')assert.ok(t.added<.01,'Heavy Arm must delay first 600ms');
  if(j.id==='ketchup')assert.equal(t.added,0,'Ketchup should stall');
  if(j.id==='soda')assert.equal(s.state(s.B).turn.foam,true);
  if(j.id==='fog'||j.id==='tunnel')assert.equal(s.state(p).level>30,true);
  if(j.id==='lag')assert.ok(s.state(p).level<room.cup);
  if(j.id==='shaky')assert.ok(t.added>=1.4&&t.added<2.5);
  if(j.id==='butter'){advance(1000);assert.equal(t.butterHappened,true);assert.ok(t.added>10);}
  if(j.id==='lights'){advance(1100);assert.equal(s.state(p).level,null);}
  if(j.id==='ketchup'){advance(900);assert.ok(t.added>0);}
  if(j.id==='heavy'){advance(300);assert.ok(t.added>0);}
  if(room.phase==='pour'){s.run(p,'pourUp');advance(2000);assert.equal(room.phase,'guess',j.id+' should finish');}
 }
});


test('two-player room starts and alternates jinx/pour without a detective phase',()=>{
 let now=100000;const engine=new GameEngine({clock:()=>now,random:()=>.22});
 const A=engine.create('Al','🦊');const B=engine.join(A.code,'Bo','🐸');
 const room=engine.room(A.code);const people=[A,B];
 const action=(p,type,value={})=>engine.action(p.code,p.id,p.token,type,value);
 const advance=ms=>{for(let i=0;i<ms;i+=50){now+=Math.min(50,ms-i);engine.tick();}};
 for(const p of people)engine.connection(p.code,p.id,p.token,1);
 action(A,'start');assert.equal(room.phase,'howto');
 action(A,'ready');action(B,'ready');assert.equal(room.phase,'pour');
 assert.equal(room.turn.headToHead,true);
 assert.equal(room.turn.jinxerId,null,'first jinx is chosen by game');
 const first=people.find(p=>p.id===room.turn.pourerId);
 const other=people.find(p=>p.id!==first.id);
 const hidden=engine.state(room,room.players.find(p=>p.id===other.id));
 assert.equal(hidden.turn.jinx,null);
 assert.equal(hidden.turn.options.length,0,'no guesses in two-player mode');
 assert.throws(()=>action(other,'guess',{jinx:room.turn.jinx}),/two-player game/);
 if(room.turn.jinx==='opposite'){advance(650);action(first,'stop');}
 else {action(first,'pourDown');advance(150);action(first,'pourUp');}
 for(let i=0;i<120&&room.phase==='pour';i++)advance(50);
 assert.equal(room.phase,'reveal','a two-player pour reveals immediately without 5s wait');
 assert.equal(room.players.find(p=>p.id===first.id).score,Math.round(10*JINXES.find(j=>j.id===room.turn.jinx).mult));
 advance(4600);
 assert.equal(room.phase,'jinx');assert.equal(room.turn.pourerId,other.id);
 assert.equal(room.turn.jinxerId,first.id);
 assert.equal(room.turn.headToHead,true);
 assert.equal(engine.state(room,room.players.find(p=>p.id===first.id)).turn.cards.length,3);
 assert.equal(engine.state(room,room.players.find(p=>p.id===other.id)).turn.cards.length,0);
 action(first,'pickJinx',{jinx:room.turn.offered.find(id=>!['opposite','ketchup'].includes(id))});
 const picked=room.turn.jinx;
 assert.equal(engine.state(room,room.players.find(p=>p.id===first.id)).turn.jinx,picked);
 assert.equal(engine.state(room,room.players.find(p=>p.id===other.id)).turn.jinx,picked);
 room.cup=99;
 action(other,'pourDown');for(let i=0;i<120&&room.phase==='pour';i++)advance(50);
 assert.equal(room.phase,'reveal','a spill reveals immediately, too');
 assert.equal(room.spills,1);
 assert.equal(room.players.find(p=>p.id===other.id).score,-15);
 assert.equal(room.players.find(p=>p.id===first.id).sabotages,1);
 assert.ok(room.players.find(p=>p.id===first.id).score>=5);
 advance(4600);assert.equal(room.phase,'scoreboard');assert.equal(room.cup,0);
 advance(5200);assert.ok(['jinx','pour'].includes(room.phase));
});

test('two-player disconnect pauses at one player and reconnect resumes',()=>{
 let now=100000;const engine=new GameEngine({clock:()=>now,random:()=>.22});
 const A=engine.create('Alex','🦊'),B=engine.join(A.code,'Blair','🐸');
 engine.connection(A.code,A.id,A.token,1);engine.connection(B.code,B.id,B.token,1);
 const room=engine.room(A.code);
 engine.action(A.code,A.id,A.token,'start');
 engine.action(A.code,A.id,A.token,'ready');engine.action(B.code,B.id,B.token,'ready');
 engine.connection(B.code,B.id,B.token,-1);
 assert.ok(room.pauseStarted);
 assert.throws(()=>engine.action(A.code,A.id,A.token,'pourDown'),/paused/);
 engine.connection(B.code,B.id,B.token,1);
 assert.equal(room.pauseStarted,0);assert.ok(['pour','reveal'].includes(room.phase));
});
