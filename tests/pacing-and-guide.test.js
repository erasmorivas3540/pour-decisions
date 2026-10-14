import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine, POUR_RATE, POUR_MAX_MS, EYEDROPPER_MAX_MS} from '../game.js';

function withPlayers(n=2){
  let now=100_000;
  const engine=new GameEngine({clock:()=>now,random:()=>.22});
  const players=[engine.create('Host','🦊')];
  for(let i=1;i<n;i++)players.push(engine.join(players[0].code,`Friend${i}`,'🐸'));
  for(const p of players)engine.connection(p.code,p.id,p.token,1);
  const room=engine.room(players[0].code);
  const action=(p,type,value={})=>engine.action(p.code,p.id,p.token,type,value);
  const advance=(ms)=>{for(let x=0;x<ms;x+=50){now+=Math.min(50,ms-x);engine.tick();}};
  return {engine,players,room,action,advance};
}

test('reading the rules never auto-advances; every player must actively confirm',()=>{
 for(const count of [2,3]){
  const s=withPlayers(count);s.action(s.players[0],'start');
  assert.equal(s.room.phase,'howto');assert.equal(s.room.deadline,0);
  s.advance(180_000);
  assert.equal(s.room.phase,'howto',`rules must still be on screen after 3 minutes (${count} players)`);
  for(const p of s.players.slice(0,-1))s.action(p,'ready');
  s.advance(15_000);
  assert.equal(s.room.phase,'howto','one unread player must block the game start');
  s.action(s.players.at(-1),'ready');
  assert.equal(s.room.phase,'pour','all ready allows start at once');
 }
});

test('pouring is 4x slower; normal, fire hose, and eyedropper keep their intended ratios',()=>{
 assert.equal(POUR_RATE,3);assert.equal(POUR_MAX_MS,12000);assert.equal(EYEDROPPER_MAX_MS,8000);
 for(const [jinx,rate] of [['fog',3],['fire',9],['eye',1]]){
  const s=withPlayers();s.action(s.players[0],'start');s.players.forEach(p=>s.action(p,'ready'));
  const t=s.room.turn;s.engine.chooseJinx(s.room,jinx);
  const pourer=s.players.find(p=>p.id===t.pourerId);
  s.action(pourer,'pourDown');s.advance(2000);
  assert.ok(Math.abs(t.added - rate*2)<.051,`${jinx} should add ${rate*2} in two seconds, got ${t.added}`);
  assert.ok(s.room.cup<20,'the shared cup should not rush to overflow');
 }
});

test('maximum normal pour is 36 units and mandatory release trickles at normal speed',()=>{
 const s=withPlayers();s.action(s.players[0],'start');s.players.forEach(p=>s.action(p,'ready'));
 const t=s.room.turn;s.engine.chooseJinx(s.room,'fog');const pourer=s.players.find(p=>p.id===t.pourerId);
 s.action(pourer,'pourDown');s.advance(500);s.action(pourer,'pourUp');
 assert.ok(t.added>1.4&&t.added<1.6);
 s.advance(500);assert.equal(s.room.phase,'pour');assert.ok(t.added>2.9&&t.added<3.1);
 s.advance(1100);assert.equal(s.room.phase,'reveal');assert.ok(t.added>=6);
 const b=withPlayers();b.action(b.players[0],'start');b.players.forEach(p=>b.action(p,'ready'));
 b.engine.chooseJinx(b.room,'fog');const p=b.players.find(x=>x.id===b.room.turn.pourerId);
 b.action(p,'pourDown');b.advance(12200);
 assert.equal(b.room.phase,'reveal');assert.ok(b.room.turn.added>35.7&&b.room.turn.added<36.3);
});
