import { useRef, useState } from 'react';
import { useData } from '../data/catalogue';
import { PageHeader, Toast, useToast } from '../components/ui';
import { db, exportBackup, importBackup, type Backup } from '../db';
import { fmtDate } from '../lib/format';

export default function Settings() {
  const { catalogue, prices, history, reload, owned } = useData();
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
    if (!confirm(`Supprimer toute la collection (${owned.size} cartes) ? Cette action est irréversible.`)) return;
    await db.collection.clear();
    await db.overrides.clear();
    show('Collection vidée');
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Réglages" />

      <section className="panel space-y-2">
        <div className="font-bold">Sauvegarde</div>
        <p className="text-sm text-ink-2">La collection est stockée uniquement sur cet appareil. Exportez-la régulièrement (Fichiers / iCloud).</p>
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
        <div className="text-ink-2">Prix Cardmarket : {prices?.count} produits, guide du {fmtDate(prices?.updatedAt)}</div>
        <div className="text-ink-2">Historique serveur : {history?.dates.length ?? 0} relevés hebdomadaires</div>
        <button className="btn-ghost w-full" onClick={reload}>Recharger les données</button>
      </section>

      <section className="panel space-y-2 text-sm">
        <div className="font-bold text-bad">Zone dangereuse</div>
        <button className="btn-danger w-full" onClick={clearAll}>Vider la collection</button>
      </section>

      <section className="panel space-y-1 text-xs text-ink-2">
        <div className="font-bold text-ink">À propos</div>
        <p>Application personnelle, non affiliée à Bandai, Eiichiro Oda / Shueisha ni à Cardmarket. Données cartes et images : site officiel One Piece Card Game (version française). Prix : guide public quotidien de Cardmarket, tous langages confondus — le lien "annonces en français" permet de vérifier le prix réel des cartes VF.</p>
      </section>
      <Toast msg={toast} />
    </div>
  );
}
