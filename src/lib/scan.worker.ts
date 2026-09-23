import type { Card, Hashes } from '../types';
import { locateCard, rank, type Probe } from './scan';
import { dhashOf, type Rect } from './vision';

let hashes: Hashes;
let cards: Card[];

self.onmessage = (event: MessageEvent) => {
  if (event.data.type === 'init') {
    hashes = event.data.hashes;
    cards = event.data.cards;
    return;
  }
  try {
    const { frame, prior } = event.data as { frame: ImageData; prior: Rect };
    const loc = locateCard(frame, prior, hashes);
    const probes: Probe[] = loc ? [loc.probe] : [];
    // Le cadre reste exploitable même si la pochette ou le fond masque les contours.
    for (const inset of [0, 0.02, 0.04]) {
      const r = { x: prior.x + prior.w * inset, y: prior.y + prior.h * inset, w: prior.w * (1 - inset * 2), h: prior.h * (1 - inset * 2) };
      const art = hashes.art;
      probes.push({
        full: dhashOf(frame.data, frame.width, frame.height, 4, r, hashes.size),
        art: dhashOf(frame.data, frame.width, frame.height, 4, { x: r.x + r.w * art.left, y: r.y + r.h * art.top, w: r.w * art.width, h: r.h * art.height }, hashes.size),
      });
    }
    // Chercher le concurrent sur TOUT le catalogue : huit variantes proches ne doivent
    // pas masquer une autre carte presque ex æquo, située juste après dans le classement.
    const ranked = rank(probes, hashes, cards, { code: null, name: null }, cards.length);
    const competitor = ranked.find((m) => m.card.code !== ranked[0]?.card.code);
    const matches = competitor ? [ranked[0], competitor] : ranked.slice(0, 1);
    self.postMessage({ matches, quad: loc && loc.d < 68 ? loc.quad : null });
  } catch {
    self.postMessage({ error: 'Analyse vidéo indisponible. Essayez une photo ou le bas de la carte.' });
  }
};
