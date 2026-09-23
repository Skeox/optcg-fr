import { describe, expect, it } from 'vitest';
import { coverToSource, matchPercent, rank, type Match } from '../src/lib/scan';
import { liveCandidate, StableDetection } from '../src/lib/live-scan';
import { minimumFrPrice, productUrl, searchUrl } from '../src/lib/cardmarket';
import type { Card, CmProduct, Hashes } from '../src/types';

const match = (code: string, distance: number): Match => ({ card: { code } as Card, dFull: distance, dArt: distance, score: distance, codeMatch: false, nameMatch: false });

describe('Reconnaissance continue', () => {
  it('attend trois lectures concordantes et repart de zéro après une absence ou un changement', () => {
    const stable = new StableDetection();
    expect(stable.observe('OP17-001')).toBe(false);
    expect(stable.observe('OP17-001')).toBe(false);
    expect(stable.observe(null)).toBe(false);
    expect(stable.observe('OP17-001')).toBe(false);
    expect(stable.observe('OP17-002')).toBe(false);
    expect(stable.observe('OP17-002')).toBe(false);
    expect(stable.observe('OP17-002')).toBe(true);
  });

  it('refuse les images faibles ou ambiguës mais accepte plusieurs variantes du même code', () => {
    expect(liveCandidate([])).toBeNull();
    expect(liveCandidate([match('A', 80), match('B', 120)])).toBeNull();
    expect(liveCandidate([match('A', 40), match('B', 45)])).toBeNull();
    expect(liveCandidate([match('A', 40), match('A', 42), match('B', 90)])).toBe('A');
  });

  it('affiche une similarité bornée et ne transforme pas un code OCR en Match 100%', () => {
    expect(matchPercent(match('A', 0))).toBe(100);
    expect(matchPercent(match('A', 51.2))).toBe(80);
    expect(matchPercent({ ...match('A', 51.2), codeMatch: true, score: -40 })).toBe(80);
    expect(matchPercent(match('A', 0.1))).toBe(99);
    expect(matchPercent(match('A', Infinity))).toBe(0);
    expect(matchPercent(match('A', 300))).toBe(0);
    expect(matchPercent(match('A', 16), 8)).toBe(75);
  });

  it('recadre une vidéo paysage en gardant la zone visible sur un téléphone portrait', () => {
    expect(coverToSource(1920, 1080, 300, 400, { x: 0, y: 0, w: 300, h: 400 })).toEqual({ x: 555, y: 0, w: 810, h: 1080 });
  });

  it('utilise le code lu pour corriger deux illustrations proches', () => {
    const hashes = { size: 16, entries: { A: { full: '0'.repeat(64), art: '0'.repeat(64) }, B: { full: 'f'.repeat(4) + '0'.repeat(60), art: 'f'.repeat(4) + '0'.repeat(60) } } } as Hashes;
    const cards = [{ id: 'A', code: 'OP17-001' }, { id: 'B', code: 'OP17-002' }] as Card[];
    const probes = [{ full: '0'.repeat(64), art: '0'.repeat(64) }];
    expect(rank(probes, hashes, cards, { code: null, name: null })[0].card.id).toBe('A');
    expect(rank(probes, hashes, cards, { code: 'OP17-002', name: null })[0].card.id).toBe('B');
  });
});

describe('Prix minimum Cardmarket français', () => {
  it('laisse le prix inconnu sans relevé VF et refuse les montants invalides', () => {
    expect(minimumFrPrice(undefined)).toBeNull();
    for (const price of [NaN, Infinity, -2, 0]) expect(minimumFrPrice({ price })).toBeNull();
    expect(minimumFrPrice({ price: 0.02 })).toBe(0.02);
    expect(minimumFrPrice({ low: 0.01, trend: 99 } as unknown as { price: number })).toBeNull();
  });

  it('filtre aussi les liens de recherche sur le français', () => {
    const product = { expSlug: 'A-Fist-of-Divine-Speed', name: 'Monkey D. Luffy', code: 'OP17-001', version: 1 } as CmProduct;
    for (const url of [productUrl(product), productUrl({ ...product, expSlug: null }), searchUrl('OP17-001')]) {
      expect(new URL(url).searchParams.get('language')).toBe('2');
    }
  });
});
