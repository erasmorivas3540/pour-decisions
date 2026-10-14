const $=s=>document.querySelector(s);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const AVATARS=['🦊','🐸','🐻','🐱','🐼','🐨','🦄','🐙','🐧','🐯','🦖','🐝'];
const HOW=[{icon:'🃏',title:'Jinx your friend',text:'After each pour, the pourer picks one of three secret handicaps for the next person. Only those two know the jinx.'},{icon:'🫗',title:'Pour… carefully',text:'Hold the big button to pour, release to stop. You MUST add at least 6 units. Anything over 100 makes a splash!'},{icon:'🕵️',title:'Guess & score',text:'Everyone else guesses the jinx. Safe pour: +10, +15 or +20. Correct guess: +5. Wrong guess: +2 for the pourer. A spill costs −15!'}];
const ICONS={brand:'🫗'};
const state={view:'home',mode:'join',avatar:'🦊',session:null,room:null,source:null,connected:false,renderKey:'',muted:false,reduceMotion:localStorage.getItem('pd_motion')==='1',howOpen:false,howStep:0,howExtra:false,formName:localStorage.getItem('pd_name')||'',formCode:'',held:false,lastPhase:'',lastTurn:0,soundTime:0,serverAt:0,receivedAt:0};
const params=new URLSearchParams(location.search);state.formCode=(params.get('room')||'').replace(/[^a-z]/gi,'').toUpperCase().slice(0,4);
if(state.formCode)state.view='join';
function savePrefs(){localStorage.setItem('pd_name',state.formName);localStorage.setItem('pd_motion',state.reduceMotion?'1':'0');}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),3200);}
async function request(route,payload){
  const resp=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let data;try{data=await resp.json();}catch{throw Error('Unable to reach the game server.');}
  if(!resp.ok)throw Error(data.error||'Something went wrong.');return data;
}
async function apiAction(type,value={}){if(!state.session)return;
  try{await request('action',{...state.session,type,value});}catch(e){if(type==='pourUp'&&/not your turn/i.test(e.message))return;toast(e.message);}
}
function setView(view){state.view=view;state.renderKey='';render();}
function storeSession(s){
  state.session=s;localStorage.setItem('pd_seat_'+s.code,JSON.stringify(s));
  history.replaceState({},'',`/?room=${s.code}`);state.formCode=s.code;setView('game');connect();
}
async function createJoin(mode){
  state.formName=($('#name-field')?.value||'').trim().slice(0,12);
  state.formCode=($('#code-field')?.value||state.formCode).trim().replace(/[^a-z]/gi,'').toUpperCase().slice(0,4);
  savePrefs();if(!state.formName)return toast('Pick a nickname first!');
  if(mode==='join'&&state.formCode.length!==4)return toast('Enter the four-letter room code.');
  const button=$('[data-submit]');if(button)button.disabled=true;
  try{const s=await request(mode==='join'?'join':'create',{name:state.formName,avatar:state.avatar,code:state.formCode});storeSession(s);}
  catch(e){toast(e.message);if(button)button.disabled=false;}
}
function connect(){
  if(!state.session)return;
  state.source?.close();
  const s=state.session;
  const url=`/api/stream?code=${encodeURIComponent(s.code)}&id=${encodeURIComponent(s.id)}&token=${encodeURIComponent(s.token)}`;
  const source=new EventSource(url);state.source=source;
  source.addEventListener('state',event=>{
    if(source!==state.source)return;
    try{const newRoom=JSON.parse(event.data);const old=state.room;
      state.connected=true;state.room=newRoom;state.receivedAt=performance.now();state.serverAt=newRoom.serverTime;
      if(newRoom.phase!==state.lastPhase){onPhase(newRoom,old);state.lastPhase=newRoom.phase;}
      render();updateVitals();
    }catch(e){console.error(e);}
  });
  source.onerror=()=>{if(source!==state.source)return;state.connected=false;updateVitals();};
}
function onPhase(room,old){
  if(room.phase==='reveal'){
    if(room.reveal?.spilled){sound('splash');if(navigator.vibrate)navigator.vibrate([80,70,120]);}
    else sound('reveal');
  }else if(room.phase==='gameover')sound('winner');
  else if(room.phase==='pour')sound('pop');
  if(old?.phase==='pour'&&room.phase!=='pour')state.held=false;
}
function leaveRoom(){state.source?.close();state.source=null;state.session=null;state.room=null;state.connected=false;history.replaceState({},'', '/');state.formCode='';state.renderKey='';setView('home');}
function navbar(){const r=state.room,s=state.session;
  return `<header class="topbar"><div class="brand"><div class="brand-mark">${ICONS.brand}</div><span>POUR DECISIONS</span></div><div class="top-actions">${s?`<span class="connection ${state.connected?'':'offline'}" data-connection>${state.connected?'LIVE':'RECONNECTING'}</span><button class="room-tag" data-copy title="Copy invitation">${escapeHTML(s.code)} ⧉</button>`:''}<button class="mini-btn" data-mute title="${state.muted?'Unmute':'Mute'}" aria-label="Toggle sound">${state.muted?'🔇':'🔊'}</button><button class="mini-btn" data-motion title="Reduce motion" aria-label="Toggle reduced motion">${state.reduceMotion?'🌿':'✨'}</button><button class="mini-btn" data-help title="How to play" aria-label="How to play">?</button></div></header>`;
}
function footer(){return `<footer class="footer">🫗 Pour Decisions · Made for long-distance friendships and terrible choices</footer>`;}
function cupScene(level=0,{foam=false,danger=false,pouring=false,jinx='',elapsed=0,spilled=false,hero=false}={}){
  const visualLevel=Math.min(100,Math.max(0,level??0)+(foam?10:0));
  const cls=['cup-stage',danger?'danger':'',pouring?'pouring':'',foam?'foamy':'',spilled?'spilled':'',jinx==='fog'?'blurry':'',jinx==='tunnel'?'tunnel':'',jinx==='shaky'?'shaky':'',jinx==='lights'&&elapsed>1500?'lights-dark':''].filter(Boolean).join(' ');
  return `<div class="${cls}" data-cup-stage style="--visual-level:${visualLevel}"><div class="cup-scene"><span class="cup-deco">✳</span><div class="bottle"><svg viewBox="0 0 115 165" aria-hidden="true"><path d="M43 7h30v36l16 20 2 89Q61 165 26 150V63l17-20Z" fill="#ffdb8f" stroke="#223452" stroke-width="6" stroke-linejoin="round"/><rect x="41" y="5" width="35" height="26" rx="5" fill="#ec705c" stroke="#223452" stroke-width="6"/><rect x="28" y="77" width="61" height="45" rx="8" fill="#fffaf0" stroke="#223452" stroke-width="4"/><text x="58" y="99" text-anchor="middle" font-size="11" font-family="system-ui" font-weight="900" fill="#223452">ONE</text><text x="58" y="114" text-anchor="middle" font-size="10" font-family="system-ui" font-weight="900" fill="#223452">MORE</text></svg></div><div class="stream"></div><div class="cup-shadow"></div><div class="cup"><div class="cup-line"></div><div class="water" data-water style="height:${visualLevel}%"></div></div><div class="foam"></div>${danger?'<span class="danger-label">⚠ DANGER ZONE</span>':''}</div><div class="stage-bottom"><span class="stage-caption">${hero?'THE SHARED CUP · 100 UNITS':spilled?'💦 OVERFLOW!':danger?'⚠ CAREFUL — ALMOST FULL!':'THE SHARED CUP · DON’T OVERFILL IT'}</span></div></div>`;
}
function home(){return `<main><section class="hero"><div class="hero-copy"><div class="row wrap"><span class="pill">🎉 YOUR NEW PARTY OBSESSION</span><span class="pill white">3–8 PLAYERS</span></div><h1 style="margin-top:24px">Pour<br/>Decisions.<em>Bad choices.<br/>Great friends.</em></h1><p class="lead">A shared cup. Secret jinxes. Suspicious friends. How much can you pour before the party spills over?</p><div class="hero-buttons"><button class="btn btn-primary" data-open="create">✨ Create a room →</button><button class="btn btn-white" data-open="join">🔑 Join friends</button></div><div class="hero-social"><div class="avatar-stack"><span>🐸</span><span>🦊</span><span>🐻</span><span>🐱</span></div><span>No downloads. No signups. Just chaos.</span></div></div><div class="hero-art"><div class="sticker one">🃏 SECRET JINX!</div><div class="hero-spark">✨</div>${cupScene(58,{hero:true,pouring:true})}<div class="sticker two">💦 DON'T SPILL!</div></div></section><section style="margin-top:18px"><div class="section-heading"><h2>Three steps to trouble.</h2><span class="pill mint">5–10 MIN / GAME</span></div><div class="how-grid"><div class="card how-mini"><span class="num">🃏</span><h3>01. Jinx</h3><p>Secretly sabotage the next player with a weird handicap.</p></div><div class="card how-mini"><span class="num">🫗</span><h3>02. Pour</h3><p>Hold to fill the cup. Add 6+ units. Don't go past 100.</p></div><div class="card how-mini"><span class="num">🕵️</span><h3>03. Guess</h3><p>Call out their jinx to score points. Repeat until the last spill.</p></div></div></section></main>`;}
function authScreen(){const joining=state.view==='join';return `<div class="auth-layout"><button class="mini-btn" data-home>← Back</button><div style="margin-top:21px"><span class="pill">${joining?'🔑 THE MORE, THE MESSIER':'✨ START THE PARTY'}</span></div><h2 style="margin-top:14px">${joining?'Join the chaos.':'Your kitchen. Your rules.'}</h2><p class="muted strong" style="line-height:1.5">${joining?'Enter your friends’ four-letter room code.':'Create a room, invite your crew, and get pouring.'}</p><div class="card auth-card"><form id="join-form"><label class="field-label" for="name-field">Your nickname</label><input id="name-field" class="field" maxlength="12" placeholder="e.g. Captain Splash" value="${escapeHTML(state.formName)}" autocomplete="nickname" required/>${joining?`<label class="field-label form-label-space" for="code-field">Room code</label><input id="code-field" class="field code" inputmode="latin" pattern="[A-Za-z]{4}" maxlength="4" placeholder="ABCD" value="${escapeHTML(state.formCode)}" required />`:''}<div class="form-label-space"><span class="field-label">Pick your game face</span><div class="avatar-picker">${AVATARS.map(a=>`<button class="avatar-choice ${a===state.avatar?'selected':''}" type="button" data-avatar="${a}" aria-label="Avatar ${a}" aria-pressed="${a===state.avatar}">${a}</button>`).join('')}</div></div><button class="btn btn-primary full" style="margin-top:23px" data-submit type="submit">${joining?'🚀 Join room →':'🫗 Create room →'}</button></form><div class="divider-text">or</div><button class="btn btn-white full btn-small" data-open="${joining?'create':'join'}">${joining?'Create your own room instead':'Have a room code? Join friends'}</button></div></div>`;}
function getMe(){return state.room?.players.find(p=>p.id===state.room.me);}
function nameFor(id){const p=state.room?.players.find(p=>p.id===id);return p?escapeHTML(p.name):'Someone';}
function avatarFor(id){return state.room?.players.find(p=>p.id===id)?.avatar||'❔';}
function relativeTimer(){const r=state.room;if(!r)return 0;return Math.max(0,(r.paused?r.pauseRemaining:r.remainingMs)-(performance.now()-state.receivedAt));}
function seconds(n){return Math.ceil(n/1000)+'s';}
function seatList(){const r=state.room;const seated=r.players.filter(p=>!p.spectator);return `<div class="lobby-players">${Array.from({length:Math.max(3,seated.length)},(_,i)=>{const p=seated[i];return p?`<div class="seat"><span class="face">${p.avatar}</span><span>${escapeHTML(p.name)} ${p.id===r.hostId?'👑':''}${!p.connected?'<small style="display:block;color:#b35d53">reconnecting…</small>':''}</span></div>`:`<div class="seat empty">＋ Waiting for a friend…</div>`;}).join('')}</div>`;}
function lobby(){const r=state.room;const me=getMe();const seated=r.players.filter(p=>!p.spectator);const live=seated.filter(p=>p.connected).length;const isHost=r.hostId===r.me;
  return `<div class="gamehead center"><span class="pill">🎉 PARTY LOBBY</span><h2>Your crew is assembling!</h2><p>Send the code or invite link to friends on any device.</p></div><div class="card lobby-card"><div class="center"><span class="eyebrow muted">YOUR ROOM CODE</span><div class="lobby-code">${r.code}</div><button class="btn btn-blue btn-small" data-copy>🔗 Copy invite link</button></div><div style="margin:25px 0 16px" class="row between"><h3>Players (${live}/8 online)</h3><span class="pill mint">${live>=3?'✓ READY TO GO':'NEED 3 TO PLAY'}</span></div>${seatList()}${me?.spectator?'<div class="notice" style="margin-top:15px">👀 You joined as a spectator. You can guess on upcoming turns, and may take a seat at the next new cup if space opens.</div>':''}${isHost?`<div style="margin-top:25px"><h3>⚙️ Host settings</h3><p class="muted" style="margin:8px 0">End the game after how many spills?</p><div class="select-row">${[3,5,7].map(n=>`<button class="choice-pill ${n===r.settings.spillLimit?'active':''}" data-limit="${n}" aria-pressed="${n===r.settings.spillLimit}">${n} spills</button>`).join('')}</div><button class="btn btn-primary full" data-action="start" ${live<3?'disabled':''}>🫗 Start the game →</button><p class="center muted" style="font-size:.8rem;margin-top:14px">${live>=3?'Everyone sees the rules before the first pour.':`Waiting for ${3-live} more connected player${3-live===1?'':'s'}…`}</p></div>`:`<div class="notice" style="margin-top:23px;text-align:center">🪄 ${nameFor(r.hostId)} is the host and will start once everyone arrives.</div>`}</div>`;}
function countdown(){return `<span class="timer" data-countdown>⏱ ${seconds(relativeTimer())}</span>`;}
function scoreboardSidebar(){const r=state.room;return `<aside class="sidebar"><div class="card"><div class="row between"><h3>🏆 Scoreboard</h3><span class="pill blue">💦 ${r.spills}/${r.spillLimit}</span></div><div class="player-list">${r.ranking.map((id,i)=>{const p=r.players.find(x=>x.id===id);return `<div class="player ${id===r.me?'me':''}"><span class="player-rank">${i+1}</span><span class="face">${p.avatar}</span><div style="min-width:0"><div class="name">${escapeHTML(p.name)}</div><div class="detail">${id===r.me?'YOU · ':''}${!p.connected?'reconnecting · ':''}${p.correct} solved</div></div><span class="score">${p.score}</span></div>`;}).join('')}</div></div><div class="card"><div class="row between"><h3>How points work</h3><span>🎯</span></div><div class="stack" style="gap:8px;margin-top:13px;font-size:.9rem;font-weight:850"><div class="row between"><span>✅ Safe pour</span><span>+10 to +20</span></div><div class="row between"><span>🕵️ Correct guess</span><span>+5</span></div><div class="row between"><span>😈 Wrong guess</span><span>+2 to pourer</span></div><div class="row between"><span>💦 Spill</span><span>−15</span></div><div class="row between"><span>🃏 Sabotage spill</span><span>+5</span></div></div></div></aside>`;}
function howContent(step){const h=HOW[step];return `<div class="how-card"><span class="big">${h.icon}</span><h3>${h.title}</h3><p>${h.text}</p></div><div class="step-dots">${HOW.map((_,i)=>`<span class="${i===step?'selected':''}"></span>`).join('')}</div>`;}
function howto(){const r=state.room;const ready=getMe()?.ready;return `<div class="gamehead center"><span class="pill">📖 30-SECOND CRASH COURSE</span><h2>How to cause a splash.</h2><p>Everyone gets a quick refresher. You’ve got this.</p></div><div class="card" style="max-width:610px;margin:auto">${howContent(state.howStep)}<div class="row between"><button class="btn btn-white btn-small" data-how-prev ${state.howStep===0?'disabled':''}>← Back</button>${state.howStep<2?'<button class="btn btn-primary btn-small" data-how-next>Next →</button>':`<button class="btn btn-primary btn-small" data-action="ready" ${ready?'disabled':''}>${ready?'✓ Ready!':'✓ Got it!'}</button>`}</div><p class="center muted" style="margin-top:18px;font-size:.9rem;font-weight:850">${r.players.filter(p=>p.ready).length} ready · Starts automatically ${countdown()}</p></div>`;}
function jinxPick(){const r=state.room,t=r.turn,me=getMe(),isJinxer=r.me===t.jinxerId,isPourer=r.me===t.pourerId;
  return `<div class="gamehead center"><span class="pill coral">🃏 THE SECRET SETUP</span><h2>${isJinxer?'Choose their downfall.':'A jinx is being brewed…'}</h2><p>${isJinxer?`You're sabotaging ${nameFor(t.pourerId)}. Pick wisely!`:`${nameFor(t.jinxerId)} is choosing a jinx for ${nameFor(t.pourerId)}.`}</p></div><div class="card"><div class="phase-strip"><span class="pill blue">TURN ${r.turnNumber}</span>${countdown()}</div>${isJinxer?`<p class="strong">Only you and ${nameFor(t.pourerId)} will know what you choose.</p><div class="jinx-grid">${t.cards.map(j=>`<button class="jinx-card" data-pick="${j.id}"><span class="multi">${j.mult}×</span><span class="glyph">${j.icon}</span><span><span class="family">${j.family}</span><strong style="display:block;margin:5px 0">${j.name}</strong><span class="sub">${j.desc}</span></span></button>`).join('')}</div>`:`<div class="waiting-art"><span class="emoji">${isPourer?'😰':'😈'}</span><h2>${isPourer?'You’re up next!':'Plotting mischief…'}</h2><p class="muted strong">${isPourer?'Get ready to pour, no matter what they throw at you.':'The chosen jinx will remain a mystery until the reveal.'}</p></div>`}</div>`;}
function guessButtons(){const r=state.room,t=r.turn;
  if(r.me===t.pourerId)return '';
  if(r.me===t.jinxerId)return `<div class="cue">😈 You picked the jinx. Sit back and watch your masterpiece.</div>`;
  if(t.guessed)return `<div class="cue">✅ Guess locked in! Waiting for the big reveal…</div>`;
  if(!t.options.length)return `<div class="cue">👀 Watching this round. You can guess on the next turn.</div>`;
  return `<div class="card" style="margin-top:15px"><div class="row between"><h3>🕵️ Name the jinx!</h3><span class="pill mint">+5 IF RIGHT</span></div><p class="muted" style="margin-top:6px;font-size:.87rem;font-weight:800">Spot what’s messing with the pourer. One guess only!</p><div class="guess-grid">${t.options.map(j=>`<button class="guess-option" data-guess="${j.id}"><span>${j.icon}</span><span>${escapeHTML(j.name)}</span></button>`).join('')}</div></div>`;
}
function pourScreen(){const r=state.room,t=r.turn,isPourer=r.me===t.pourerId,detail=t.jinxDetail,guessPhase=r.phase==='guess',duel=r.duel?.active;
  const active=!!t.flowing&&!guessPhase;
  let effect=isPourer?detail?.id:'';
  return `<div class="gamehead"><div class="row wrap"><span class="pill">${duel?'⚔️ SUDDEN DEATH':`🫗 TURN ${r.turnNumber}`}</span><span class="pill coral">${r.spills}/${r.spillLimit} SPILLS</span></div><h2>${duel?`${nameFor(t.pourerId)}'s showdown`:(isPourer?"It's your pour!":`${nameFor(t.pourerId)} is pouring!`)}</h2><p>${duel?'All tied players get the same handicap and a cup starting at 85. Best safe pour wins.':guessPhase?'Pour finished! Guesses lock in five seconds.':isPourer?'Watch the cup. Every pour must add at least 6 units.':'Watch closely, then guess the hidden jinx.'}</p></div><div class="game-grid"><section><div class="phase-strip"><span class="pill ${isPourer?'mint':'blue'}">${isPourer?'🎯 YOUR TURN':`👀 WATCHING ${nameFor(t.pourerId)}`}</span>${countdown()}</div>${isPourer&&detail?`<div class="card" style="padding:13px 16px;margin-bottom:14px;background:#fff2c5"><div class="row"><span style="font-size:2.15rem">${detail.icon}</span><div><div class="eyebrow">YOUR SECRET JINX · ${detail.mult}× POINTS</div><h3>${detail.name}</h3><p class="muted" style="font-weight:800;font-size:.83rem;margin-top:3px">${detail.desc}</p></div></div></div>`:''}${cupScene(r.level??0,{foam:t.foam,danger:r.level>85,pouring:active,jinx:effect,elapsed:t.elapsedMs})}<div class="meter-info"><span>💦 ${isPourer&&t.added!=null?`Added ${Math.round(t.added)} / 6 minimum`:'At least 6 units per pour'}</span><span>⏳ ${t.started?Math.ceil(t.pourRemainingMs/1000)+'s max':'10s to start'}</span></div>${isPourer&&!guessPhase?`<div class="stack" style="gap:11px"><button type="button" class="pour-control" data-hold aria-label="${detail?.id==='opposite'?'Hold to pause the flow':'Hold to pour water'}">${t.dripping?'💧 Finishing the minimum…':detail?.id==='opposite'?'✋ HOLD TO PAUSE WATER':state.held?'💦 POURING — RELEASE TO STOP':'🫗 HOLD TO POUR · RELEASE TO STOP'}</button>${detail?.id==='opposite'?'<button class="btn btn-coral btn-small full" data-action="stop">🛑 Finish this pour</button>':''}<p class="center muted" style="font-size:.86rem;font-weight:850">${detail?.id==='opposite'?'The bottle pours on its own! Hold to pause; tap Finish to stop.':'Even a quick tap commits you to 6 units.'}</p></div>`:guessPhase&&isPourer?'<div class="cue">👏 Nicely done. The detectives are comparing notes…</div>':duel?'<div class="cue">⚔️ Sudden-death round — everyone watches the showdown.</div>':guessButtons()}</section>${scoreboardSidebar()}</div>`;
}
function revealScreen(){const r=state.room,v=r.reveal,t=r.turn;if(!v)return '<div class="card">Opening the results…</div>';
 const j=t.jinxDetail,guesses=Object.entries(v.guesses||{}),isSpill=v.spilled;
 return `<div class="gamehead center"><span class="pill">${v.duel?'⚔️ SHOWDOWN RESULT':'🎭 THE BIG REVEAL'}</span><h2 style="margin-top:13px" class="reveal-title ${isSpill?'spill':'safe'}">${isSpill?'💦 SPILLED!':'✨ CLEAN POUR!'}</h2><p>${nameFor(v.pourerId)} ${isSpill?'went a little too far…':'kept their cool!'}</p></div><div class="game-grid"><section><div class="card"><div class="row between"><span class="pill blue">ADDED +${v.added} UNITS</span>${countdown()}</div><div class="results-cup">${cupScene(Math.min(v.level,100),{spilled:isSpill,danger:isSpill})}</div><div class="center"><span class="eyebrow muted">THE SECRET WAS</span><div class="reveal-jinx"><span>${j?.icon||'🃏'}</span><div><div>${j?.name||'Unknown'}</div><small>${j?.mult||1}× MULTIPLIER</small></div></div></div>${v.duel?'<div class="cue">Each finalist pours from 85 with the same jinx. The safest, fullest pour wins.</div>':`<div style="margin-top:19px"><h3>🕵️ Detective results</h3>${guesses.length?guesses.map(([id,guess])=>`<div class="guess-result"><span>${avatarFor(id)} ${nameFor(id)} guessed ${escapeHTML(guess.replaceAll('-',' '))}</span><span class="delta ${guess===v.jinx?'':'negative'}">${guess===v.jinx?'+5 ✓':'✕'}</span></div>`).join(''):'<p class="muted" style="margin-top:10px">No guesses this round.</p>'}</div><h3 style="margin-top:20px">Points this turn</h3>${Object.entries(v.deltas).length?Object.entries(v.deltas).map(([id,delta])=>`<div class="guess-result"><span>${avatarFor(id)} ${nameFor(id)}</span><span class="delta ${delta<0?'negative':''}">${delta>0?'+':''}${delta}</span></div>`).join(''):'<div class="cue">No points awarded this round.</div>'}`}</div></section>${scoreboardSidebar()}</div>`;
}
function scoreboard(){const r=state.room;return `<div class="gamehead center"><span class="pill coral">💦 SPILL ${r.spills} OF ${r.spillLimit}</span><h2 style="margin-top:13px">The cup resets!</h2><p>Everyone's still in. ${r.spills>=r.spillLimit?'Time to crown a winner!':`${r.spillLimit-r.spills} spills until game over.`}</p></div><div class="card" style="max-width:670px;margin:auto"><div class="row between"><h3>🏆 Current standings</h3>${countdown()}</div>${leaderboard()}<div class="cue">🧽 Wiping up the counter… Next cup coming right up!</div></div>`;}
function leaderboard(){const r=state.room;return `<div class="leaderboard">${r.ranking.map((id,i)=>{const p=r.players.find(x=>x.id===id);return `<div class="leader-row"><span class="position">${['🥇','🥈','🥉'][i]||i+1}</span><span class="face">${p.avatar}</span><div class="info"><strong>${escapeHTML(p.name)} ${id===r.me?'(you)':''}</strong><small>${p.correct} correct guesses · ${p.goodPours} safe pours</small></div><span class="points">${p.score}</span></div>`;}).join('')}</div>`;}
function gameover(){const r=state.room,w=r.players.find(p=>p.id===r.winner);const seated=r.players.filter(p=>!p.spectator);
 const bestPour=[...seated].sort((a,b)=>b.goodPours-a.goodPours)[0],bestSab=[...seated].sort((a,b)=>b.sabotages-a.sabotages)[0],bestGuess=[...seated].sort((a,b)=>b.correct-a.correct)[0];
 return `<div class="gamehead center"><span class="pill mint">🎉 GAME COMPLETE</span><h2 style="margin-top:13px">And the cup goes to…</h2><p>One champion. An unreasonable number of bad choices.</p></div><div class="card" style="max-width:730px;margin:auto;position:relative"><div class="confetti"><span>🎊</span><span>✨</span><span>⭐</span><span>🎉</span></div><div class="big-winner"><div class="eyebrow">THE POUR DECISIONS CHAMPION</div><span class="face">${w?.avatar||'🏆'}</span><h2>${w?escapeHTML(w.name):'The whole crew!'}</h2><p class="strong" style="margin-top:8px;font-size:1.3rem">${w?.score??0} POINTS 🏆</p></div><h3>Final leaderboard</h3>${leaderboard()}<h3 style="margin-top:22px">✨ Hall of questionable fame</h3><div class="awards"><div class="award"><span class="icon">🫗</span><strong>Steadiest Hand</strong><small>${bestPour?escapeHTML(bestPour.name):'—'} · ${bestPour?.goodPours??0} pours</small></div><div class="award"><span class="icon">😈</span><strong>Master Saboteur</strong><small>${bestSab?escapeHTML(bestSab.name):'—'} · ${bestSab?.sabotages??0} spills</small></div><div class="award"><span class="icon">🕵️</span><strong>Best Detective</strong><small>${bestGuess?escapeHTML(bestGuess.name):'—'} · ${bestGuess?.correct??0} guesses</small></div></div><div class="stack" style="margin-top:24px">${r.hostId===r.me?'<button class="btn btn-primary full" data-action="rematch">🔄 Rematch with this crew</button>':'<div class="notice center">⏳ The host can start a rematch in this same room.</div>'}<button class="btn btn-white full btn-small" data-new>✨ Make a new room</button></div></div>`;}
function pauseBanner(){if(!state.room?.paused)return '';return `<div class="pause-banner"><h3>📶 Waiting for players…</h3><p>At least 3 seated players must be connected. Resuming when friends return, or finishing with current scores in <strong data-pause-time>${seconds(relativeTimer())}</strong>.</p></div>`;}
function game(){const r=state.room;if(!r)return '<div class="card">Connecting to your room…</div>';
 const content={lobby:lobby,howto,pour:pourScreen,guess:pourScreen,jinx:jinxPick,reveal:revealScreen,scoreboard,gameover}[r.phase]||lobby;
 return `<div>${pauseBanner()}${content()}</div>`;
}
function howOverlay(){if(!state.howOpen)return '';
 return `<div class="overlay" id="how-overlay" role="dialog" aria-modal="true" aria-label="How to play"><div class="modal"><div class="row between"><h2>How to play</h2><button class="mini-btn" data-close-help aria-label="Close">✕</button></div>${howContent(state.howStep)}<div class="row between"><button class="btn btn-white btn-small" data-how-prev ${state.howStep===0?'disabled':''}>← Back</button><button class="btn btn-primary btn-small" ${state.howStep<2?'data-how-next':'data-close-help'}>${state.howStep<2?'Next →':'Got it ✓'}</button></div><p class="muted" style="font-size:.85rem;line-height:1.5;margin-top:18px">Game ends after 3, 5 or 7 spills. Nobody is eliminated. Highest score wins; ties break by correct guesses, then a sudden-death pour.</p></div></div>`;
}
function render(){const app=$('#app');document.body.classList.toggle('reduce-motion',state.reduceMotion);
 const r=state.room;
 const playerSig=r?.players.map(p=>`${p.id}:${p.connected}:${p.spectator}:${p.score}:${p.ready}:${p.correct}`).join(',')||'';
 const t=r?.turn;
 const key=[state.view,r?.phase,r?.turnNumber,r?.hostId,r?.spills,r?.settings.spillLimit,r?.paused,r?.winner,r?.me,t?.guessed,t?.jinx,t?.options.length,t?.cards.length,playerSig,state.howOpen,state.howStep,state.muted,state.reduceMotion,state.connected].join('|');
 if(key===state.renderKey)return;
 state.renderKey=key;
 app.innerHTML=`<div class="shell">${navbar()}${state.view==='home'?home():['create','join'].includes(state.view)?authScreen():game()}${footer()}</div>${howOverlay()}`;
 updateVitals();
}
function updateVitals(){const r=state.room;if(!r)return;
 document.querySelectorAll('[data-countdown]').forEach(el=>el.textContent='⏱ '+seconds(relativeTimer()));
 document.querySelectorAll('[data-pause-time]').forEach(el=>el.textContent=seconds(relativeTimer()));
 const label=$('[data-connection]');if(label){label.textContent=state.connected?'LIVE':'RECONNECTING';label.classList.toggle('offline',!state.connected);}
 const t=r.turn,stage=$('[data-cup-stage]');if(stage&&t&&['pour','guess'].includes(r.phase)){
   const level=r.level;
   const visual=Math.max(0,Math.min(100,(level??0)+(t.foam?10:0)));
   const water=stage.querySelector('[data-water]');if(water)water.style.height=visual+'%';
   stage.style.setProperty('--visual-level',visual);
   stage.classList.toggle('danger',level>85);
   const meIsPourer=r.me===t.pourerId;
   const active=!!t.flowing;
   stage.classList.toggle('pouring',active&&r.phase==='pour');
   stage.classList.toggle('lights-dark',meIsPourer&&t.jinx==='lights'&&t.elapsedMs>1500);
   stage.classList.toggle('shaky',meIsPourer&&t.jinx==='shaky'&&active);
   const min=$('.meter-info span:first-child');if(min&&meIsPourer&&t.added!=null)min.textContent=`💦 Added ${Math.round(t.added)} / 6 minimum`;
   const max=$('.meter-info span:last-child');if(max)max.textContent=t.started?`⏳ ${Math.ceil(t.pourRemainingMs/1000)}s max`:'⏳ 10s to start';
   if(active&&meIsPourer&&state.held&&performance.now()-state.soundTime>250){sound('drip',r.level||0);state.soundTime=performance.now();}
   const btn=$('[data-hold]');if(btn){btn.classList.toggle('active',state.held);btn.disabled=t.dripping||r.phase==='guess'||r.paused;btn.textContent=t.dripping?'💧 Finishing the minimum…':t.jinx==='opposite'?'✋ HOLD TO PAUSE WATER':state.held?'💦 POURING — RELEASE TO STOP':'🫗 HOLD TO POUR · RELEASE TO STOP';}
 }
}
let audioCtx=null;
function sound(which,level=0){if(state.muted)return;
 try{
  audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();
  const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),at=audioCtx.currentTime;
  const base={pop:520,drip:180+level*2,splash:140,reveal:660,winner:900}[which]||400;
  osc.type=which==='drip'?'sine':'triangle';osc.frequency.setValueAtTime(base,at);osc.frequency.exponentialRampToValueAtTime(which==='splash'?65:base*1.25,at+.14);
  gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.025,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+.17);osc.connect(gain).connect(audioCtx.destination);osc.start(at);osc.stop(at+.18);
 }catch{}
}
function copyInvite(){const link=`${location.origin}/?room=${state.session?.code||state.formCode}`;
 navigator.clipboard?.writeText(link).then(()=>toast('Invite link copied! Send it to your crew.')).catch(()=>window.prompt('Copy your room link:',link))||window.prompt('Copy your room link:',link);
}
async function resume(){if(!state.formCode||params.get('new')==='1')return;
 try{const raw=localStorage.getItem('pd_seat_'+state.formCode);if(!raw)return;
   const s=JSON.parse(raw);await request('reconnect',s);storeSession(s);
 }catch{localStorage.removeItem('pd_seat_'+state.formCode);}
}
document.addEventListener('click',e=>{
 const el=e.target.closest('button');if(!el)return;
 if(el.hasAttribute('data-home'))return setView('home');
 if(el.hasAttribute('data-new'))return leaveRoom();
 if(el.hasAttribute('data-open'))return setView(el.dataset.open);
 if(el.hasAttribute('data-avatar')){state.avatar=el.dataset.avatar;state.renderKey='';return render();}
 if(el.hasAttribute('data-copy'))return copyInvite();
 if(el.hasAttribute('data-mute')){state.muted=!state.muted;state.renderKey='';return render();}
 if(el.hasAttribute('data-motion')){state.reduceMotion=!state.reduceMotion;savePrefs();state.renderKey='';return render();}
 if(el.hasAttribute('data-help')){state.howOpen=true;state.howStep=0;state.renderKey='';return render();}
 if(el.hasAttribute('data-close-help')){state.howOpen=false;state.renderKey='';return render();}
 if(el.hasAttribute('data-how-next')){state.howStep=Math.min(2,state.howStep+1);state.renderKey='';return render();}
 if(el.hasAttribute('data-how-prev')){state.howStep=Math.max(0,state.howStep-1);state.renderKey='';return render();}
 if(el.hasAttribute('data-limit'))return apiAction('settings',{spillLimit:Number(el.dataset.limit)});
 if(el.hasAttribute('data-action'))return el.dataset.action==='stop'?sendPour('stop'):apiAction(el.dataset.action);
 if(el.hasAttribute('data-pick'))return apiAction('pickJinx',{jinx:el.dataset.pick});
 if(el.hasAttribute('data-guess'))return apiAction('guess',{jinx:el.dataset.guess});
});
document.addEventListener('submit',e=>{if(e.target.id==='join-form'){e.preventDefault();createJoin(state.view);}});
document.addEventListener('input',e=>{if(e.target.id==='name-field')state.formName=e.target.value;if(e.target.id==='code-field')state.formCode=e.target.value.toUpperCase();});
let pourActionQueue=Promise.resolve();
function sendPour(type){pourActionQueue=pourActionQueue.catch(()=>{}).then(()=>apiAction(type));return pourActionQueue;}
document.addEventListener('pointerdown',e=>{
 const button=e.target.closest('[data-hold]');if(!button||button.disabled||state.held)return;
 e.preventDefault();state.held=true;button.classList.add('active');sendPour('pourDown');updateVitals();
});
function endPointer(){if(!state.held)return;state.held=false;sendPour('pourUp');updateVitals();}
document.addEventListener('pointerup',endPointer);document.addEventListener('pointercancel',endPointer);
window.addEventListener('blur',endPointer);document.addEventListener('visibilitychange',()=>{if(document.hidden)endPointer();});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&document.activeElement?.hasAttribute('data-hold')&&!e.repeat){e.preventDefault();if(!state.held){state.held=true;sendPour('pourDown');updateVitals();}}else if(e.key==='Escape'&&state.howOpen){state.howOpen=false;state.renderKey='';render();}});
document.addEventListener('keyup',e=>{if(e.code==='Space'&&state.held){e.preventDefault();endPointer();}});
let swipeStart=null;
document.addEventListener('touchstart',e=>{if(e.target.closest('.how-card'))swipeStart=e.changedTouches[0].clientX;},{passive:true});
document.addEventListener('touchend',e=>{if(swipeStart===null||!e.target.closest('.how-card'))return;const difference=e.changedTouches[0].clientX-swipeStart;swipeStart=null;if(Math.abs(difference)>55){state.howStep=Math.max(0,Math.min(2,state.howStep+(difference<0?1:-1)));state.renderKey='';render();}},{passive:true});
setInterval(updateVitals,120);
render();resume();
