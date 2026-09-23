import { Link } from 'react-router';
import { useData } from '../data/catalogue';
import { PageHeader } from '../components/ui';
import { fmtDate } from '../lib/format';

const items = [
  { to: '/manquantes', title: 'Cartes manquantes', sub: 'Complétion par série et coût pour compléter' },
  { to: '/doublons', title: 'Doublons à vendre', sub: 'Surplus, valeur et export de la liste' },
  { to: '/cartes?etat=possedees', title: 'Recherche avancée', sub: 'Filtres par couleur, type, rareté, série…' },
  { to: '/reglages', title: 'Réglages & sauvegarde', sub: 'Export / import, données, à propos' },
];

export default function More() {
  const { catalogue, pricesFr } = useData();
  return (
    <div className="space-y-3">
      <PageHeader title="Plus" />
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="panel block">
          <div className="font-bold">{i.title}</div>
          <div className="text-sm text-ink-2">{i.sub}</div>
        </Link>
      ))}
      <p className="pt-4 text-xs text-ink-2">
        Catalogue officiel FR du {fmtDate(catalogue?.generatedAt)} · {catalogue?.cards.length} variantes · Prix CardTrader FR du {fmtDate(pricesFr?.updatedAt)}.
      </p>
    </div>
  );
}
