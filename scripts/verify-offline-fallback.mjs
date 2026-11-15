import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotPath = path.join(root, 'audit', 'shots', 'after', 'power-investigation-snapshot.png');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const { port } = server.address();
try {
  const dom = await new Promise((resolveSpawn, rejectSpawn) => {
    const child = spawn(chromePath, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions',
      '--host-resolver-rules=MAP power.larc.nasa.gov ~NOTFOUND',
      '--virtual-time-budget=12000', `--screenshot=${screenshotPath}`, '--dump-dom',
      `http://127.0.0.1:${port}/`,
    ]);
    let output = '';
    let errors = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { errors += chunk; });
    child.on('error', rejectSpawn);
    child.on('close', (code) => code === 0 ? resolveSpawn(output) : rejectSpawn(new Error(`Chrome exited ${code}: ${errors}`)));
  });
  const passed = dom.includes('SNAPSHOT') && dom.includes('Shipped NASA case snapshot') && dom.includes('Using a dated NASA POWER snapshot');
  console.log(`${passed ? 'PASS' : 'FAIL'} offline fallback: ${passed ? 'matching shipped snapshot rendered in SNAPSHOT mode' : 'page did not render the expected snapshot receipt'}`);
  console.log(`Screenshot: ${screenshotPath}`);
  if (!passed) {
    console.error(dom.match(/Investigation unavailable[^<]*/)?.[0] || 'The expected receipt text was not present.');
    process.exitCode = 1;
  }
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
