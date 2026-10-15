import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function integration(){
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,PORT:'0',GAME_TIME_SCALE:'0.5'},stdio:['ignore','pipe','pipe']});
 const clients=[];
 try{
  let port=null;let stdout='';child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{stdout+=chunk;const m=stdout.match(/:(\d+)/);if(m)port=m[1];});
  const deadline=Date.now()+4000;while(!port&&Date.now()<deadline)await sleep(20);
  assert.ok(port,'server did not start');const base=`http://127.0.0.1:${port}`;
  async function post(path,b){const r=await fetch(base+'/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
  const sessions=[await post('create',{name:'Test Host',avatar:'🦊'})];
  sessions.push(await post('join',{code:sessions[0].code,name:'Second',avatar:'🐸'}));
  sessions.push(await post('join',{code:sessions[0].code,name:'Third',avatar:'🐱'}));
  for(const s of sessions){
    const controller=new AbortController();
    const url=`${base}/api/stream?code=${s.code}&id=${s.id}&token=${s.token}`;
    const res=await fetch(url,{signal:controller.signal});assert.equal(res.status,200);
    const client={controller,state:null,history:[],id:s.id};clients.push(client);
    const reader=res.body.getReader();
    (async()=>{let buffer='';try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=new TextDecoder().decode(value);let i;while((i=buffer.indexOf('\n\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+2);const payload=line.split('\n').find(x=>x.startsWith('data: '));if(payload){client.state=JSON.parse(payload.slice(6));client.history.push(client.state);if(client.history.length>100)client.history.shift();}}}}catch{}})();
  }
  const waitFor=async(fn,timeout=5000)=>{const until=Date.now()+timeout;while(Date.now()<until){const result=fn();if(result)return result;await sleep(30);}throw new Error('Timed out waiting for state '+clients.map(c=>c.state?.phase).join(','));};
  await waitFor(()=>clients.every(c=>c.state?.players.filter(p=>p.connected).length===3));
  await post('action',{...sessions[0],type:'start'});
  await waitFor(()=>clients.every(c=>c.state?.phase==='howto'));
  for(const s of sessions)await post('action',{...s,type:'ready'});
  await waitFor(()=>clients.every(c=>c.state?.phase==='pour'));
  const pourer=clients.find(c=>c.state.me===c.state.turn.pourerId);
  const pourerS=sessions.find(s=>s.id===pourer.id);
  const guessers=clients.filter(c=>c!==pourer);
  assert.equal(guessers.length,2);
  assert.equal(pourer.state.turn.jinx?.length>0,true);
  for(const g of guessers){assert.equal(g.state.turn.jinx,null);assert.equal(g.state.turn.jinxDetail,null);assert.equal(g.state.turn.options.length,4);}
  await post('action',{...pourerS,type:'pourDown'});
  await sleep(240);
  await post('action',{...pourerS,type:'pourUp'});
  // Opposite Controls keeps the bottle flowing on release; its separate Stop control ends it.
  if(pourer.state.turn.jinx==='opposite')await post('action',{...pourerS,type:'stop'});
  await waitFor(()=>clients.every(c=>c.state?.phase==='guess'),4000);
  assert.ok(guessers[0].history.some(s=>s.phase==='pour'&&s.level>0),'water should sync over SSE');
  assert.ok(guessers[1].state.level>=6);
  const actual=pourer.state.turn.jinx;
  const guesserS=sessions.find(s=>s.id===guessers[0].id);
  await post('action',{...guesserS,type:'guess',value:{jinx:actual}});
  await assert.rejects(post('action',{...guesserS,type:'guess',value:{jinx:actual}}),/already guessed/);
  await waitFor(()=>clients.every(c=>c.state?.phase==='reveal'),5000);
  assert.equal(guessers[0].state.turn.jinx,actual);
  assert.ok(guessers[0].state.players.find(p=>p.id===guesserS.id).score>=5);
  // The HTTP API never accepts a fabricated identity.
  await assert.rejects(post('action',{...sessions[1],token:'not-a-token',type:'start'}),/seat was not found/);
  assert.equal((await fetch(base+'/health')).status,200);
  console.log(`Verified SSE multicasting and secret jinx isolation for ${sessions.length} remote HTTP clients.`);
 }finally{
  clients.forEach(c=>c.controller.abort());child.kill('SIGTERM');
  await Promise.race([once(child,'exit'),sleep(1500)]).catch(()=>{});
 }
}
test('real HTTP server: 3 independent live clients, hidden jinx, scoring, access checks',integration,{timeout:14000});
