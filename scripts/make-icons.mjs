// Icônes reproductibles à partir de l’illustration Chopper conservée dans le dépôt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(ROOT, 'scripts/assets/op-cards-chopper.png');
const dir = path.join(ROOT, 'public/icons');
fs.mkdirSync(dir, { recursive: true });
for (const size of [180, 192, 512, 1024]) {
  await sharp(source).resize(size, size).flatten({ background: '#009ef4' }).png().toFile(path.join(dir, `op-cards-${size}.png`));
}
await sharp(source).resize(360, 360).extend({ top: 76, bottom: 76, left: 76, right: 76, background: '#009ef4' }).png().toFile(path.join(dir, 'op-cards-maskable.png'));
await sharp(source).resize(64, 64).png().toFile(path.join(ROOT, 'public/favicon.png'));
const ios = path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
if (fs.existsSync(ios)) {
  fs.copyFileSync(path.join(dir, 'op-cards-1024.png'), path.join(ios, 'AppIcon-1024.png'));
  fs.writeFileSync(path.join(ios, 'Contents.json'), JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2));
}
console.log('Icônes OP CARDS générées (web, iPhone et iOS si présent).');
