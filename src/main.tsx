import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router';
import './index.css';
import { DataProvider } from './data/catalogue';
import Layout from './components/Layout';
import Home from './pages/Home';
import Cards from './pages/Cards';
import CardDetail from './pages/CardDetail';
import Scan from './pages/Scan';
import Collection from './pages/Collection';
import Missing from './pages/Missing';
import Duplicates from './pages/Duplicates';
import More from './pages/More';
import Settings from './pages/Settings';

// Routeur "hash" : fonctionne tel quel sur GitHub Pages et en PWA plein écran (pas de 404 au rechargement).
const router = createHashRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: 'cartes', Component: Cards },
      { path: 'carte/:id', Component: CardDetail },
      { path: 'scanner', Component: Scan },
      { path: 'collection', Component: Collection },
      { path: 'manquantes', Component: Missing },
      { path: 'doublons', Component: Duplicates },
      { path: 'plus', Component: More },
      { path: 'reglages', Component: Settings },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  </StrictMode>,
);
