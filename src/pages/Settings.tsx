import { useRef, useState } from 'react';
import { useData } from '../data/catalogue';
import { PageHeader, Toast, useToast } from '../components/ui';
import { clearCollection, exportBackup, importBackup, type Backup } from '../db';
import BackupSettings from '../components/BackupSettings';
import { fmtDate } from '../lib/format';

export default function Settings() {
  const { catalogue, prices, history, pricesFr, manualFr, reload, owned } = useData();
  const [toast, show] = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');

  const doExport = async () => {
    const b = await exportBackup();
    const blob = new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `optcg-fr-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    show('Sauvegarde exportée');
  };

  const doImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b = JSON.parse(await f.text()) as Backup;
      await importBackup(b, mode);
      show(`Importé : ${b.collection?.length ?? 0} cartes`);
    } catch (e) {
      show(`Échec : ${(e as Error).message}`);
    }
  };

  const clearAll = async () => {
    if (!confirm(`Supprimer toute la collection (${owned.size} cartes) ? Si la sauvegarde externe est connectée, cette suppression y sera aussi synchronisée.`)) return;
    await clearCollection();
    show('Collection vidée');
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Réglages" />
      <BackupSettings />

      <section className="panel space-y-2">
        <div className="font-bold">Copie manuelle supplémentaire</div>
        <p className="text-sm text-ink-2">Exportez aussi votre collection en JSON pour conserver une copie indépendante de la synchronisation.</p>
        <button className="btn-primary w-full" onClick={doExport}>Exporter la sauvegarde (JSON)</button>
        <div className="flex items-center gap-2 text-sm">
          <select className="chip" value={mode} onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}>
            <option value="merge">Fusionner avec l'existant</option>
            <option value="replace">Remplacer tout</option>
          </select>
          <button className="btn-ghost flex-1" onClick={() => file.current?.click()}>Importer…</button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => doImport(e.target.files?.[0])} />
        </div>
      </section>

      <section className="panel space-y-2 text-sm">
        <div className="font-bold">Données</div>
        <div className="text-ink-2">Catalogue FR : {catalogue?.cards.length} variantes, généré le {fmtDate(catalogue?.generatedAt)}</div>
        <div className="text-ink-2">Catalogue Cardmarket : {prices?.count} produits, guide du {fmtDate(prices?.updatedAt)} (prix toutes langues exclus des estimations)</div>
        <div className="text-ink-2">Archive toutes langues : {history?.dates.length ?? 0} relevés hebdomadaires, non utilisée dans les courbes VF</div>
        <div className="text-ink-2">Prix VF saisis à la main : {manualFr.size}{pricesFr ? ` · relevé CardTrader (indicatif) :${Object.keys(pricesFr.products).length} produits (${fmtDate(pricesFr.updatedAt)})` : ''}</div>
        <button className="btn-ghost w-full" onClick={reload}>Recharger les données</button>
      </section>

      <section className="panel space-y-2 text-sm">
        <div className="font-bold text-bad">Zone dangereuse</div>
        <button className="btn-danger w-full" onClick={clearAll}>Vider la collection</button>
      </section>

      <section className="panel space-y-1 text-xs text-ink-2">
        <div className="font-bold text-ink">À propos</div>
        <p>Application personnelle, non affiliée à Bandai, Eiichiro Oda / Shueisha ni à Cardmarket. Données cartes et images : site officiel One Piece Card Game (version française). Prix : minimum des annonces Cardmarket françaises, hors frais de port, relevé et saisi dans la fiche. La récupération automatique VF n'est pas disponible. Sans relevé, le prix reste indisponible ; ni le guide toutes langues ni CardTrader ne remplacent un prix VF.</p>
      </section>
      <Toast msg={toast} />
    </div>
  );
}
