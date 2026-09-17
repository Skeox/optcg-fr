// Génère les icônes PWA (public/icons) à partir d'un SVG simple.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="110" fill="#0b1020"/>
  <rect x="146" y="86" width="220" height="308" rx="22" fill="#1c2540" stroke="#f5b942" stroke-width="16"/>
  <rect x="176" y="118" width="160" height="150" rx="10" fill="#e2472f"/>
  <circle cx="256" cy="193" r="46" fill="#f5b942"/>
  <rect x="176" y="292" width="160" height="18" rx="9" fill="#9aa5c4"/>
  <rect x="176" y="326" width="110" height="18" rx="9" fill="#9aa5c4"/>
  <text x="256" y="470" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#f5b942" text-anchor="middle">FR</text>
</svg>`;
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), svg);
for (const size of [192, 512]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(dir, `icon-${size}.png`));
}
console.log('icônes générées');
