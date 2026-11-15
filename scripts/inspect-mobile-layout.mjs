import http from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = os.tmpdir();
const profile = await mkdtemp(path.join(temporaryRoot, 'trend-detective-chrome-'));
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const filename = path.resolve(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
const debugPort = 9333;
const child = spawn(chromePath, [
  '--headless=new', '--no-sandbox', '--disable-gpu', `--window-size=410,1400`,
  `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`,
  `http://127.0.0.1:${port}/`,
], { stdio: 'ignore' });

try {
  let targets;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); break; }
    catch { await new Promise((resolveWait) => setTimeout(resolveWait, 250)); }
  }
  const target = targets?.find((entry) => entry.type === 'page' && entry.url.startsWith('http://127.0.0.1:'));
  if (!target) throw new Error('Could not connect to the temporary Chrome page.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  const command = (id, method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
    const timer = setTimeout(() => rejectCommand(new Error(`Timed out on ${method}.`)), 10000);
    const receive = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener('message', receive);
      if (message.error) rejectCommand(new Error(message.error.message));
      else resolveCommand(message.result);
    };
    socket.addEventListener('message', receive);
    socket.send(JSON.stringify({ id, method, params }));
  });
  await command(1, 'Emulation.setDeviceMetricsOverride', { width: 410, height: 1400, deviceScaleFactor: 1, mobile: true });
  let appState;
  for (let attempt = 0; attempt < 60; attempt++) {
    const evaluated = await command(2 + attempt, 'Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({ mode: document.getElementById('mode-badge')?.textContent, notice: document.getElementById('notice')?.textContent, height: document.documentElement.scrollHeight })` });
    appState = JSON.parse(evaluated.result.value);
    if (appState.mode === 'LIVE' || appState.mode === 'SNAPSHOT') break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  if (appState.mode !== 'LIVE' && appState.mode !== 'SNAPSHOT') throw new Error(`Page data did not finish loading: ${appState.notice}`);
  const evaluated = await command(70, 'Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({ viewport: innerWidth, media: matchMedia('(max-width: 720px)').matches, page: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, main: document.querySelector('main').getBoundingClientRect().width, body: document.body.getBoundingClientRect().width, form: document.querySelector('form').getBoundingClientRect().width, mode: document.getElementById('mode-badge').textContent, height: document.documentElement.scrollHeight })` });
  const metrics = JSON.parse(evaluated.result.value);
  console.log(JSON.stringify(metrics));
  const rangeCheck = await command(71, 'Runtime.evaluate', { returnByValue: true, expression: `(() => { const start = document.getElementById('start-range'); const end = document.getElementById('end-range'); start.value = '1990'; start.dispatchEvent(new Event('input', { bubbles: true })); end.value = '2010'; end.dispatchEvent(new Event('input', { bubbles: true })); const synced = document.getElementById('start-year').value === '1990' && document.getElementById('end-year').value === '2010' && document.getElementById('start-year-output').value === '1990' && document.getElementById('end-year-output').value === '2010'; start.value = '1981'; start.dispatchEvent(new Event('input', { bubbles: true })); end.value = String(document.getElementById('end-year').max); end.dispatchEvent(new Event('input', { bubbles: true })); return synced; })()` });
  if (!rangeCheck.result.value) throw new Error('Year range sliders did not synchronize with the selected years.');
  const geocoder = await command(72, 'Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `fetch('https://geocoding-api.open-meteo.com/v1/search?name=Nagpur&count=1&language=en&format=json').then((response) => response.ok ? response.json().then((data) => data.results?.[0]?.name || 'no result') : 'HTTP ' + response.status).catch((error) => 'unavailable: ' + error.message)` });
  console.log(`Browser geocoder check: ${geocoder.result.value}`);
  const custom = await command(73, 'Runtime.evaluate', { returnByValue: true, expression: `(() => { const season = document.getElementById('season'); season.value = 'custom'; season.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('custom-months').value = '3,4,5'; document.getElementById('investigation-form').requestSubmit(); return !document.getElementById('custom-months-field').hidden; })()` });
  if (!custom.result.value) throw new Error('Custom month controls did not open.');
  let customApplied = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const check = await command(74 + attempt, 'Runtime.evaluate', { returnByValue: true, expression: `document.getElementById('figure-label').textContent` });
    if (check.result.value.includes('CUSTOM-MONTH 3,4,5')) { customApplied = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  if (!customApplied) throw new Error('Custom month aggregation did not update the chart label.');
  const mapSelection = await command(141, 'Runtime.evaluate', { returnByValue: true, expression: `(() => { window.investigationMap.fire('click', { latlng: window.L.latLng(0, 0) }); return JSON.stringify({ case: document.getElementById('case-select').value, latitude: document.getElementById('latitude').value, longitude: document.getElementById('longitude').value }); })()` });
  const selected = JSON.parse(mapSelection.result.value);
  if (selected.case !== 'custom' || Number(selected.latitude) !== 0 || Number(selected.longitude) !== 0) throw new Error(`Map click did not set the requested custom coordinate: ${JSON.stringify(selected)}`);
  const restore = await command(142, 'Runtime.evaluate', { returnByValue: true, expression: `(() => { const season = document.getElementById('season'); season.value = 'annual'; season.dispatchEvent(new Event('change', { bubbles: true })); const site = document.getElementById('case-select'); site.value = 'sahara'; site.dispatchEvent(new Event('change', { bubbles: true })); return true; })()` });
  if (!restore.result.value) throw new Error('Could not restore the default investigation after interaction checks.');
  let annualRestored = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const check = await command(143 + attempt, 'Runtime.evaluate', { returnByValue: true, expression: `document.getElementById('figure-label').textContent` });
    if (check.result.value.includes('ANNUAL MEAN ANOMALY')) { annualRestored = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  if (!annualRestored) throw new Error('Default annual investigation did not return after interaction checks.');
  const demoStarted = await command(204, 'Runtime.evaluate', { returnByValue: true, expression: `document.querySelector('[data-demo-case="amazon"]').click()` });
  let demoReady = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const check = await command(205 + attempt, 'Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({ case: document.getElementById('case-select').value, mode: document.getElementById('mode-badge').textContent, next: !document.getElementById('demo-next').hidden })` });
    const demo = JSON.parse(check.result.value);
    if (demo.case === 'amazon' && ['LIVE', 'SNAPSHOT'].includes(demo.mode) && demo.next) { demoReady = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  if (!demoStarted.result) throw new Error('One-click Amazon demo did not start.');
  if (!demoReady) throw new Error('One-click demo did not load a real NASA series.');
  const step = await command(286, 'Runtime.evaluate', { returnByValue: true, expression: `(() => { document.getElementById('demo-next').click(); return document.getElementById('demo-step').textContent; })()` });
  if (!step.result.value.includes('Step 2 of 3')) throw new Error('Demo walkthrough did not advance.');
  await command(287, 'Runtime.evaluate', { returnByValue: true, expression: `(() => { const site = document.getElementById('case-select'); site.value = 'sahara'; site.dispatchEvent(new Event('change', { bubbles: true })); return true; })()` });
  let saharaRestored = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const check = await command(288 + attempt, 'Runtime.evaluate', { returnByValue: true, expression: `document.getElementById('case-select').value === 'sahara' && ['LIVE', 'SNAPSHOT'].includes(document.getElementById('mode-badge').textContent)` });
    if (check.result.value) { saharaRestored = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  if (!saharaRestored) throw new Error('Could not restore the Sahara case after the demo check.');
  await command(370, 'Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profile });
  const comparison = await command(371, 'Runtime.evaluate', { returnByValue: true, expression: `(() => { document.getElementById('compare-case').value = 'megacity'; document.getElementById('run-compare').click(); return true; })()` });
  if (!comparison.result.value) throw new Error('Could not start the regional comparison.');
  let comparisonReady = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const check = await command(372 + attempt, 'Runtime.evaluate', { returnByValue: true, expression: `document.getElementById('compare-result').hidden ? '' : document.getElementById('compare-verdict').textContent` });
    if (check.result.value.includes('opposite signs')) { comparisonReady = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  if (!comparisonReady) throw new Error('Sahara and Delhi did not render the measured opposite-slope comparison.');
  const shareCheck = await command(455, 'Runtime.evaluate', { returnByValue: true, expression: `document.getElementById('share-url').value === location.href` });
  if (!shareCheck.result.value) throw new Error('Share link does not match the current investigation hash.');
  await command(456, 'Runtime.evaluate', { returnByValue: true, expression: `document.getElementById('export-csv').click()` });
  await command(457, 'Runtime.evaluate', { returnByValue: true, expression: `document.getElementById('export-png').click()` });
  let downloads = [];
  for (let attempt = 0; attempt < 80; attempt++) {
    downloads = await readdir(profile);
    if (downloads.some((name) => name.endsWith('.csv')) && downloads.some((name) => name.endsWith('.png'))) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  const csvName = downloads.find((name) => name.endsWith('.csv'));
  const pngName = downloads.find((name) => name.endsWith('.png'));
  if (!csvName || !pngName) throw new Error(`CSV/PNG export did not complete: ${downloads.join(', ')}`);
  const csv = await readFile(path.join(profile, csvName), 'utf8');
  const png = await readFile(path.join(profile, pngName));
  if (!csv.includes('Mann-Kendall p-value') || !csv.includes('Deseasonalized anomaly')) throw new Error('CSV is missing receipt/statistics or plotted series data.');
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Chart export is not a valid PNG.');
  console.log('PASS P2: Amazon walkthrough, Sahara–Delhi opposite-slope comparison, share URL, CSV contents, and PNG signature.');
  const screenshot = await command(458, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 410, height: Math.min(metrics.height, 5000), scale: 1 } });
  const screenshotPath = path.join(root, 'audit', 'shots', 'after', 'power-investigation-mobile.png');
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`Screenshot: ${screenshotPath}`);
  if (!metrics.media || metrics.scroll > metrics.viewport) throw new Error('Mobile layout is not active or the page has horizontal overflow.');
  socket.close();
} finally {
  child.kill();
  if (child.exitCode === null) await new Promise((resolveExit) => child.once('exit', resolveExit));
  await new Promise((resolveClose) => server.close(resolveClose));
  const safeProfile = path.resolve(profile);
  if (!safeProfile.startsWith(path.resolve(temporaryRoot) + path.sep)) throw new Error('Refusing to remove a Chrome profile outside the temporary directory.');
  await rm(safeProfile, { recursive: true, force: true });
}
