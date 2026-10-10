/**
 * End-to-end walkthrough of VetAtlas 3D with Playwright (Chromium, software WebGL).
 * Runs against a built client served by the API server (npm run build && npm start)
 * or starts one itself on port 8792. Produces screenshots in docs/screenshots.
 *
 *   node tests/verify.e2e.mjs            # uses http://localhost:8787 if reachable
 *   BASE=http://localhost:5173 node tests/verify.e2e.mjs
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

let BASE = process.env.BASE ?? 'http://localhost:8787';
let serverProc = null;
async function reachable(url) {
  try {
    const r = await fetch(url + '/api/health');
    return r.ok;
  } catch {
    return false;
  }
}
if (!(await reachable(BASE))) {
  BASE = 'http://localhost:8792';
  serverProc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(root, 'server/src/index.ts')], { env: { ...process.env, PORT: '8792', VETATLAS_DB: ':memory:' }, stdio: 'inherit' });
  for (let i = 0; i < 50 && !(await reachable(BASE)); i++) await new Promise((r) => setTimeout(r, 200));
}

const results = [];
const errors = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' – ' + detail : ''}`);
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const state = (page) => page.evaluate(() => {
  const s = window.__vetatlas.store.getState();
  return { view: s.view, species: s.speciesId, region: s.region, selected: s.selected, depth: s.depth, systems: s.systems, loading: s.loading.active, motionOn: s.motionOn, panel: s.panel, labelLang: s.settings.labelLang };
});
const camera = (page) => page.evaluate(() => {
  const c = window.__vetatlasCamera;
  return c ? { az: c.azimuthAngle, polar: c.polarAngle, dist: c.distance, target: c.getTarget ? c.getTarget(new window.__THREE_Vector3()).toArray() : null } : null;
});
async function waitFrames(page, n = 8) {
  const start = await page.evaluate(() => window.__vetatlasRuntime?.frame ?? 0);
  await page.waitForFunction((s) => (window.__vetatlasRuntime?.frame ?? 0) >= s, start + n, { timeout: 90000 });
}
async function waitAtlas(page) {
  await page.waitForFunction(() => window.__vetatlas?.store.getState().view === 'atlas' && !window.__vetatlas.store.getState().loading.active, null, { timeout: 120000 });
  await waitFrames(page, 6);
}
function attach(page) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
}

// ------------------------------------------------------------------ desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  attach(page);
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.welcome .btn.primary', { timeout: 60000 });
  await page.screenshot({ path: join(OUT, 'desktop-01-welcome.jpg'), type: 'jpeg', quality: 82 });
  check('welcome dialog shown on first visit', true);
  await page.click('.welcome .btn.primary');
  await page.waitForFunction(() => Object.keys(window.__vetatlas.store.getState().payloads).length === 5, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, 'desktop-02-home.jpg'), type: 'jpeg', quality: 82 });
  check('home shows all five species', (await page.locator('.species-tag').count()) === 5, `${Date.now() - t0} ms`);

  // click the horse in the 3D scene (hit test through the canvas)
  const horsePos = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.species-tag')].find((e) => e.textContent.includes('Horse'));
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height + 70 };
  });
  await page.mouse.click(horsePos.x, horsePos.y);
  await page.waitForTimeout(500);
  const spinning = await page.evaluate(() => window.__vetatlas.store.getState().spinning);
  check('clicking the horse starts the 360° turn + data load', spinning === 'horse', String(spinning));
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, 'desktop-03-spin.jpg'), type: 'jpeg', quality: 82 });
  await waitAtlas(page);
  const s1 = await state(page);
  check('atlas opens for the horse with its data', s1.view === 'atlas' && s1.species === 'horse');
  await page.screenshot({ path: join(OUT, 'desktop-04-atlas-skin.jpg'), type: 'jpeg', quality: 82 });
  check('URL updated to /atlas/horse', page.url().endsWith('/atlas/horse'));

  // hotspot → region focus
  await page.click('.hotspot[data-region="forelimb_left"]');
  await waitFrames(page, 20);
  const s2 = await state(page);
  check('hotspot click focuses the left forelimb', s2.region === 'forelimb_left');
  // peel layers with the wheel
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 60);
  await page.waitForTimeout(200);
  const s3 = await state(page);
  check('mouse wheel peels layers (depth increases)', s3.depth > 0.3, `depth=${s3.depth.toFixed(2)}`);
  await waitFrames(page, 16);
  await page.screenshot({ path: join(OUT, 'desktop-05-forelimb-muscles.jpg'), type: 'jpeg', quality: 82 });
  const labelsMuscle = await page.evaluate(() => [...document.querySelectorAll('.lbl .lbl-main')].map((e) => e.textContent));
  check('labels appear for the focused region', labelsMuscle.length >= 5, labelsMuscle.slice(0, 6).join(', '));
  await page.evaluate(() => window.__vetatlas.store.getState().setDepth(1));
  await waitFrames(page, 16);
  await page.screenshot({ path: join(OUT, 'desktop-06-forelimb-bones.jpg'), type: 'jpeg', quality: 82 });
  const labelsBone = await page.evaluate(() => [...document.querySelectorAll('.lbl .lbl-main')].map((e) => e.textContent));
  check('at full depth only skeleton labels remain', labelsBone.length > 0 && !labelsBone.some((l) => l.startsWith('M. ')), labelsBone.slice(0, 6).join(', '));

  // structure selection via click on a label
  await page.locator('.lbl').first().click();
  await waitFrames(page, 4);
  const s4 = await state(page);
  check('clicking a label selects the structure and opens the detail panel', !!s4.selected && (await page.locator('.detail-panel .detail-title').count()) === 1, s4.selected);
  await page.screenshot({ path: join(OUT, 'desktop-07-detail.jpg'), type: 'jpeg', quality: 82 });

  // notes round-trip through the API
  await page.fill('.notes textarea', 'Zkušební poznámka z automatického testu');
  await page.click('.notes .btn');
  await page.waitForSelector('.note', { timeout: 15000 });
  check('a personal note is saved through the API and listed', (await page.locator('.note').count()) === 1);
  await page.click('.note .link.danger');
  await page.waitForFunction(() => document.querySelectorAll('.note').length === 0, null, { timeout: 15000 });
  check('note deleted', true);

  // label language switch
  await page.click('.seg button:has-text("CS")');
  await waitFrames(page, 4);
  const csTitle = await page.locator('.detail-title').textContent();
  check('label language switches to Czech', /[ěščřžýáíéůú]/i.test(csTitle) || !/^[A-Z][a-z]+ [a-z]+$/.test(csTitle), csTitle);
  await page.click('.seg button:has-text("LA")');

  // double / triple click return
  await page.evaluate(() => { window.__vetatlas.store.getState().select(null); });
  const camBefore = await page.evaluate(() => { const c = window.__vetatlasControls; return { az: c.azimuthAngle, polar: c.polarAngle, dist: c.distance }; });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.5 + 220, box.y + box.height * 0.5 + 40, { steps: 8 }); await page.mouse.up();
  await waitFrames(page, 6);
  const camRot = await page.evaluate(() => { const c = window.__vetatlasControls; return { az: c.azimuthAngle, polar: c.polarAngle, dist: c.distance }; });
  check('dragging rotates the camera', Math.abs(camRot.az - camBefore.az) > 0.2, `Δaz=${(camRot.az - camBefore.az).toFixed(2)}`);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -60); // peel back a bit so the double click has something to do
  await page.mouse.dblclick(box.x + box.width * 0.75, box.y + box.height * 0.25);
  await waitFrames(page, 20);
  const camDbl = await page.evaluate(() => { const c = window.__vetatlasControls; return { az: c.azimuthAngle, polar: c.polarAngle, dist: c.distance }; });
  check('double-click re-fits the region but keeps the orientation', Math.abs(camDbl.az - camRot.az) < 0.05, `az=${camDbl.az.toFixed(2)} vs ${camRot.az.toFixed(2)}`);
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25, { clickCount: 3 });
  await waitFrames(page, 24);
  const camTri = await page.evaluate(() => { const c = window.__vetatlasControls; return { az: c.azimuthAngle, polar: c.polarAngle }; });
  check('triple-click also restores the canonical orientation', Math.abs(camTri.az - (-0.35)) < 0.08 && Math.abs(camTri.polar - 1.5) < 0.08, `az=${camTri.az.toFixed(2)} polar=${camTri.polar.toFixed(2)}`);

  // systems + physiology
  await page.evaluate(() => { const s = window.__vetatlas.store.getState(); s.setRegion(null); s.setDepth(0); s.toggleSystem('vascular'); s.toggleSystem('respiratory'); s.toggleSystem('digestive'); });
  await waitFrames(page, 16);
  await page.screenshot({ path: join(OUT, 'desktop-08-systems.jpg'), type: 'jpeg', quality: 82 });
  const heartScale = await page.evaluate(async () => {
    const r = window.__vetatlasRuntime;
    const heart = r.model.byKey.get('cor');
    const a = heart.meshes[0].scale.x;
    const f0 = r.frame;
    await new Promise((res) => { const iv = setInterval(() => { if (r.frame > f0 + 12) { clearInterval(iv); res(); } }, 50); });
    const b = heart.meshes[0].scale.x;
    return { a, b };
  });
  check('heart beats (scale changes over time)', Math.abs(heartScale.a - heartScale.b) > 0.001 || heartScale.a !== 1, JSON.stringify(heartScale));
  const flow = await page.evaluate(() => { const r = window.__vetatlasRuntime; const a = r.model.byKey.get('aorta'); return a.uniforms[0].uFlow.value; });
  check('blood flow animation enabled on vessels', flow === 1);
  const particles = await page.evaluate(() => { const g = window.__vetatlasRuntime.model.root.parent; return [...g.children].some((c) => c.name === 'air-particles' && c.visible) && [...g.children].some((c) => c.name === 'food-particles' && c.visible); });
  check('air and food particles are visible with the respiratory/digestive systems on', particles);

  // limb motion
  await page.evaluate(() => { const s = window.__vetatlas.store.getState(); s.toggleSystem('vascular'); s.toggleSystem('respiratory'); s.toggleSystem('digestive'); s.setRegion('hindlimb_left'); s.setDepth(0.4); s.setMotionOn(true); });
  await waitFrames(page, 20);
  const motion = await page.evaluate(() => { const r = window.__vetatlasRuntime; const piv = r.model.limbs.get('hl_L'); return { stifle: piv.joints.stifle.rotation.z, hock: piv.joints.hock.rotation.z, limb: r.motionLimb }; });
  check('limb motion animates the hindlimb joints', motion.limb === 'hl_L' && (Math.abs(motion.stifle) > 0.001 || Math.abs(motion.hock) > 0.001), JSON.stringify(motion));
  await page.screenshot({ path: join(OUT, 'desktop-09-motion.jpg'), type: 'jpeg', quality: 82 });
  await page.evaluate(() => window.__vetatlas.store.getState().setMotionOn(false));

  // search
  await page.fill('.search input', 'humerus');
  await page.waitForSelector('.search-results li');
  await page.keyboard.press('Enter');
  await waitFrames(page, 10);
  const s5 = await state(page);
  check('search selects and focuses the structure', s5.selected === 'humerus_L', s5.selected);

  // species switch via breadcrumb
  await page.selectOption('.crumb-species', 'cat');
  await waitAtlas(page);
  const s6 = await state(page);
  check('species can be switched from the breadcrumb', s6.species === 'cat');
  await page.evaluate(() => window.__vetatlas.store.getState().setDepth(1));
  await waitFrames(page, 16);
  await page.screenshot({ path: join(OUT, 'desktop-10-cat-skeleton.jpg'), type: 'jpeg', quality: 82 });

  // settings dialog + theme
  await page.click('.icon-btn[title="Settings"], .icon-btn[title="Nastavení"]');
  await page.waitForSelector('.modal');
  await page.click('.modal .seg button:has-text("Dark")');
  await page.waitForTimeout(300);
  check('dark theme applies', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await page.screenshot({ path: join(OUT, 'desktop-11-settings-dark.jpg'), type: 'jpeg', quality: 82 });
  await page.click('.modal .seg button:has-text("Light")');
  await page.keyboard.press('Escape');

  // back to home
  await page.click('.icon-btn[title="All animals"], .icon-btn[title="Všechna zvířata"]');
  await page.waitForTimeout(1500);
  check('back button returns to the species selection', (await state(page)).view === 'home');
  await ctx.close();
}

// ------------------------------------------------------------------ iPad
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  attach(page);
  await page.addInitScript(() => { try { localStorage.setItem('vetatlas.welcomeSeen', '1'); } catch {} });
  await page.goto(BASE + '/atlas/cow', { waitUntil: 'networkidle' });
  await waitAtlas(page);
  await page.screenshot({ path: join(OUT, 'tablet-01-cow.jpg'), type: 'jpeg', quality: 82 });
  await page.tap('.hotspot[data-region="thorax"]');
  await waitFrames(page, 20);
  // drag the depth rail with touch
  const rail = await page.locator('.rail-track').boundingBox();
  await page.touchscreen.tap(rail.x + rail.width / 2, rail.y + rail.height * 0.4);
  await waitFrames(page, 16);
  const s = await state(page);
  check('tablet: tapping the depth rail sets the depth', s.depth > 0.3 && s.depth < 0.5 && s.region === 'thorax', `depth=${s.depth.toFixed(2)}`);
  await page.screenshot({ path: join(OUT, 'tablet-02-cow-thorax.jpg'), type: 'jpeg', quality: 82 });
  await page.evaluate(() => { const s = window.__vetatlas.store.getState(); s.setDepth(1); s.toggleSystem('digestive'); s.setRegion('abdomen'); });
  await waitFrames(page, 16);
  await page.screenshot({ path: join(OUT, 'tablet-03-cow-digestive.jpg'), type: 'jpeg', quality: 82 });
  await ctx.close();
}

// ------------------------------------------------------------------ iPhone
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });
  const page = await ctx.newPage();
  attach(page);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.welcome .btn.primary', { timeout: 60000 });
  await page.tap('.welcome .btn.primary');
  await page.waitForFunction(() => Object.keys(window.__vetatlas.store.getState().payloads).length === 5, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, 'phone-01-home.jpg'), type: 'jpeg', quality: 82 });
  await page.tap('.species-card:has-text("Dog")');
  await waitAtlas(page);
  await page.screenshot({ path: join(OUT, 'phone-02-dog.jpg'), type: 'jpeg', quality: 82 });
  check('phone: species card opens the atlas', (await state(page)).species === 'dog');
  await page.tap('.mobile-tabs button:nth-child(2)');
  await page.waitForSelector('.sheet');
  check('phone: bottom tabs open a sheet', true);
  await page.screenshot({ path: join(OUT, 'phone-03-layers-sheet.jpg'), type: 'jpeg', quality: 82 });
  await page.tap('.sheet .switch-row:nth-child(2)');
  await waitFrames(page, 6);
  await page.tap('.sheet-handle');
  await page.evaluate(() => { const s = window.__vetatlas.store.getState(); s.setDepth(0.4); s.setRegion('forelimb_left'); });
  await waitFrames(page, 20);
  await page.screenshot({ path: join(OUT, 'phone-04-forelimb.jpg'), type: 'jpeg', quality: 82 });
  // double tap returns to the region
  const box = await page.locator('canvas').boundingBox();
  const cam0 = await page.evaluate(() => { const c = window.__vetatlasControls; return { az: c.azimuthAngle, dist: c.distance }; });
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await waitFrames(page, 16);
  const cam1 = await page.evaluate(() => { const c = window.__vetatlasControls; return { az: c.azimuthAngle, dist: c.distance }; });
  check('phone: double tap keeps the orientation while refitting', Math.abs(cam1.az - cam0.az) < 0.05, JSON.stringify({ cam0, cam1 }));
  const labels = await page.evaluate(() => document.querySelectorAll('.lbl').length);
  check('phone: labels shown (limited count)', labels > 0 && labels <= 8, String(labels));
  await ctx.close();
}

await browser.close();
serverProc?.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (errors.length) console.log('browser errors:', errors);
if (failed.length || errors.length) process.exit(1);
