// Headless browser smoke test for the rep-tool trip planner UI.
// Drives the real page against the running server (deterministic endpoint,
// no API key needed). Run: node scripts/browser-smoke.js
const { chromium } = require('playwright-core');

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://localhost:3000';
// The rep tool is now behind a shared-password login (Phase 4). Use the same
// password the server was started with.
const REP_PASSWORD = process.env.REP_PASSWORD || 'hunter2-shared';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  let fail = 0;
  const check = (name, cond) => { if (!cond) { fail++; console.log('  FAIL: ' + name); } };

  // Authenticate first so the session cookie is set on the context.
  const login = await context.request.post(BASE + '/api/login', { data: { password: REP_PASSWORD } });
  check('login succeeds', login.ok());

  await page.goto(BASE + '/sales-agent.html', { waitUntil: 'networkidle' });
  check('page title loaded', (await page.title()).length >= 0);
  check('Plan a trip button present', await page.locator('button.trip-btn').count() === 1);

  // Open the planner
  await page.click('button.trip-btn');
  await page.waitForSelector('#trip-modal.open', { timeout: 3000 });
  check('trip modal opened', await page.locator('#trip-modal.open').count() === 1);

  // Region dropdown should have been populated from /api/regions
  await page.waitForFunction(() => document.querySelectorAll('#tp-region option').length > 1, { timeout: 3000 });
  const regionCount = await page.locator('#tp-region option').count();
  check('regions populated (>1)', regionCount > 1);

  // Fill the form: Hawaii, family of 4, flexible week
  await page.fill('#tp-location', 'Hawaii');
  await page.fill('#tp-checkin', '2026-07-13');
  await page.fill('#tp-nights', '7');
  await page.fill('#tp-flex', '3');
  await page.fill('#tp-party', '4');
  await page.click('#tp-go');

  // Results should render cards
  await page.waitForSelector('.trip-card', { timeout: 5000 });
  const cards = await page.locator('.trip-card').count();
  check('trip cards rendered', cards >= 1);
  const firstCredits = await page.locator('.trip-card .trip-credits').first().innerText();
  check('first card shows credits', /credit/i.test(firstCredits));
  const bestBadge = await page.locator('.trip-card.best .trip-badge.good').first().innerText();
  check('best-value badge present', /best value/i.test(bestBadge));
  const note = await page.locator('.trip-note').last().innerText();
  check('fees-excluded disclaimer shown', /not included/i.test(note));

  // Copy summary button exists and is clickable
  check('copy summary button present', await page.locator('.trip-mini-btn', { hasText: 'Copy summary' }).count() >= 1);

  // No-match path
  await page.fill('#tp-location', 'Narnia');
  await page.click('#tp-go');
  await page.waitForTimeout(500);
  const noMatch = await page.locator('#tp-results').innerText();
  check('no-match handled gracefully', /no options|no resorts|match/i.test(noMatch));

  check('no uncaught page errors', errors.length === 0);
  if (errors.length) errors.forEach(e => console.log('  ' + e));

  await browser.close();
  console.log(fail === 0 ? '\nBROWSER SMOKE: PASS' : `\nBROWSER SMOKE: ${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('smoke crashed:', e); process.exit(1); });
