import { expect, it } from 'vitest';
import { parseCardmarketName } from '../scripts/lib/cardmarket-catalogue.mjs';

it('conserve le Leader Uta malgré l’espace ajouté au nom du catalogue Cardmarket', () => {
  expect(parseCardmarketName('Uta ( ST11-001)')).toEqual({ name: 'Uta', code: 'ST11-001' });
  expect(parseCardmarketName('Uta (\u00a0ST11-001\u00a0) ')).toEqual({ name: 'Uta', code: 'ST11-001' });
});

it('préserve les noms et codes ordinaires, y compris les promotions', () => {
  expect(parseCardmarketName('Monkey.D.Luffy (OP09-119)')).toEqual({ name: 'Monkey.D.Luffy', code: 'OP09-119' });
  expect(parseCardmarketName('Uta (P-011)')).toEqual({ name: 'Uta', code: 'P-011' });
});

it('ne déduit pas un code d’un nom incomplet ou d’un texte libre', () => {
  for (const name of ['Uta ST11-001', 'Uta (ST11-01)', 'Uta (ST11-0010)', 'Uta (ST11-001) autre carte', 'Uta (ST11-001 / P-011)']) {
    expect(parseCardmarketName(name)).toBeUndefined();
  }
});
