import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useData } from '../data/catalogue';
import { CardImage, PageHeader, Toast, useToast, VariantBadge } from '../components/ui';
import { confidence, cropFromCover, cropWhole, distance, probesOfCanvas, rank, type Match, type Probe } from '../lib/scan';
import { readCardCode, warmUpOcr } from '../lib/ocr';
import { fmtEur } from '../lib/format';
import { addQty } from '../db';
import type { Card, Hashes } from '../types';

type Mode = 'camera' | 'result';

export default function Scan() {
  const { catalogue, idx, owned, priceFor, hashes: loadHashes } = useData();
  const [hashes, setHashes] = useState<Hashes | null>(null);
  const [mode, setMode] = useState<Mode>('camera');
  const [camError, setCamError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [ocrState, setOcrState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [ocrCode, setOcrCode] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);
  const [qty, setQty] = useState(1);
  const [manual, setManual] = useState('');
  const [toast, show] = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const probeRef = useRef<Probe[] | null>(null);

  useEffect(() => { loadHashes().then(setHashes).catch((e) => setCamError(`Empreintes indisponibles : ${e.message}`)); warmUpOcr(); }, [loadHashes]);

  const startCamera = useCallback(async () => {
    if (streamRef.current || !navigator.mediaDevices?.getUserMedia) {
      if (!navigator.mediaDevices?.getUserMedia) setCamError('Caméra non disponible (ouvrir en HTTPS ou utiliser « Photo »).');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
      setCamError(null);
    } catch (e) {
      setCamError(`Accès caméra refusé ou impossible (${(e as Error).name}). Utilisez « Photo ».`);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [startCamera]);

  useEffect(() => {
    // ré-attache le flux quand on revient en mode caméra
    if (mode === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
  }, [mode]);

  const guide = useMemo(() => ({ wPct: 0.76 }), []);

  const analyse = useCallback(async (cardCanvas: HTMLCanvasElement) => {
    if (!hashes || !catalogue) return;
    setCaptured(cardCanvas.toDataURL('image/jpeg', 0.7));
    setSelected(null); setQty(1); setOcrCode(null); setManual('');
    const probes = probesOfCanvas(cardCanvas, hashes.art, hashes.size);
    probeRef.current = probes;
    setMatches(rank(probes, hashes, catalogue.cards, null));
    setMode('result');
    setOcrState('running');
    try {
      const { code } = await readCardCode(cardCanvas);
      setOcrCode(code);
      setOcrState('done');
      if (code && probeRef.current === probes) setMatches(rank(probes, hashes, catalogue.cards, code));
    } catch {
      setOcrState('failed');
    }
  }, [hashes, catalogue]);

  const capture = () => {
    const v = videoRef.current, box = boxRef.current;
    if (!v || !box || !v.videoWidth) return;
    const W = box.clientWidth, H = box.clientHeight;
    const gw = W * guide.wPct, gh = Math.min(gw * 838 / 600, H * 0.92);
    const gwFinal = Math.min(gw, gh * 600 / 838);
    const g = { x: (W - gwFinal) / 2, y: (H - gh) / 2, w: gwFinal, h: gh };
    analyse(cropFromCover(v, v.videoWidth, v.videoHeight, W, H, g));
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const bmp = await createImageBitmap(f);
    analyse(cropWhole(bmp));
    bmp.close();
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
    setSelected(null);
    setMode('camera');
  };

  if (!catalogue) return null;

  return (
    <div className="space-y-3">
      <PageHeader title="Scanner" sub={hashes ? `${Object.keys(hashes.entries).length} empreintes chargées` : 'Chargement des empreintes…'} />

      {mode === 'camera' && (
        <>
          <div ref={boxRef} className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="card-aspect rounded-xl border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={{ width: `${guide.wPct * 100}%`, maxHeight: '92%' }} />
            </div>
            {camError && <div className="absolute inset-x-3 top-3 rounded-lg bg-bad/80 p-2 text-center text-xs text-white">{camError}</div>}
            <div className="absolute inset-x-0 bottom-2 text-center text-xs text-white/80">Alignez la carte dans le cadre · lumière uniforme · sans reflet</div>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Photo</button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button className="btn-primary flex-1 py-4 text-lg" onClick={capture} disabled={!hashes}>◎ Capturer</button>
            <Link to="/cartes" className="btn-ghost">Manuel</Link>
          </div>
        </>
      )}

      {mode === 'result' && (
        <>
          <div className="flex items-center gap-3">
            {captured && <img src={captured} alt="" className="card-aspect w-16 rounded-lg" />}
            <div className="flex-1 text-sm">
              <div className="font-semibold">
                {ocrState === 'running' && 'Lecture du code…'}
                {ocrState === 'done' && (ocrCode ? <>Code lu : <span className="text-accent">{ocrCode}</span></> : 'Code non lu — classement par image')}
                {ocrState === 'failed' && 'OCR indisponible — classement par image'}
              </div>
              <div className="text-ink-2">Touchez la bonne carte pour l'ajouter.</div>
            </div>
            <button className="btn-ghost" onClick={() => setMode('camera')}>Refaire</button>
          </div>

          <div className="space-y-2">
            {matches.map((m) => <MatchRow key={m.card.id} m={m} all={matches} on={selected?.id === m.card.id} onSelect={() => setSelected(m.card)} price={priceFor(m.card)} owned={owned.get(m.card.id)?.qty ?? 0} />)}
          </div>

          <div className="panel space-y-2">
            <div className="label">Pas dans la liste ? Saisir le code</div>
            <input className="input" placeholder="ex. OP09-001" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="characters" autoCorrect="off" />
            {manualCards.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {manualCards.map((c) => (
                  <button key={c.id} onClick={() => setSelected(c)} className={`rounded-lg border p-1 text-left text-xs ${selected?.id === c.id ? 'border-accent' : 'border-line'}`}>
                    <CardImage card={c} />
                    <div className="mt-1 truncate font-semibold">{c.name}</div>
                    <div className="text-ink-2">{c.code} <VariantBadge card={c} /></div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
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
              <button className="btn-ghost" onClick={() => setSelected(null)}>✕</button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}

function MatchRow({ m, all, on, onSelect, price, owned }: { m: Match; all: Match[]; on: boolean; onSelect: () => void; price: number | null; owned: number }) {
  const conf = confidence(m, all);
  const color = conf === 'haute' ? 'bg-ok/20 text-ok' : conf === 'moyenne' ? 'bg-warn/20 text-warn' : 'bg-bg-3 text-ink-2';
  return (
    <button onClick={onSelect} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left ${on ? 'border-accent bg-accent/10' : 'border-line bg-bg-2'}`}>
      <div className="w-14 shrink-0"><CardImage card={m.card} /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{m.card.name}</div>
        <div className="text-xs text-ink-2">{m.card.code} · {m.card.rarity} · <VariantBadge card={m.card} />{owned > 0 && <> · possédée ×{owned}</>}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${color}`}>{conf}{m.codeMatch ? ' · code ✓' : ''}</span>
          <span className="text-ink-2">d={Math.round(distance(m))}</span>
        </div>
      </div>
      <div className="shrink-0 text-right text-sm font-bold">{fmtEur(price, { compact: true })}</div>
    </button>
  );
}
