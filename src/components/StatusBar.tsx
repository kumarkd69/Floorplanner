import type { Vec2 } from '@/types';
import { store, useStoreState } from '@/hooks/useStore';
import { formatLength } from '@/core/units';
import { selectionBounds } from '@/core/entities';
import { scaleDenominator } from '@/export';

export function StatusBar({
  readout,
}: {
  readout: { world: Vec2 | null; hint: string | null };
}) {
  const project = useStoreState((s) => s.project);
  const ui = useStoreState((s) => s.ui);
  const viewport = useStoreState((s) => s.viewport);

  const bounds = ui.selection.length > 0 ? selectionBounds(project, ui.selection) : null;

  return (
    <footer className="status" role="status" aria-live="polite">
      <span className="status__item">
        {readout.world
          ? `X ${formatLength(readout.world.x, project.unit, { compact: true })}   Y ${formatLength(
              readout.world.y,
              project.unit,
              { compact: true },
            )}`
          : 'Move the pointer over the canvas'}
      </span>

      {readout.hint && (
        <span className="status__item" style={{ color: 'var(--accent)', fontWeight: 550 }}>
          {readout.hint}
        </span>
      )}

      {bounds && (
        <span className="status__item">
          {formatLength(bounds.w, project.unit, { compact: true })} ×{' '}
          {formatLength(bounds.h, project.unit, { compact: true })}
        </span>
      )}

      <span className="status__item">
        {ui.selection.length > 0 ? `${ui.selection.length} selected` : `${project.order.length} objects`}
      </span>

      <span className="status__spacer" />

      <button
        type="button"
        className={`status__toggle ${ui.snap.enabled ? 'status__toggle--on' : ''}`}
        onClick={() => store.setUI({ snap: { ...ui.snap, enabled: !ui.snap.enabled } })}
      >
        Snap {ui.snap.enabled ? 'on' : 'off'} · K
      </button>
      <button
        type="button"
        className={`status__toggle ${ui.showGrid ? 'status__toggle--on' : ''}`}
        onClick={() => store.setUI({ showGrid: !ui.showGrid })}
      >
        Grid · G
      </button>
      <button
        type="button"
        className={`status__toggle ${ui.showDimensions ? 'status__toggle--on' : ''}`}
        onClick={() => store.setUI({ showDimensions: !ui.showDimensions })}
      >
        Dimensions
      </button>
      <button
        type="button"
        className={`status__toggle ${ui.showRulers ? 'status__toggle--on' : ''}`}
        onClick={() => store.setUI({ showRulers: !ui.showRulers })}
      >
        Rulers
      </button>

      <span className="status__item">
        Grid {formatLength(project.gridSize, project.unit, { compact: true })}
      </span>
      <span className="status__item">1:{Math.round(scaleDenominator(viewport.scale))}</span>
    </footer>
  );
}
