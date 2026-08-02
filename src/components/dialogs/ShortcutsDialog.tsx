import { SHORTCUTS } from '@/hooks/useKeyboard';
import { Button, Dialog } from '../ui';

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="Keyboard shortcuts"
      subtitle="Every tool and edit is one keystroke away."
      wide
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="grid2" style={{ gap: 24, alignItems: 'start' }}>
        {SHORTCUTS.map((group) => (
          <div key={group.group}>
            <h3 className="panel__title">{group.group}</h3>
            {group.items.map(([keys, label]) => (
              <div
                key={keys}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '3px 0',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="kbd">{keys}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <h3 className="panel__title" style={{ marginTop: 24 }}>
        Canvas gestures
      </h3>
      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)', lineHeight: 1.9 }}>
        <li>Drag a marquee right-to-left to select everything it touches; left-to-right selects only what fits entirely inside.</li>
        <li>Double-click a wall to split it at that point, or a room to rename it.</li>
        <li>While drawing a wall, keep clicking to chain segments — double-click or <span className="kbd">Esc</span> ends the run.</li>
        <li>Drag a door or window along its wall; it can never slide off the end or overlap another opening.</li>
        <li>Hold <span className="kbd">⇧</span> while resizing to scale freely instead of preserving the aspect ratio.</li>
        <li>Pinch or <span className="kbd">⌘</span>-scroll to zoom; two-finger drag to pan.</li>
      </ul>
    </Dialog>
  );
}
