import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.TEST_URL || 'https://pour-decisions-ozbh.onrender.com';
await mkdir('release-artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const issues = [];
let host, guest;
try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  host = await desktopContext.newPage();
  guest = await mobileContext.newPage();
  for (const [name, page] of [['desktop', host], ['mobile', guest]]) {
    page.on('pageerror', (error) => issues.push(name + ': ' + error.message));
  }

  await host.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await host.locator('[data-open="create"]').waitFor();
  await host.screenshot({ path: 'release-artifacts/live-homepage-desktop.png', fullPage: true });
  await host.locator('[data-open="create"]').click();
  await host.locator('#name-field').fill('DesktopTest');
  await host.locator('[data-submit]').click();
  await host.locator('.lobby-code').waitFor({ timeout: 30000 });
  const code = (await host.locator('.lobby-code').textContent()).trim();
  assert.match(code, /^[A-Z]{4}$/);

  await guest.goto(BASE + '/?room=' + code, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await guest.locator('#name-field').fill('MobileTest');
  await guest.locator('[data-submit]').click();
  await guest.locator('.lobby-code').waitFor({ timeout: 30000 });
  await host.locator('.seat').first().waitFor();
  await host.locator('.seat').nth(1).waitFor({ timeout: 15000 });
  await guest.locator('.seat').nth(1).waitFor({ timeout: 15000 });
  await host.screenshot({ path: 'release-artifacts/live-lobby-desktop.png', fullPage: true });
  await guest.screenshot({ path: 'release-artifacts/live-lobby-mobile.png', fullPage: true });
  console.log('BROWSER: two isolated desktop/mobile browser sessions joined same live room');

  await host.locator('[data-action="start"]').click();
  for (const page of [host, guest]) {
    await page.locator('[data-how-next]').click();
    await page.locator('[data-how-next]').click();
    await page.locator('[data-action="ready"]').click();
  }
  await host.locator('[data-cup-stage]').waitFor({ timeout: 20000 });
  await guest.locator('[data-cup-stage]').waitFor({ timeout: 20000 });
  const dc = await host.locator('[data-cup-stage]').getAttribute('data-camera');
  const mc = await guest.locator('[data-cup-stage]').getAttribute('data-camera');
  assert.deepEqual([dc, mc].sort(), ['overhead', 'side']);
  await host.screenshot({ path: 'release-artifacts/live-pour-desktop.png', fullPage: true });
  await guest.screenshot({ path: 'release-artifacts/live-pour-mobile.png', fullPage: true });
  assert.deepEqual(issues, [], 'no uncaught page JavaScript errors');
  console.log('BROWSER_SMOKE_OK ' + JSON.stringify({
    url: BASE,
    distinctContexts: 2,
    desktopCamera: dc,
    mobileCamera: mc,
    viewports: ['1440x900', '390x844'],
    pageErrors: issues.length,
    screenshots: 5,
  }));
} finally {
  await browser.close();
}
