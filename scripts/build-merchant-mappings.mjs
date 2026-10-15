// Les preuves complètes restent dans le dépôt, sans alourdir l'application mobile.
import fs from 'node:fs';

const evidence = JSON.parse(fs.readFileSync('scripts/data/merchant-evidence.json', 'utf8'));
const cardmarket = {}, cardtrader = {};
for (const [id, entry] of Object.entries(evidence)) {
  if (entry.product) cardmarket[id] = {
    product: entry.product, expansion: entry.expansion,
    blueprint: entry.blueprint, series: entry.series,
  };
  else cardtrader[id] = { blueprint: entry.blueprint, series: entry.series };
}
for (const [name, data] of Object.entries({ cardmarket, cardtrader })) {
  fs.writeFileSync(`src/data/${name}-mappings.json`, JSON.stringify(data, null, 2) + '\n');
}
