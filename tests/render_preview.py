"""Offline visual-regression previews for the real game's UI.
Browser security policy in the build environment blocks localhost navigation;
this uses the same shipped HTML/CSS/JS and injected sample game states.
"""
import asyncio,re,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'artwork';OUT.mkdir(exist_ok=True)
html=(ROOT/'public/index.html').read_text()
html=re.sub(r'<link rel="stylesheet"[^>]+>','',html)
html=re.sub(r'<script type="module"[^>]+></script>','',html)
css=(ROOT/'public/style.css').read_text()
js=(ROOT/'public/app.js').read_text().replace('render();resume();','window.__PREVIEW__={set(room,view="game"){state.room=room;state.session=room?{code:room.code,id:room.me,token:"preview"}:null;state.view=view;state.connected=true;state.renderKey="";state.receivedAt=performance.now();render();}};render();')
players=[
 {'id':'alex','name':'Alex','avatar':'🦊','score':37,'correct':2,'goodPours':2,'sabotages':0,'connected':True,'spectator':False,'waitingSeat':False,'ready':True},
 {'id':'ben','name':'Ben','avatar':'🐸','score':25,'correct':1,'goodPours':1,'sabotages':1,'connected':True,'spectator':False,'waitingSeat':False,'ready':True},
 {'id':'cam','name':'Cam','avatar':'🐱','score':30,'correct':2,'goodPours':1,'sabotages':0,'connected':True,'spectator':False,'waitingSeat':False,'ready':True}
]
J={'id':'fire','name':'Fire Hose','family':'Bottle','icon':'🚒','mult':1.5,'desc':'The bottle pours three times faster.'}
T={'turnNumber':4,'pourerId':'ben','jinxerId':'alex','jinx':'fire','cards':[],'options':[],'guessed':False,'guessesCount':0,'started':True,'elapsedMs':1450,'pourRemainingMs':6550,'added':20,'held':True,'dripping':False,'flowing':True,'foam':False,'jinxDetail':J}
base={'code':'WAVE','phase':'pour','hostId':'alex','me':'ben','serverTime':0,'deadline':0,'remainingMs':6300,'paused':False,'pauseRemaining':0,'settings':{'spillLimit':3},'spills':1,'level':78,'spillLimit':3,'turnNumber':4,'players':players,'winner':None,'duel':None,'turn':T,'reveal':None,'ranking':['alex','cam','ben']}
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  desktop=await browser.new_page(viewport={'width':1200,'height':820},device_scale_factor=1)
  errors=[];desktop.on('pageerror',lambda e:errors.append(str(e)))
  await desktop.set_content(html)
  await desktop.evaluate('Object.defineProperty(window,"localStorage",{value:{getItem:()=>null,setItem:()=>{}}})')
  await desktop.add_style_tag(content=css)
  await desktop.add_script_tag(content=js)
  await desktop.screenshot(path=str(OUT/'homepage.png'),full_page=True)
  assert await desktop.get_by_role('heading',name='Three steps to trouble.').is_visible()
  await desktop.get_by_role('button',name='Create a room').click()
  assert await desktop.locator('#name-field').is_visible()
  await desktop.locator('[data-home]').click()
  await desktop.get_by_role('button',name='How to play').click()
  assert await desktop.locator('#how-overlay').is_visible()
  await desktop.locator('[data-close-help]').first.click()
  await desktop.evaluate('r => window.__PREVIEW__.set(r)',base)
  await desktop.screenshot(path=str(OUT/'cover.png'))
  await desktop.screenshot(path=str(OUT/'midpour-desktop.png'),full_page=True)
  mobile=await browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
  mobile.on('pageerror',lambda e:errors.append(str(e)))
  await mobile.set_content(html)
  await mobile.evaluate('Object.defineProperty(window,"localStorage",{value:{getItem:()=>null,setItem:()=>{}}})')
  await mobile.add_style_tag(content=css)
  await mobile.add_script_tag(content=js)
  await mobile.evaluate('r => window.__PREVIEW__.set(r)',base)
  await mobile.screenshot(path=str(OUT/'midpour-mobile.png'),full_page=True)
  print('Desktop overflowing?',await desktop.evaluate('document.documentElement.scrollWidth>window.innerWidth'))
  print('Mobile overflowing?',await mobile.evaluate('document.documentElement.scrollWidth>window.innerWidth'))
  assert not await mobile.evaluate('document.documentElement.scrollWidth>window.innerWidth')
  lobby={**base,'phase':'lobby','level':0,'turn':None,'spills':0,'turnNumber':0}
  await mobile.evaluate('r=>window.__PREVIEW__.set(r)',lobby)
  await mobile.screenshot(path=str(OUT/'lobby-mobile.png'),full_page=True)
  guessing={**base,'me':'cam','turn':{**T,'jinx':None,'jinxDetail':None,'added':None,'held':None,'options':[
   J,{'id':'fog','name':'Foggy Glasses','icon':'🌫️','mult':1.5},{'id':'tunnel','name':'Tunnel Vision','icon':'👁️','mult':2},{'id':'heavy','name':'Heavy Arm','icon':'🏋️','mult':1.5}
  ]}}
  await mobile.evaluate('r=>window.__PREVIEW__.set(r)',guessing)
  await mobile.screenshot(path=str(OUT/'guessing-mobile.png'),full_page=True)
  reveal={**base,'phase':'reveal','remainingMs':4000,'level':104,'reveal':{'jinx':'fire','spilled':True,'level':104,'added':26,'deltas':{'ben':-15,'alex':5,'cam':5},'guesses':{'cam':'fire'},'pourerId':'ben','jinxerId':'alex','duel':False}}
  await desktop.evaluate('r=>window.__PREVIEW__.set(r)',reveal)
  await desktop.screenshot(path=str(OUT/'reveal-desktop.png'),full_page=True)
  final={**base,'phase':'gameover','winner':'alex','level':0,'turn':T}
  await desktop.evaluate('r=>window.__PREVIEW__.set(r)',final)
  await desktop.screenshot(path=str(OUT/'gameover-desktop.png'),full_page=True)
  assert not errors,errors
  print('Visual rendering passed, 8 screenshots generated.')
  await browser.close()
if __name__=='__main__':asyncio.run(main())
