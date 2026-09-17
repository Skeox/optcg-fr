// Construit public/data/cards.json à partir de la liste de cartes officielle française
// (https://fr.onepiece-cardgame.com/cardlist/). Une requête par série (37 séries).
// Les pages HTML sont mises en cache dans .cache/html pour éviter de re-télécharger.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'html');
const OUT = path.join(ROOT, 'public', 'data', 'cards.json');
const BASE = 'https://fr.onepiece-cardgame.com';
const FORCE = process.argv.includes('--force');

const series = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'series-fr.json'), 'utf8'));
fs.mkdirSync(CACHE, { recursive: true });

async function fetchSeries(s) {
  const file = path.join(CACHE, `${s.id}.html`);
  if (!FORCE && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const url = `${BASE}/cardlist/?series=${s.id}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (optcg-fr collection tracker)' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const html = await res.text();
  fs.writeFileSync(file, html);
  return html;
}

const clean = (t) => (t ?? '').replace(/\s+/g, ' ').trim();

function parseVariantId(id) {
  // "OP17-001" | "OP17-001_p1" | "P-101_r1"
  const m = id.match(/^([A-Z]+-?\d*-\d{3})(?:_([a-z])(\d+))?$/i);
  if (!m) return null;
  return { code: m[1], variantKind: m[2] ?? '', variantIndex: m[3] ? Number(m[3]) : 0 };
}

function parseCard($, dl, s) {
  const id = $(dl).attr('id');
  const v = parseVariantId(id);
  if (!v) { console.warn('id inconnu', id); return null; }
  const info = $(dl).find('.infoCol span').map((_, e) => clean($(e).text())).get();
  const name = clean($(dl).find('.cardName').text());
  const img = $(dl).find('.frontCol img').attr('data-src') || $(dl).find('.frontCol img').attr('src') || '';
  const imgPath = img.replace(/^\.\./, '').split('?')[0];
  const back = $(dl).find('.backCol');
  const field = (cls) => {
    const el = back.find(`.${cls}`).first();
    if (!el.length) return { label: '', value: '' };
    const label = clean(el.find('h3').first().text());
    const copy = el.clone();
    copy.find('h3').remove();
    copy.find('img').remove();
    return { label, value: clean(copy.text()) };
  };
  const cost = field('cost');
  const attr = field('attribute');
  const power = field('power');
  const counter = field('counter');
  const color = field('color');
  const block = field('block');
  const feature = field('feature');
  const text = field('text');
  const trigger = field('trigger');
  const getInfo = field('getInfo');
  const num = (x) => (x === '-' || x === '' ? null : Number(x.replace(/[^\d]/g, '')) || null);
  return {
    id,
    code: v.code,
    set: v.code.split('-')[0],
    variant: v.variantIndex,
    variantKind: v.variantKind, // 'p' = parallèle / alternative, 'r' = réimpression, '' = base
    name,
    rarity: info[1] ?? '',
    type: info[2] ?? '',
    image: imgPath,
    cost: cost.label === 'Coût' ? num(cost.value) : null,
    life: cost.label === 'Vie' ? num(cost.value) : null,
    attribute: attr.value === '-' ? '' : attr.value,
    power: num(power.value),
    counter: num(counter.value),
    color: color.value,
    colors: color.value ? color.value.split('/') : [],
    block: block.value,
    traits: feature.value === '-' ? [] : feature.value.split('/').map(clean).filter(Boolean),
    effect: text.value === '-' ? '' : text.value,
    trigger: trigger.value,
    extension: getInfo.value,
    series: [s.id],
  };
}

const cards = new Map();
for (const s of series) {
  const html = await fetchSeries(s);
  const $ = cheerio.load(html);
  let n = 0;
  $('dl.modalCol').each((_, dl) => {
    const c = parseCard($, dl, s);
    if (!c) return;
    n++;
    const prev = cards.get(c.id);
    if (prev) { if (!prev.series.includes(s.id)) prev.series.push(s.id); return; }
    cards.set(c.id, c);
  });
  console.log(`${s.code.padEnd(6)} ${s.id} ${String(n).padStart(4)} cartes`);
}

const list = [...cards.values()];
// Ordre "collectionneur" : boosters OP croissants, puis EB, PRB, decks ST, promos, autres.
const seriesRank = (code) => {
  const m = code.match(/^([A-Z]+)(\d*)$/);
  const fam = { OP: 1, EB: 2, PRB: 3, ST: 4, PROMO: 5, AUTRE: 6 }[m?.[1]] ?? 9;
  return fam * 1000 + Number(m?.[2] || 0);
};
const rankById = new Map(series.map((s) => [s.id, seriesRank(s.code)]));
const codeById = new Map(series.map((s) => [s.id, s.code]));
const cardRank = (c) => Math.min(...c.series.map((id) => rankById.get(id) ?? 9999));
// Au sein d'une série, les cartes de la série elle-même d'abord, puis les réimpressions d'autres sets.
const reprintRank = (c) => (c.series.some((id) => codeById.get(id) === c.set) ? 0 : 1);
list.sort((a, b) => cardRank(a) - cardRank(b) || reprintRank(a) - reprintRank(b) || a.code.localeCompare(b.code) || a.variant - b.variant);
series.sort((a, b) => seriesRank(a.code) - seriesRank(b.code));

const out = {
  generatedAt: new Date().toISOString(),
  source: BASE,
  imageBase: `${BASE}`,
  series: series.map((s) => ({ ...s, count: list.filter((c) => c.series.includes(s.id)).length })),
  cards: list,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\n${list.length} variantes uniques écrites dans ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko)`);
