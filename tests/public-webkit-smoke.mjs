import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { webkit } from 'playwright';

const BASE = process.env.TEST_URL || 'https://pour-decisions-ozbh.onrender.com';
await mkdir('release-artifacts', { recursive: true });
const browser = await webkit.launch({ headless: true });
let context;
try {
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 50000 });
  await page.locator('[data-open="create"]').waitFor();
  await page.locator('[data-open="create"]').click();
  await page.locator('#name-field').fill('SafariTest');
  await page.locator('[data-submit]').click();
  await page.locator('.lobby-code').waitFor({ timeout: 30000 });
  await page.locator('[data-add-bot]').click();
  await page.locator('.seat').nth(1).filter({ hasText: /Bot/ }).waitFor({ timeout: 20000 });
  assert.match(await page.locator('.seat').nth(1).innerText(), /Bot/);
  await page.screenshot({ path: 'release-artifacts/live-lobby-iphone-webkit.png', fullPage: true });
  await page.locator('[data-action="start"]').click();
  await page.locator('[data-how-next]').click();
  await page.locator('[data-how-next]').click();
  await page.locator('[data-action="ready"]').click();
  await page.locator('[data-cup-stage]').waitFor({ timeout: 30000 });
  const camera = await page.locator('[data-cup-stage]').getAttribute('data-camera');
  assert.ok(['side', 'overhead'].includes(camera));
  await page.screenshot({ path: 'release-artifacts/live-pour-iphone-webkit.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('WEBKIT_SMOKE_OK ' + JSON.stringify({
    liveUrl: BASE, context: 'iPhone-sized WebKit', width: 390, height: 844,
    botSeat: true, camera, errors: 0, screenshots: 2,
  }));
} finally {
  await browser.close();
}
