// End-to-end smoke test for the Resort Credit Calculator UI.
// Drives the real page against a running server (deterministic endpoints, no
// API key needed). Uses the preinstalled Chromium via playwright-core, matching
// scripts/browser-smoke.js.
//
//   Run: node tests/e2e/calculator.spec.js         (starts its own server)
//   or:  BASE=http://localhost:3000 node tests/e2e/calculator.spec.js
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');

const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 3899;
const BASE = process.env.BASE || `http://localhost:${PORT}`;

async function waitForServer(url, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

(async () => {
  let server;
  if (!process.env.BASE) {
    server = spawn('node', ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  }
  await waitForServer(`${BASE}/api/credit-resorts?q=palm`);

  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    // Ignore the browser's own log for expected non-2xx responses (e.g. the
    // intentional 422 when a stay touches an unpriceable date). Those are
    // correct app behavior, not JS errors.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
  });

  let fail = 0;
  const check = (name, cond) => { if (cond) { console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } };

  try {
    await page.goto(`${BASE}/calculator`, { waitUntil: 'networkidle' });
    check('title', (await page.title()).includes('Credit Calculator'));

    // 1. search + select a resort
    await page.fill('#resortInput', 'Palm Springs');
    await page.waitForSelector('#resortList .opt', { timeout: 4000 });
    await page.click('#resortList .opt');
    check('resortId set', (await page.inputValue('#resortId')) === 'california-palm-springs');

    // 3. unit populated
    await page.waitForFunction(() => document.querySelectorAll('#unitType option').length > 1, { timeout: 4000 });
    await page.selectOption('#unitType', 'one-bedroom');

    // 2. dates
    await page.fill('#checkIn', '2026-09-14');
    await page.fill('#checkOut', '2026-09-19');
    // 6. owner credits (shortage)
    await page.fill('#ownerCredits', '3000');

    // 4. calculate
    await page.click('#calcBtn');
    await page.waitForSelector('#output .total', { timeout: 4000 });
    const total = (await page.textContent('#output .total')).replace(/\D/g, '');
    check('total is 5450', total === '5450');

    // 5. nightly breakdown rendered
    check('5 night rows', (await page.locator('#output tbody tr').count()) === 5);

    // 7. credit shortage shown
    check('shortage card', (await page.locator('#output .cmp .short').count()) === 1);

    // 8. copy breakdown
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('#output .actions button:has-text("Copy breakdown")');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check('clipboard has total', /Total: 5,?450 credits/.test(clip));

    // 9/10. add to plan then view planner totals
    await page.click('#output .actions button:has-text("Add to plan")');
    await page.goto(`${BASE}/planner`, { waitUntil: 'networkidle' });
    check('trip in planner', (await page.locator('#tripRows tr').count()) === 1);
    await page.fill('#annual', '20000');
    await page.waitForFunction(() => /need/i.test(document.getElementById('summary').textContent));
    check('annual need shown', /5,?450/.test(await page.textContent('#summary')));

    // 11. unavailable data -> friendly error (uncovered date)
    await page.goto(`${BASE}/calculator`, { waitUntil: 'networkidle' });
    await page.fill('#resortInput', 'Long Beach');
    await page.waitForSelector('#resortList .opt', { timeout: 4000 });
    await page.click('#resortList .opt');
    await page.waitForFunction(() => document.querySelectorAll('#unitType option').length >= 1, { timeout: 4000 });
    await page.selectOption('#unitType', await page.locator('#unitType option').nth(0).getAttribute('value'));
    await page.fill('#checkIn', '2027-11-13');
    await page.fill('#checkOut', '2027-11-15');
    await page.click('#calcBtn');
    await page.waitForSelector('#output .errbox', { timeout: 4000 });
    check('uncovered date shows error box', (await page.locator('#output .errbox').count()) === 1);

    // 12. reset
    await page.click('#resetBtn');
    check('reset clears output', (await page.locator('#output .card').count()) === 0);

    check('no page errors', errors.length === 0);
    if (errors.length) errors.forEach((e) => console.log('   ' + e));
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log(fail === 0 ? '\n✓ e2e passed' : `\n✗ ${fail} e2e check(s) failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
