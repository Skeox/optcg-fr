import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useData } from '../data/catalogue';
import { CardImage, PageHeader, Toast, useToast, VariantBadge } from '../components/ui';
import { BAND_H, BAND_W, CARD_H, CARD_W, centeredRect, confidence, coverToSource, cropFrame, cropFromCover, cropWhole, distance, locateCard, matchPercent, probesOfCanvas, rank, rectify, type Match } from '../lib/scan';
import type { Quad, Rect } from '../lib/vision';
import { FALLBACK_DELAY_MS, liveCandidate, StableDetection } from '../lib/live-scan';
import { readBandText, readCardText, warmUpOcr, type OcrResult } from '../lib/ocr';
import { buildNameIndex, normalizeName } from '../lib/names';
import { fmtEur } from '../lib/format';
import { addQty } from '../db';
import type { Card, Hashes } from '../types';

type Mode = 'camera' | 'result';
/** 'bande' : photo rapprochée du bas de la carte (code + nom, fiable) ; 'carte' : carte entière (ressemblance d'image). */
type ScanMode = 'bande' | 'carte';

// Carte redressée : au-delà de cette distance à la carte la plus proche, le contour trouvé n'est
// pas fiable et l'on revient au simple recadrage du cadre-guide.
const LOCATE_MAX_D = 90;
// Détection automatique : la même carte doit sortir, avec une distance franche, sur plusieurs
// images de suite (une image isolée peut tomber juste par hasard, pas trois).
const LIVE_PAUSE_MS = 250;
const OCR_CARD_W = 900; // la carte redressée est rendue plus grande que 600 px pour l'OCR du nom et du code

interface BandResult {
  code: string | null;
  codeKnown: boolean;
  name: string | null;
  candidates: Card[];
}

export default function Scan() {
  const { catalogue, idx, owned, priceFor, hashes: loadHashes } = useData();
  const [hashes, setHashes] = useState<Hashes | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('carte');
  const [mode, setMode] = useState<Mode>('camera');
  const [camError, setCamError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [band, setBand] = useState<BandResult | null>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [ocrCode, setOcrCode] = useState<string | null>(null);
  const [ocrName, setOcrName] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);
  const [qty, setQty] = useState(1);
  const [manual, setManual] = useState('');
  const [toast, show] = useToast();
  const [cameraReady, setCameraReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(!document.hidden);

  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const userSelectedRef = useRef(false);
  const analysingRef = useRef(false);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [liveQuad, setLiveQuad] = useState<string | null>(null); // contour détecté (points SVG, coordonnées de l'aperçu)

  useEffect(() => {
    let cancelled = false;
    loadHashes().then((h) => !cancelled && setHashes(h)).catch(() => !cancelled && setLiveError('Reconnaissance visuelle indisponible. Essayez le bas de la carte.'));
    warmUpOcr();
    return () => { cancelled = true; };
  }, [loadHashes]);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); runRef.current++; };
  }, []);

  const chooseScanMode = (m: ScanMode) => {
    runRef.current++;
    analysingRef.current = false;
    setLiveError(null);
    setScanMode(m);
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    if (mode !== 'camera' || !visible) return;
    let cancelled = false;
    let active: MediaStream | null = null;
    setCameraReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Caméra disponible en HTTPS uniquement');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        active = stream;
        const video = videoRef.current;
        if (video) { video.srcObject = stream; await video.play(); }
        if (!cancelled) setCamError(null);
      } catch {
        if (!cancelled) setCamError('Caméra indisponible. Autorisez son accès en HTTPS ou utilisez « Photo ».');
      }
    })();
    return () => {
      cancelled = true;
      active?.getTracks().forEach((t) => t.stop());
      setCameraReady(false);
    };
  }, [mode, visible]);

  useEffect(() => {
    setFallback(false);
    if (mode !== 'camera' || scanMode !== 'carte' || !cameraReady || !visible) return;
    const timer = window.setTimeout(() => setFallback(true), FALLBACK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [mode, scanMode, cameraReady, visible, attempt]);

  const guide = useMemo(() => ({ wPct: 0.76, bandWPct: 0.92, bandRatio: BAND_W / BAND_H }), []);
  const nameIndex = useMemo(() => (catalogue ? buildNameIndex(catalogue.cards) : null), [catalogue]);

  const reset = () => { userSelectedRef.current = false; setSelected(null); setCaptured(null); setQty(1); setOcrCode(null); setOcrName(null); setManual(''); setBand(null); setMatches([]); };
  const retry = () => { runRef.current++; analysingRef.current = false; reset(); setLiveError(null); setOcrState('idle'); setAttempt((n) => n + 1); setMode('camera'); };
  const select = (card: Card | null) => { userSelectedRef.current = true; setSelected(card); };

  /** Image courante de la caméra (réduite si `maxSide` est donné : suffisant pour la détection en continu). */
  const grabFrame = useCallback((maxSide = Infinity): ImageData | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || v.readyState < 2) return null;
    const k = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const c = (frameCanvasRef.current ??= document.createElement('canvas'));
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return ctx.getImageData(0, 0, c.width, c.height);
  }, []);

  /**
   * Carte entière : on cherche son contour autour de `prior` et on la redresse ; classement par
   * ressemblance d'image, corrigé par le code et le nom lus. Une carte reconnue sans ambiguïté
   * est présélectionnée.
   */
  const analyseCard = useCallback(async (frame: ImageData, prior: Rect, band?: number) => {
    if (!hashes || !catalogue) return;
    analysingRef.current = true;
    const run = ++runRef.current;
    reset();
    try {
    const loc = locateCard(frame, prior, hashes, band);
    const located = loc != null && loc.d < LOCATE_MAX_D;
    const cardCanvas = located ? rectify(frame, loc.quad, OCR_CARD_W, Math.round(OCR_CARD_W * CARD_H / CARD_W)) : cropFrame(frame, prior);
    setCaptured(cardCanvas.toDataURL('image/jpeg', 0.7));
    const probes = located ? [loc.probe] : [...(loc ? [loc.probe] : []), ...probesOfCanvas(cardCanvas, hashes.art, hashes.size)];
    // Présélection seulement si la carte ET sa version sont sans ambiguïté (les versions d'une même carte se ressemblent).
    const preselect = (ranked: Match[]) => {
      const [top, second] = ranked;
      if (!userSelectedRef.current && top && confidence(top, ranked) === 'haute' && (!second || distance(second) - distance(top) >= 8)) setSelected(top.card);
    };
    const first = rank(probes, hashes, catalogue.cards, { code: null, name: null });
    setMatches(first);
    setMode('result');
    setOcrState('running');
    try {
      const { code, name } = await readCardText(cardCanvas, nameIndex);
      if (run !== runRef.current) return;
      setOcrCode(code);
      setOcrName(name?.name ?? null);
      setOcrState('done');
      if (code || name) {
        const ranked = rank(probes, hashes, catalogue.cards, { code, name: name?.name ?? null });
        setMatches(ranked);
        preselect(ranked);
      } else preselect(first);
    } catch {
      if (run !== runRef.current) return;
      setOcrState('failed');
      preselect(first);
    }
    } catch {
      if (run !== runRef.current) return;
      setMode('result');
      setOcrState('failed');
    }
  }, [hashes, catalogue, nameIndex]);

  /** Bas de la carte : le code identifie la carte, le nom sert de secours ; l'utilisateur choisit la version. */
  const analyseBand = useCallback(async (bandCanvas: HTMLCanvasElement, reading?: OcrResult) => {
    if (!catalogue || !idx) return;
    analysingRef.current = true;
    reset();
    setCaptured(bandCanvas.toDataURL('image/jpeg', 0.8));
    setMode('result');
    setOcrState('running');
    const run = ++runRef.current;
    try {
      const { code, name } = reading ?? await readBandText(bandCanvas, nameIndex);
      if (run !== runRef.current) return;
      const byCode = code ? idx.byCode.get(code) ?? [] : [];
      let candidates = byCode;
      if (!candidates.length && name) {
        const want = normalizeName(name.name);
        candidates = catalogue.cards.filter((c) => normalizeName(c.name) === want);
      }
      candidates = [...candidates].sort((a, b) => a.code.localeCompare(b.code) || a.variant - b.variant);
      setBand({ code, codeKnown: byCode.length > 0, name: name?.name ?? null, candidates });
      setOcrState('done');
      if (candidates.length === 1 && !userSelectedRef.current) setSelected(candidates[0]);
    } catch {
      if (run === runRef.current) setOcrState('failed');
    }
  }, [catalogue, idx, nameIndex]);

  /** Cadre-guide du mode « carte entière », en coordonnées de l'aperçu (W x H). */
  const cardGuide = useCallback((W: number, H: number): Rect => {
    const gh = Math.min(W * guide.wPct * CARD_H / CARD_W, H * 0.92), gw = gh * CARD_W / CARD_H;
    return { x: (W - gw) / 2, y: (H - gh) / 2, w: gw, h: gh };
  }, [guide]);

  const capture = () => {
    const v = videoRef.current, box = boxRef.current;
    if (!v || !box || !v.videoWidth || analysingRef.current) return;
    const W = box.clientWidth, H = box.clientHeight;
    if (scanMode === 'bande') {
      const gw = W * guide.bandWPct, gh = gw / guide.bandRatio;
      const g = { x: (W - gw) / 2, y: (H - gh) / 2, w: gw, h: gh };
      analyseBand(cropFromCover(v, v.videoWidth, v.videoHeight, W, H, g, BAND_W, BAND_H));
      return;
    }
    const frame = grabFrame();
    if (frame) analyseCard(frame, coverToSource(frame.width, frame.height, W, H, cardGuide(W, H)));
  };

  // Un seul traitement à la fois, hors du fil d'affichage pour garder la caméra fluide.
  useEffect(() => {
    if (mode !== 'camera' || scanMode !== 'carte' || !hashes || !catalogue || !cameraReady || !visible) return;
    let stopped = false, timer = 0;
    const stable = new StableDetection();
    let worker: Worker;
    try { worker = new Worker(new URL('../lib/scan.worker.ts', import.meta.url), { type: 'module' }); }
    catch { setLiveError('Scan automatique indisponible. Essayez une photo ou le bas de la carte.'); return; }
    worker.postMessage({ type: 'init', hashes, cards: catalogue.cards });
    worker.onerror = () => { stopped = true; setLiveError('Scan automatique indisponible. Essayez une photo ou le bas de la carte.'); worker.terminate(); };
    let frameSize = { width: 1, height: 1 };
    const tick = () => {
      if (stopped || analysingRef.current) return;
      try {
        const box = boxRef.current, frame = box && grabFrame(1280);
        if (!box || !frame || !box.clientWidth || !box.clientHeight) { timer = window.setTimeout(tick, LIVE_PAUSE_MS); return; }
        frameSize = { width: frame.width, height: frame.height };
        worker.postMessage({ frame, prior: coverToSource(frame.width, frame.height, box.clientWidth, box.clientHeight, cardGuide(box.clientWidth, box.clientHeight)) }, [frame.data.buffer]);
      } catch { setLiveError('Image caméra indisponible. Essayez une photo ou le bas de la carte.'); }
    };
    worker.onmessage = (event: MessageEvent<{ matches: Match[]; quad: Quad | null; error?: string }>) => {
      if (stopped || analysingRef.current) return;
      if (event.data.error) { stopped = true; setLiveError(event.data.error); worker.terminate(); return; }
      const box = boxRef.current;
      if (!box) return;
      const W = box.clientWidth, H = box.clientHeight;
      const { quad, matches: found } = event.data;
      if (quad) {
        const scale = Math.max(W / frameSize.width, H / frameSize.height), ox = (W - frameSize.width * scale) / 2, oy = (H - frameSize.height * scale) / 2;
        setLiveQuad(quad.map((p) => `${(p.x * scale + ox).toFixed(1)},${(p.y * scale + oy).toFixed(1)}`).join(' '));
      } else setLiveQuad(null);
      if (stable.observe(liveCandidate(found))) {
        const full = grabFrame();
        if (full) {
          navigator.vibrate?.(40);
          void analyseCard(full, coverToSource(full.width, full.height, W, H, cardGuide(W, H)));
          return;
        }
      }
      timer = window.setTimeout(tick, LIVE_PAUSE_MS);
    };
    timer = window.setTimeout(tick, LIVE_PAUSE_MS);
    return () => { stopped = true; window.clearTimeout(timer); worker.terminate(); setLiveQuad(null); };
  }, [mode, scanMode, hashes, catalogue, cameraReady, visible, grabFrame, cardGuide, analyseCard, attempt]);

  useEffect(() => {
    if (mode !== 'camera' || scanMode !== 'bande' || !cameraReady || !visible || !idx) return;
    let stopped = false, timer = 0;
    const stable = new StableDetection(2);
    const tick = async () => {
      if (stopped || analysingRef.current) return;
      const v = videoRef.current, box = boxRef.current;
      if (v && box && v.readyState >= 2 && box.clientWidth && box.clientHeight) {
        const W = box.clientWidth, H = box.clientHeight, gw = W * guide.bandWPct, gh = gw / guide.bandRatio;
        const canvas = cropFromCover(v, v.videoWidth, v.videoHeight, W, H, { x: (W - gw) / 2, y: (H - gh) / 2, w: gw, h: gh }, BAND_W, BAND_H);
        try {
          const reading = await readBandText(canvas, nameIndex);
          if (stopped || analysingRef.current) return;
          const knownCode = reading.code && idx.byCode.has(reading.code) ? reading.code : null;
          const exactName = reading.name && reading.name.score <= 0.05 ? reading.name.norm : null;
          if (stable.observe(knownCode ?? (exactName ? `name:${exactName}` : null))) {
            navigator.vibrate?.(40);
            void analyseBand(canvas, reading);
            return;
          }
        } catch {
          if (!stopped) setLiveError('Lecture automatique indisponible. Utilisez une photo ou la recherche manuelle.');
          return;
        }
      }
      if (!stopped) timer = window.setTimeout(tick, 700);
    };
    timer = window.setTimeout(tick, 300);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [mode, scanMode, cameraReady, visible, idx, guide, nameIndex, analyseBand, attempt]);

  const onFile = async (f: File | undefined) => {
    if (!f || (scanMode === 'carte' && !hashes)) return;
    analysingRef.current = true;
    const run = ++runRef.current;
    let bmp: ImageBitmap | undefined;
    try {
      bmp = await createImageBitmap(f);
      if (run !== runRef.current) return;
      if (scanMode === 'bande') await analyseBand(cropWhole(bmp, BAND_W, BAND_H));
      else {
        // Photo importée : recherche des bords plus large qu'avec le cadre-guide.
        const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        await analyseCard(ctx.getImageData(0, 0, c.width, c.height), centeredRect(c.width, c.height, CARD_W / CARD_H, 0.84), 0.2);
      }
    } catch {
      if (run === runRef.current) { analysingRef.current = false; setLiveError('Photo illisible. Choisissez une autre image.'); setAttempt((n) => n + 1); }
    } finally { bmp?.close(); }
  };

  const manualCards = useMemo(() => {
    const code = manual.trim().toUpperCase().replace(/\s+/g, '');
    if (!idx || code.length < 5) return [];
    return [...idx.byCode.entries()].filter(([k]) => k.startsWith(code)).flatMap(([, v]) => v).slice(0, 9);
  }, [manual, idx]);

  const add = async () => {
    if (!selected) return;
    await addQty(selected.id, qty);
    show(`+${qty} ${selected.name} (${selected.code})`);
    retry();
  };

  if (!catalogue) return null;

  const isBand = scanMode === 'bande';

  return (
    <div className="space-y-3">
      <PageHeader title="Scanner" sub="Reconnaissance automatique · aucun déclenchement nécessaire" />

      {mode === 'camera' && (
        <>
          <div className="flex rounded-xl border border-line bg-bg-2 p-1 text-sm">
            <button className={`flex-1 rounded-lg py-2 font-semibold ${isBand ? 'bg-accent text-bg' : 'text-ink-2'}`} onClick={() => chooseScanMode('bande')}>Bas de la carte</button>
            <button className={`flex-1 rounded-lg py-2 font-semibold ${!isBand ? 'bg-accent text-bg' : 'text-ink-2'}`} onClick={() => chooseScanMode('carte')}>Carte entière</button>
          </div>
          <div ref={boxRef} className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted autoPlay onPlaying={() => setCameraReady(true)} className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {isBand
                ? <div className="rounded-xl border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={{ width: `${guide.bandWPct * 100}%`, aspectRatio: `${BAND_W} / ${BAND_H}` }} />
                : <div className="card-aspect rounded-xl border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={{ width: `${guide.wPct * 100}%`, maxHeight: '92%' }} />}
            </div>
            {!isBand && liveQuad && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <polygon points={liveQuad} fill="none" stroke="#4ade80" strokeWidth="3" strokeLinejoin="round" />
              </svg>
            )}
            {camError && <div className="absolute inset-x-3 top-3 rounded-lg bg-bad/80 p-2 text-center text-xs text-white">{camError}</div>}
            <div className="absolute inset-x-0 bottom-2 px-3 text-center text-xs text-white/80">
              {isBand
                ? 'Rapprochez-vous : le nom et le code (en bas à droite) doivent remplir le cadre, bien nets'
                : 'Placez la carte dans le cadre : elle est reconnue toute seule · lumière uniforme · sans reflet'}
            </div>
          </div>
          <div role="status" className="text-center text-sm text-ink-2">
            {liveError ?? (cameraReady ? isBand ? 'Lecture automatique du nom et du code…' : hashes ? 'Recherche de la carte… Maintenez-la dans le cadre.' : 'Préparation de la reconnaissance…' : 'Ouverture de la caméra…')}
          </div>
          {!isBand && (fallback || liveError) && (
            <div className="panel space-y-2" role="status">
              <p className="text-sm">{fallback ? 'Pas de carte reconnue après 20 secondes.' : 'Essayez la lecture du texte.'} Rapprochez le bas de la carte pour lire son nom et son code (ex. OP17-001).</p>
              <button className="btn-primary w-full" onClick={() => chooseScanMode('bande')}>Scanner le bas de la carte</button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={!isBand && !hashes}>Photo</button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button className="btn-ghost flex-1" onClick={capture} disabled={!cameraReady || (!isBand && !hashes)}>Analyser maintenant</button>
            <Link to="/cartes" className="btn-ghost">Manuel</Link>
          </div>
        </>
      )}

      {mode === 'result' && isBand && (
        <>
          {captured && <img src={captured} alt="" className="w-full rounded-lg" style={{ aspectRatio: `${BAND_W} / ${BAND_H}` }} />}
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm">
              <div className="font-semibold">
                {ocrState === 'running' && 'Lecture du code et du nom…'}
                {ocrState === 'failed' && 'OCR indisponible — saisissez le code ci-dessous'}
                {ocrState === 'done' && band && (
                  band.code || band.name
                    ? <>
                        {band.code && <>Code lu : <span className={band.codeKnown ? 'text-accent' : 'text-warn'}>{band.code}</span>{!band.codeKnown && ' (inconnu)'}</>}
                        {band.code && band.name && ' · '}
                        {band.name && <>Nom lu : <span className="text-accent">{band.name}</span></>}
                      </>
                    : 'Ni code ni nom lisibles — rapprochez-vous et évitez les reflets'
                )}
              </div>
              <div className="text-ink-2">
                {band && band.candidates.length > 1 && 'Plusieurs versions : touchez la bonne.'}
                {band && band.candidates.length === 1 && 'Une seule version : vérifiez et ajoutez.'}
                {band && band.candidates.length === 0 && ocrState === 'done' && 'Aucune carte trouvée pour cette lecture.'}
              </div>
            </div>
            <button className="btn-ghost" onClick={retry}>Refaire</button>
          </div>

          {band && band.candidates.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {band.candidates.map((c) => (
                <CandidateTile key={c.id} card={c} on={selected?.id === c.id} onSelect={() => select(c)} price={priceFor(c)} owned={owned.get(c.id)?.qty ?? 0} />
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'result' && !isBand && (
        <>
          <div className="flex items-center gap-3">
            {captured && <img src={captured} alt="" className="card-aspect w-16 rounded-lg" />}
            <div className="flex-1 text-sm">
              <div className="font-semibold">
                {ocrState === 'running' && 'Lecture du code…'}
                {ocrState === 'done' && (
                  ocrCode || ocrName
                    ? <>{ocrCode && <>Code lu : <span className="text-accent">{ocrCode}</span></>}{ocrCode && ocrName && ' · '}{ocrName && <>Nom lu : <span className="text-accent">{ocrName}</span></>}</>
                    : 'Ni code ni nom lus — classement par image'
                )}
                {ocrState === 'failed' && 'OCR indisponible — classement par image'}
              </div>
              <div className="text-ink-2">Touchez la bonne carte pour l'ajouter.</div>
            </div>
            <button className="btn-ghost" onClick={retry}>Refaire</button>
          </div>

          <div className="space-y-2">
            {matches.map((m) => <MatchRow key={m.card.id} m={m} size={hashes?.size} on={selected?.id === m.card.id} onSelect={() => select(m.card)} price={priceFor(m.card)} owned={owned.get(m.card.id)?.qty ?? 0} />)}
          </div>
        </>
      )}

      {mode === 'result' && (
        <div className="panel space-y-2">
          <div className="label">Pas dans la liste ? Saisir le code</div>
          <input className="input" placeholder="ex. OP09-001" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="characters" autoCorrect="off" />
          {manualCards.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {manualCards.map((c) => (
                <CandidateTile key={c.id} card={c} on={selected?.id === c.id} onSelect={() => select(c)} price={priceFor(c)} owned={owned.get(c.id)?.qty ?? 0} />
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="safe-bottom fixed inset-x-0 bottom-16 z-40 mx-auto max-w-3xl px-4">
          <div className="rounded-2xl border border-accent bg-bg-2 p-4 shadow-2xl">
            <div className="flex gap-3">
              <div className="w-16 shrink-0"><CardImage card={selected} eager /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{selected.name}</div>
                <div className="text-xs text-ink-2">{selected.code} · {selected.rarity} · <VariantBadge card={selected} /> · possédée ×{owned.get(selected.id)?.qty ?? 0}</div>
                <div className="text-sm font-semibold">{fmtEur(priceFor(selected))}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="h-11 w-11 rounded-full border border-line bg-bg-3 text-xl font-bold" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <span className="min-w-8 text-center text-xl font-bold">{qty}</span>
              <button className="h-11 w-11 rounded-full border border-line bg-bg-3 text-xl font-bold" onClick={() => setQty((q) => q + 1)}>+</button>
              <button className="btn-primary flex-1 py-3" onClick={add}>Ajouter {qty} à ma collection</button>
              <button className="btn-ghost" onClick={() => select(null)}>✕</button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}

function CandidateTile({ card, on, onSelect, price, owned }: { card: Card; on: boolean; onSelect: () => void; price: number | null; owned: number }) {
  return (
    <button onClick={onSelect} className={`rounded-lg border p-1 text-left text-xs ${on ? 'border-accent bg-accent/10' : 'border-line'}`}>
      <CardImage card={card} />
      <div className="mt-1 truncate font-semibold">{card.name}</div>
      <div className="text-ink-2">{card.code} · {card.rarity} <VariantBadge card={card} /></div>
      <div className="flex items-center justify-between text-ink-2">
        <span>{owned > 0 ? `×${owned}` : ''}</span>
        <span className="font-semibold text-ink">{fmtEur(price, { compact: true })}</span>
      </div>
    </button>
  );
}

function MatchRow({ m, size, on, onSelect, price, owned }: { m: Match; size?: number; on: boolean; onSelect: () => void; price: number | null; owned: number }) {
  const percent = matchPercent(m, size);
  const color = percent >= 80 ? 'bg-ok/20 text-ok' : percent >= 65 ? 'bg-warn/20 text-warn' : 'bg-bg-3 text-ink-2';
  return (
    <button onClick={onSelect} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left ${on ? 'border-accent bg-accent/10' : 'border-line bg-bg-2'}`}>
      <div className="w-14 shrink-0"><CardImage card={m.card} /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{m.card.name}</div>
        <div className="text-xs text-ink-2">{m.card.code} · {m.card.rarity} · <VariantBadge card={m.card} />{owned > 0 && <> · possédée ×{owned}</>}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          <span title="Similarité visuelle avec la carte" className={`rounded-full px-2 py-0.5 font-semibold ${color}`}>Match {percent}%</span>
        </div>
      </div>
      <div className="shrink-0 text-right text-sm font-bold">{fmtEur(price, { compact: true })}</div>
    </button>
  );
}
