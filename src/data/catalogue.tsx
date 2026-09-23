import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Card, Catalogue, CmProduct, Hashes, History, PriceFr, Prices, PricesFr } from '../types';
import { buildIndexes, defaultProductFor, minimumFrPrice, type Indexes } from '../lib/cardmarket';
import { db, type CollectionEntry, type CmOverride, type VfPrice } from '../db';

const BASE = import.meta.env.BASE_URL;

export async function loadJson<T>(name: string): Promise<T> {
  const res = await fetch(`${BASE}data/${name}`);
  if (!res.ok) throw new Error(`${name} : HTTP ${res.status}`);
  return res.json();
}

export interface DataCtx {
  catalogue: Catalogue | null;
  prices: Prices | null;
  history: History | null;
  idx: Indexes | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** quantités possédées, par identifiant de variante */
  owned: Map<string, CollectionEntry>;
  overrides: Map<string, number>;
  /** produit Cardmarket retenu pour une carte (surcharge manuelle ou proposition automatique) */
  productFor: (card: Card) => CmProduct | undefined;
  /** false si l'association automatique carte FR ↔ produit Cardmarket est douteuse */
  mappingSure: (card: Card) => boolean;
  /** relevé CardTrader des annonces en français pour le produit retenu, s'il existe (prices-fr.json, informatif) */
  frFor: (card: Card) => PriceFr | undefined;
  /** prix VF saisi à la main dans l'app pour cette carte */
  manualFr: Map<string, VfPrice>;
  /** Minimum Cardmarket VF relevé ; null si indisponible, aucun repli toutes langues. */
  priceFor: (card: Card) => number | null;
  /** 'vf' si priceFor vient d'un prix VF saisi à la main */
  priceKind: (card: Card) => 'vf' | null;
  pricesFr: PricesFr | null;
  hashes: () => Promise<Hashes>;
}

const Ctx = createContext<DataCtx | null>(null);

let hashesPromise: Promise<Hashes> | null = null;
function loadHashes(): Promise<Hashes> {
  return hashesPromise ??= loadJson<Hashes>('hashes.json').catch((error) => { hashesPromise = null; throw error; });
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [pricesFr, setPricesFr] = useState<PricesFr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [cat, pr] = await Promise.all([loadJson<Catalogue>('cards.json'), loadJson<Prices>('prices.json')]);
        if (cancelled) return;
        setCatalogue(cat);
        setPrices(pr);
        setError(null);
        loadJson<History>('history.json').then((h) => !cancelled && setHistory(h)).catch(() => undefined);
        loadJson<PricesFr>('prices-fr.json').then((f) => !cancelled && setPricesFr(f)).catch(() => undefined);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  const idx = useMemo(() => (catalogue ? buildIndexes(catalogue) : null), [catalogue]);

  const ownedList = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const overrideList = useLiveQuery(() => db.overrides.toArray(), [], [] as CmOverride[]);
  const owned = useMemo(() => new Map(ownedList.map((e) => [e.cardId, e])), [ownedList]);
  const vfList = useLiveQuery(() => db.vfPrices.toArray(), [], [] as VfPrice[]);
  const manualFr = useMemo(() => new Map(vfList.map((v) => [v.cardId, v])), [vfList]);
  const overrides = useMemo(() => new Map(overrideList.map((o) => [o.cardId, o.productId])), [overrideList]);

  const productCache = useMemo(() => new Map<string, { product: CmProduct; sure: boolean } | undefined>(), [idx, prices]);
  const resolve = useMemo(() => (card: Card) => {
    if (!prices || !idx) return undefined;
    const ov = overrides.get(card.id);
    if (ov != null && prices.products[ov]) return { product: prices.products[ov], sure: true };
    if (productCache.has(card.id)) return productCache.get(card.id);
    const r = defaultProductFor(card, idx, prices);
    productCache.set(card.id, r);
    return r;
  }, [prices, idx, overrides, productCache]);
  const productFor = useMemo(() => (card: Card) => resolve(card)?.product, [resolve]);
  const mappingSure = useMemo(() => (card: Card) => resolve(card)?.sure ?? true, [resolve]);

  const frFor = useMemo(() => (card: Card) => {
    const p = productFor(card);
    return p ? pricesFr?.products[p.id] : undefined;
  }, [productFor, pricesFr]);
  // Le relevé CardTrader (frFor) reste informatif : ses annonces, rares et bien plus chères que
  // Cardmarket, ne servent plus de prix de référence.
  const priceFor = useMemo(() => (card: Card) => minimumFrPrice(manualFr.get(card.id)), [manualFr]);
  const priceKind = useMemo(() => (card: Card): 'vf' | null => priceFor(card) != null ? 'vf' : null, [priceFor]);

  // Instantané quotidien des prix des cartes possédées (suivi local, indépendant du serveur).
  useEffect(() => {
    if (!prices || !idx || !ownedList.length) return;
    (async () => {
      const rows = [];
      for (const e of ownedList) {
        const card = idx.byId.get(e.cardId);
        const p = card && productFor(card);
        if (!p || !card || priceFor(card) == null) continue;
        // Date du relevé réel : ne pas faire passer une ancienne saisie pour un prix du jour.
        const date = manualFr.get(card.id)!.date;
        rows.push({ key: `${p.id}|${date}`, productId: p.id, date, trend: null, low: null, fr: priceFor(card) });
      }
      if (rows.length) await db.snapshots.bulkPut(rows);
    })().catch(() => undefined);
  }, [prices, idx, ownedList, productFor, priceFor, manualFr]);

  const value: DataCtx = {
    catalogue, prices, history, idx, loading, error,
    reload: () => setTick((t) => t + 1),
    owned, overrides, productFor, mappingSure, frFor, manualFr, priceFor, priceKind, pricesFr,
    hashes: loadHashes,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('DataProvider manquant');
  return v;
}

/** Miniature locale (le site officiel interdit l'affichage direct de ses images). */
export function imageUrl(_cat: Catalogue, card: Card): string {
  return `${BASE}images/cards/${encodeURIComponent(card.id)}.webp`;
}
