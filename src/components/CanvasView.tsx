import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { render } from '@/render/renderer';
import { store } from '@/state/store';
import { useElementSize } from '@/hooks/useElementSize';
import { useCanvasInteraction, type InteractionApi } from '@/hooks/useCanvasInteraction';
import { useViewportControls } from '@/hooks/useViewportControls';
import { Rulers } from './Rulers';

export interface CanvasHandle {
  api: InteractionApi;
  size: { width: number; height: number };
  controls: ReturnType<typeof useViewportControls>;
}

/**
 * The canvas host.
 *
 * Rendering is driven by a rAF loop with a dirty flag rather than by React
 * re-renders: pointer gestures mutate the store many times per frame, and
 * repainting once per animation frame — regardless of how many mutations
 * landed — is what keeps interaction at 60 FPS with thousands of objects.
 */
export function CanvasView({ onReady }: { onReady: (h: CanvasHandle) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const size = useElementSize(host);
  const dirty = useRef(true);
  const [dropActive, setDropActive] = useState(false);
  const [showRulers, setShowRulers] = useState(true);

  const api = useCanvasInteraction(canvas);
  const controls = useViewportControls(canvas, size);

  // Mark dirty on any store change; the loop below decides when to paint.
  useEffect(() => store.subscribe(() => {
    dirty.current = true;
  }), []);

  // The overlay lives in React state, so a change there must repaint too.
  useEffect(() => {
    dirty.current = true;
  }, [api.overlay]);

  useEffect(() => {
    const unsub = store.subscribe(() => setShowRulers(store.getState().ui.showRulers));
    setShowRulers(store.getState().ui.showRulers);
    return unsub;
  }, []);

  const handle = useMemo(() => ({ api, size, controls }), [api, size, controls]);
  useLayoutEffect(() => {
    onReady(handle);
  }, [handle, onReady]);

  // Resize the backing store to the device pixel ratio.
  useLayoutEffect(() => {
    if (!canvas || size.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.round(size.width * dpr);
    const h = Math.round(size.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      dirty.current = true;
    }
  }, [canvas, size]);

  // Fit the plan the first time we know our size.
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current || size.width < 10) return;
    didFit.current = true;
    controls.zoomToFit();
  }, [size.width, controls]);

  useEffect(() => {
    if (!canvas) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dirty.current) return;
      dirty.current = false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const s = store.getState();
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      render({
        ctx,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        dpr,
        project: s.project,
        ui: s.ui,
        viewport: s.viewport,
        overlay: api.overlay,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvas, api.overlay]);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      {showRulers && <Rulers size={size} />}
      <div
        ref={setHost}
        className={`canvas-wrap ${showRulers ? 'canvas-wrap--rulers' : ''} ${dropActive ? 'canvas-wrap--drop' : ''}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('application/x-catalog-item')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropActive(false);
          const id = e.dataTransfer.getData('application/x-catalog-item');
          if (!id || !canvas) return;
          const r = canvas.getBoundingClientRect();
          api.dropFurniture(id, { x: e.clientX - r.left, y: e.clientY - r.top });
        }}
      >
        <canvas
          ref={setCanvas}
          className="canvas"
          style={{ cursor: api.cursor }}
          tabIndex={0}
          role="application"
          aria-label="Floor plan drawing canvas. Use the toolbar to pick a tool; arrow keys nudge the selection."
          onPointerDown={api.onPointerDown}
          onPointerMove={api.onPointerMove}
          onPointerUp={api.onPointerUp}
          onPointerCancel={api.onPointerUp}
          onDoubleClick={api.onDoubleClick}
          onContextMenu={api.onContextMenu}
        />
      </div>
    </div>
  );
}
