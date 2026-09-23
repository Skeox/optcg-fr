import { NavLink, Outlet } from 'react-router';
import { useData } from '../data/catalogue';
import BackupStatus from './BackupStatus';

const tabs = [
  { to: '/', label: 'Accueil', icon: '⌂' },
  { to: '/cartes', label: 'Cartes', icon: '▦' },
  { to: '/scanner', label: 'Scanner', icon: '◎' },
  { to: '/collection', label: 'Collection', icon: '★' },
  { to: '/plus', label: 'Plus', icon: '⋯' },
];

export default function Layout() {
  const { loading, error, reload } = useData();
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <main className="safe-top flex-1 px-4 pb-28 pt-3">
        <BackupStatus />
        {error ? (
          <div className="panel mt-10 text-center">
            <p className="font-semibold text-bad">Impossible de charger les données</p>
            <p className="mt-1 text-sm text-ink-2">{error}</p>
            <button className="btn-primary mt-4" onClick={reload}>Réessayer</button>
          </div>
        ) : loading ? (
          <div className="flex h-[60dvh] flex-col items-center justify-center gap-3 text-ink-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
            Chargement du catalogue…
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-accent' : 'text-ink-2'}`}
            >
              <span className={`text-xl leading-none ${t.to === '/scanner' ? 'rounded-full bg-accent px-3 py-1 text-bg' : ''}`}>{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
