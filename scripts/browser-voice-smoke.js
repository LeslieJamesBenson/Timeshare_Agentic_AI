// Headless browser smoke test for the voice module in BOTH surfaces.
// Verifies VoiceKit loads, mic + speak controls exist, the speak toggle works,
// and there are no real JS errors (external CDN/font failures in a sandbox are
// filtered). Start the server first. Run: node scripts/browser-voice-smoke.js
const { chromium } = require('playwright-core');

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://localhost:3000';
// Errors caused by blocked external resources in a sandbox — not app bugs.
const ENV_NOISE = /favicon|fonts\.googleapis|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|net::ERR/;

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  let fail = 0;
  const bad = (n) => { fail++; console.log('  FAIL: ' + n); };

  // Rep tool — input bar (and its voice controls) is always visible.
  {
    const page = await b.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !ENV_NOISE.test(m.text())) errs.push(m.text()); });
    await page.goto(BASE + '/sales-agent.html', { waitUntil: 'networkidle' });
    if (!(await page.evaluate(() => !!window.VoiceKit))) bad('sales-agent: VoiceKit missing');
    if (await page.locator('#mic-btn').count() !== 1) bad('sales-agent: mic button missing');
    await page.click('#speak-btn');
    if (await page.locator('#speak-btn.active').count() !== 1) bad('sales-agent: speak toggle on');
    await page.click('#speak-btn');
    if (await page.locator('#speak-btn.active').count() !== 0) bad('sales-agent: speak toggle off');
    if (errs.length) bad('sales-agent: JS errors: ' + errs.join(' | '));
    await page.close();
  }

  // Owner widget — must open the launcher and finish setup to reveal the chat.
  {
    const page = await b.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !ENV_NOISE.test(m.text())) errs.push(m.text()); });
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.click('#launcher-btn');
    await page.click('#start-btn');
    await page.waitForSelector('#chat-view', { state: 'visible', timeout: 3000 });
    if (!(await page.evaluate(() => !!window.VoiceKit))) bad('owner-widget: VoiceKit missing');
    if (await page.locator('#mic-btn').count() !== 1) bad('owner-widget: mic button missing');
    await page.click('#speak-btn');
    if (await page.locator('#speak-btn.active').count() !== 1) bad('owner-widget: speak toggle');
    if (errs.length) bad('owner-widget: JS errors: ' + errs.join(' | '));
    await page.close();
  }

  await b.close();
  console.log(fail === 0 ? '\nVOICE SMOKE: PASS' : `\nVOICE SMOKE: ${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('voice smoke crashed:', e); process.exit(1); });
