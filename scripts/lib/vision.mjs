// Charge src/lib/vision.ts sous Node : le scanner (navigateur) et les scripts doivent calculer
// les empreintes avec exactement le même code. Le module est transpilé à la volée dans .cache/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(ROOT, '.cache', 'vision.gen.mjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
const source = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'vision.ts'), 'utf8');
fs.writeFileSync(out, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);

export const vision = await import(pathToFileURL(out).href);
