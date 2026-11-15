import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(path.join(os.tmpdir(), 'trend-step1-'));
const port = 9335;
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'http://127.0.0.1:8000/'], { stdio: 'ignore' });

try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((entry) => entry.type === 'page'); }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  if (!target) throw new Error('Chrome did not open the local app.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const commandId = ++id;
    const receive = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== commandId) return;
      socket.removeEventListener('message', receive);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result?.result?.value);
    };
    socket.addEventListener('message', receive);
    socket.send(JSON.stringify({ id: commandId, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });
  let state;
  for (let i = 0; i < 80; i++) {
    const raw = await evaluate(`JSON.stringify({title:document.title, chart:typeof Chart, status:document.querySelector('#status')?.textContent, canvas:document.querySelector('#series-chart')?.width})`);
    if (raw) state = JSON.parse(raw);
    if (state?.title === 'Earth System Trend Detective' && state?.status) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!state || state.title !== 'Earth System Trend Detective') throw new Error(`Local page did not load: ${target.url} ${JSON.stringify(state)}`);
  await evaluate(`document.querySelector('#investigation-form').requestSubmit(); true`);
  for (let i = 0; i < 80; i++) {
    const raw = await evaluate(`JSON.stringify({status:document.querySelector('#status').textContent, canvas:document.querySelector('#series-chart').width})`);
    if (raw) state = { ...state, ...JSON.parse(raw) };
    if (state.chart === 'function' && state.status && !state.status.includes('Requesting live')) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (state.status.includes('Chart.js did not load')) throw new Error(`Pinned CDN and local Chart.js fallback did not load: ${JSON.stringify(state)}`);
  if (!state.status.startsWith('Live NASA POWER data') && !state.status.startsWith('Live NASA POWER request failed')) throw new Error(`The investigation did not complete cleanly: ${JSON.stringify(state)}`);
  console.log(JSON.stringify(state));
  if (state.status.startsWith('Live NASA POWER data')) console.log('PASS live NASA series rendered.');
  else console.log('Page ran and reported its live-request failure honestly.');
  socket.close();
} finally {
  child.kill();
  if (child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve));
  const safe = path.resolve(profile);
  if (!safe.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Refusing to remove an unexpected temporary Chrome profile.');
  await rm(safe, { recursive: true, force: true });
}
