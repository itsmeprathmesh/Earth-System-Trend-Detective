const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const PORT = 8080;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.bin': 'application/octet-stream',
  '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(root, reqPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://127.0.0.1:${PORT}`);
  const targetShot = path.resolve(process.argv[2] || path.join(__dirname, 'shots', 'before', 'baseline_dashboard.png'));
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(targetShot), { recursive: true });

  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--virtual-time-budget=6000',
    `--window-size=${process.argv[3] || '1280,800'}`,
    `--screenshot=${targetShot}`,
    `http://127.0.0.1:${PORT}/${process.argv[4] ? '?' + process.argv[4] : ''}`
  ];

  console.log('Spawning Chrome to capture:', targetShot);
  const chrome = spawn(chromePath, args);

  chrome.on('close', (code) => {
    console.log(`Chrome process exited with code ${code}`);
    server.close(() => {
      console.log('Server closed.');
      if (fs.existsSync(targetShot)) {
        console.log(`Screenshot successfully created: ${targetShot} (${fs.statSync(targetShot).size} bytes)`);
      } else {
        console.error(`Failed to create screenshot: ${targetShot}`);
        process.exit(1);
      }
    });
  });

  chrome.on('error', (err) => {
    console.error('Failed to spawn Chrome:', err);
    server.close();
    process.exit(1);
  });
});
