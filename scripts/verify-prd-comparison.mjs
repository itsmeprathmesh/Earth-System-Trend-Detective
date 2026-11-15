import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = await mkdtemp(path.join(os.tmpdir(), 'trend-prd-'));
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.csv': 'text/csv', '.bin': 'application/octet-stream', '.png': 'image/png' };
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { const body = await readFile(file); response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(body); }
  catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const debugPort = 9336;
const child = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1360,1000', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/`], { stdio: 'ignore' });

try {
  let target;
  for (let attempt = 0; attempt < 60 && !target; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((entry) => entry.type === 'page' && entry.url.startsWith(`http://127.0.0.1:${port}/`)); }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  if (!target) throw new Error('Chrome did not open the local GISTEMP page.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let commandId = 0;
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const id = ++commandId;
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result?.result?.value);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });

  let state;
  for (let attempt = 0; attempt < 120; attempt++) {
    const raw = await evaluate(`JSON.stringify({title:document.title,source:document.querySelector('.source-status')?.textContent,chart:typeof Chart,loaded:!!(window.Chart&&Chart.getChart(document.getElementById('trend-chart')))})`);
    if (raw) state = JSON.parse(raw);
    if (state?.loaded || state?.source?.includes('DATA LOAD ISSUE')) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (state?.source?.includes('DATA LOAD ISSUE')) throw new Error(`GISTEMP failed to load its bundled files: ${state.source}`);
  if (!state?.loaded) throw new Error(`GISTEMP chart did not initialize: ${JSON.stringify(state)}`);
  const mapTile = await evaluate(`JSON.stringify({configured:!!window.CARTO_API_KEY,loaded:[...document.querySelectorAll('#map .leaflet-tile')].some((tile)=>tile.complete&&tile.naturalWidth>0)})`);
  const mapStatus = JSON.parse(mapTile);
  if (mapStatus.configured && !mapStatus.loaded) throw new Error('CARTO key is configured but no basemap tile loaded.');

  await evaluate(`document.getElementById('compare-button').click(); true`);
  let comparison;
  for (let attempt = 0; attempt < 40; attempt++) {
    comparison = JSON.parse(await evaluate(`JSON.stringify({open:!document.getElementById('hemisphere-comparison').hidden,expanded:document.getElementById('compare-button').getAttribute('aria-expanded'),chart:!!(window.Chart&&Chart.getChart(document.getElementById('hemisphere-chart'))),north:document.getElementById('north-sen-rate').textContent,south:document.getElementById('south-sen-rate').textContent,gap:document.getElementById('hemisphere-sen-gap').textContent,summary:document.getElementById('hemisphere-difference').textContent})`));
    if (comparison.chart || comparison.north !== '—') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!comparison.open || comparison.expanded !== 'true' || !comparison.chart || comparison.north === '—' || comparison.south === '—' || comparison.gap === '—') throw new Error(`Hemisphere comparison did not render: ${JSON.stringify(comparison)}`);
  const captureId = ++commandId;
  const image = await new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== captureId) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result.data);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id: captureId, method: 'Page.captureScreenshot', params: { format: 'png', captureBeyondViewport: true } }));
  });
  const screenshotPath = path.join(root, 'audit', 'shots', 'after', 'prd-hemisphere-comparison.png');
  await writeFile(screenshotPath, Buffer.from(image, 'base64'));
  console.log(`PASS GISTEMP data loaded; ${mapStatus.configured ? 'keyed basemap tile' : 'unkeyed basemap not checked'}; hemisphere comparison chart and both real-data rate metrics rendered.`);
  console.log(`North ${comparison.north} · South ${comparison.south} · North−South ${comparison.gap}`);
  console.log(`Screenshot: ${screenshotPath}`);
  socket.close();
} finally {
  child.kill();
  if (child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve));
  await new Promise((resolve) => server.close(resolve));
  const safe = path.resolve(profile);
  if (!safe.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Refusing to remove an unexpected temporary Chrome profile.');
  await rm(safe, { recursive: true, force: true });
}
