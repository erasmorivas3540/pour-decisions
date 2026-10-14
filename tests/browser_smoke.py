"""Real Chromium smoke test using three isolated browser profiles.
Run with server at http://127.0.0.1:3189 (optionally GAME_TIME_SCALE=.65).
"""
import asyncio, os
from pathlib import Path
from playwright.async_api import async_playwright

BASE=os.environ.get('TEST_URL','http://127.0.0.1:3189')
OUT=Path('/mnt/data/pour-decisions/artwork');OUT.mkdir(exist_ok=True)

async def test():
    errors=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--proxy-server=direct://','--proxy-bypass-list=*'])
        contexts=[await browser.new_context(viewport={'width':1200,'height':900}),
                  await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1,has_touch=True),
                  await browser.new_context(viewport={'width':412,'height':915},is_mobile=True,device_scale_factor=1,has_touch=True)]
        pages=[await c.new_page() for c in contexts]
        for i,page in enumerate(pages):
            page.on('pageerror',lambda e,idx=i:errors.append(f'player {idx}: {e}'))
            page.on('console',lambda m,idx=i:errors.append(f'console {idx}: {m.text}') if m.type=='error' else None)
        host,ben,cam=pages
        await host.goto(BASE)
        await host.screenshot(path=str(OUT/'homepage.png'),full_page=True)
        assert await host.get_by_role('heading',name='Three steps to trouble.').is_visible()
        await host.get_by_role('button',name='Create a room').click()
        await host.locator('#name-field').fill('Alex')
        await host.locator('[data-avatar="🦊"]').click()
        await host.locator('[data-submit]').click()
        await host.get_by_text('Your crew is assembling!').wait_for(timeout=10000)
        code=(await host.locator('.lobby-code').text_content()).strip()
        assert len(code)==4,code
        for page,name in [(ben,'Ben'),(cam,'Cam')]:
            await page.goto(BASE+'/?room='+code)
            await page.locator('#name-field').fill(name)
            await page.locator('[data-submit]').click()
            await page.get_by_text('Your crew is assembling!').wait_for(timeout=10000)
        await host.get_by_role('button',name='Start the game').wait_for(state='visible',timeout=8000)
        assert await host.locator('.seat').count()==3
        await host.screenshot(path=str(OUT/'lobby-desktop.png'),full_page=True)
        await ben.screenshot(path=str(OUT/'lobby-mobile.png'),full_page=True)
        await host.get_by_role('button',name='Start the game').click()
        for page in pages:
            await page.get_by_text('Ready, set… don't spill.').wait_for(timeout=5000)
            await page.get_by_role('button',name='Next step →').click()
            await page.get_by_role('button',name='Next step →').click()
            await page.get_by_role('button',name='I’m ready — let’s play!').click()
        await host.screenshot(path=str(OUT/'how-to-play.png'),full_page=True)
        await asyncio.sleep(.3)
        for i,page in enumerate(pages):
            print('phase',i,(await page.locator('body').inner_text())[:130].replace('\n',' / '))
        # In first turn the jinx is chosen automatically.
        pourer=None
        for i,page in enumerate(pages):
            if await page.locator('[data-hold]').count():pourer=page
        assert pourer is not None,'No pourer UI appeared!'
        for page in pages:
            if page is not pourer and await page.locator('.guess-option').count():
                await page.screenshot(path=str(OUT/'guessing-mobile.png'),full_page=True)
                break
        await pourer.screenshot(path=str(OUT/'pourer-mobile.png'),full_page=True)
        # The game auto-pours after timeout; show real control interaction.
        hold=pourer.locator('[data-hold]')
        if await hold.count() and await hold.is_enabled():
            await hold.dispatch_event('pointerdown',{'pointerId':1,'pointerType':'touch'})
            await asyncio.sleep(.35)
            await pourer.locator('body').dispatch_event('pointerup',{'pointerId':1,'pointerType':'touch'})
        await asyncio.sleep(1.6)
        for page in pages:
            if await page.locator('.guess-option').count():await page.locator('.guess-option').first.click()
        await asyncio.sleep(4.5)
        # Save a review image at the latest reached phase.
        await host.screenshot(path=str(OUT/'midgame-desktop.png'),full_page=True)
        assert not errors,errors
        print('SUCCESS: 3 isolated browsers, lobby, rules, pour, guesses, screenshots',code)
        await browser.close()

if __name__=='__main__':asyncio.run(test())
