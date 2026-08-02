import { useEffect, useMemo, useRef, useState } from 'react';
import type { FurnitureCategory } from '@/types';
import { CATALOG, CATEGORIES, searchCatalog, type CatalogItem } from '@/data/catalog';
import { formatLength } from '@/core/units';
import { store, useStoreState } from '@/hooks/useStore';
import { IconSearch } from './Icons';

/** Draw a catalog symbol into a small preview canvas, fit to the tile. */
function Thumb({ item }: { item: CatalogItem }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 56;
    const h = 44;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Fit the symbol's real dimensions into the tile with a small margin.
    const scale = Math.min((w - 8) / item.width, (h - 8) / item.depth);
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.lineWidth = 1.2 / scale;
    ctx.fillStyle = 'rgba(148,163,184,0.18)';
    ctx.strokeStyle = '#475569';
    ctx.lineJoin = 'round';
    try {
      item.draw(ctx, item.width, item.depth);
    } catch {
      // A symbol that fails to draw should not blank the whole library.
      ctx.strokeRect(-item.width / 2, -item.depth / 2, item.width, item.depth);
    }
  }, [item]);

  return <canvas ref={ref} style={{ width: 56, height: 44 }} aria-hidden="true" />;
}

export function FurnitureLibrary() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FurnitureCategory | 'all'>('all');
  const activeId = useStoreState((s) => s.ui.activeCatalogId);
  const unit = useStoreState((s) => s.project.unit);

  const items = useMemo(() => {
    const base = query ? searchCatalog(query) : CATALOG;
    return category === 'all' ? base : base.filter((c) => c.category === category);
  }, [query, category]);

  return (
    <>
      <div className="search">
        <IconSearch size={14} />
        <input
          className="input"
          placeholder="Search furniture…"
          value={query}
          aria-label="Search the furniture library"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

      <div className="chips" role="group" aria-label="Furniture categories">
        <button
          type="button"
          className={`chip ${category === 'all' ? 'chip--active' : ''}`}
          onClick={() => setCategory('all')}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${category === c.id ? 'chip--active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="panel__empty">
          Nothing matches “{query}”.
          <br />
          Try a category instead.
        </p>
      ) : (
        <div className="library">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`libitem ${activeId === item.id ? 'libitem--active' : ''}`}
              draggable
              aria-label={`${item.name}. Click to arm the furniture tool, or drag onto the plan.`}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-catalog-item', item.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => {
                // Clicking arms the tool so the next canvas click places it —
                // handy on touch devices where dragging is awkward.
                store.setUI({ activeCatalogId: item.id, activePresetId: null, tool: 'furniture' });
              }}
            >
              <Thumb item={item} />
              <span className="libitem__name">{item.name}</span>
              <span className="libitem__size">
                {formatLength(item.width, unit, { compact: true })} ×{' '}
                {formatLength(item.depth, unit, { compact: true })}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
