import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = process.env.CARTO_API_KEY || '';
const contents = `window.CARTO_API_KEY = ${JSON.stringify(key)};\n`;
await writeFile(path.join(root, 'map-runtime-config.js'), contents, 'utf8');
console.log(key ? 'Generated CARTO browser configuration.' : 'Generated CARTO browser configuration without a key; CARTO may show its attribution watermark.');
