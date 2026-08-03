import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { store } from './state/store';
import * as exporters from './export';
import * as renderer from './render/renderer';
import { projectBounds } from './core/entities';
import { CATALOG_BY_ID } from './data/catalog';
import * as roomBox from './core/roomBox';
import { toSVG } from './export/svg';
import { toDXF } from './export/dxf';
import './styles/global.css';

/**
 * Debug surface.
 *
 * The store and the exporters are attached to `window` so the plan can be
 * inspected, scripted, or exported from the console and from end-to-end tests.
 * It is a read/write handle to the same singleton the UI uses — nothing is
 * duplicated, so it can never drift from what is on screen.
 */
declare global {
  interface Window {
    __fpStore: typeof store;
    __fpExport: typeof exporters & { toSVG: typeof toSVG; toDXF: typeof toDXF };
    __fpRender: typeof renderer & { projectBounds: typeof projectBounds };
    __fpCatalog: typeof CATALOG_BY_ID;
    __fpRoom: typeof roomBox;
  }
}
window.__fpStore = store;
window.__fpExport = { ...exporters, toSVG, toDXF };
window.__fpRender = { ...renderer, projectBounds };
window.__fpCatalog = CATALOG_BY_ID;
window.__fpRoom = roomBox;

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
