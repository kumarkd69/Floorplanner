import { useCallback, useEffect, useRef } from 'react';
import { store } from '@/state/store';
import { projectBounds, wallOutline } from '@/core/entities';
import { expandRect } from '@/core/geometry';
import { getTheme } from '@/render/theme';

const W = 180;
const H = 130;

/**
 * Overview map with a draggable viewport rectangle.
 *
 * Only walls and rooms are drawn — at minimap scale furniture is noise, and
 * skipping it keeps this cheap enough to repaint every frame.
 */
export function MiniMap({ canvasSize }: { canvasSize: { width: number; height: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fit = useRef({ scale: 1, x: 0, y: 0 });
  const dragging = useRef(false);

  useEffect(() => {
    let raf = 0;
    let dirty = true;
    const unsub = store.subscribe(() => {
      dirty = true;
    });

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!dirty) return;
      dirty = false;
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const s = store.getState();
      const theme = getTheme(s.ui.theme, s.ui.highContrast);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, W, H);

      const raw =
        projectBounds(s.project) ?? { x: 0, y: 0, w: s.project.width || 10000, h: s.project.height || 10000 };
      // Include the current viewport so the indicator is always on-map.
      const view = {
        x: s.viewport.x,
        y: s.viewport.y,
        w: canvasSize.width / s.viewport.scale,
        h: canvasSize.height / s.viewport.scale,
      };
      const bx = Math.min(raw.x, view.x);
      const by = Math.min(raw.y, view.y);
      const bounds = expandRect(
        {
          x: bx,
          y: by,
          w: Math.max(raw.x + raw.w, view.x + view.w) - bx,
          h: Math.max(raw.y + raw.h, view.y + view.h) - by,
        },
        400,
      );

      const scale = Math.min((W - 12) / Math.max(bounds.w, 1), (H - 12) / Math.max(bounds.h, 1));
      const ox = W / 2 - (bounds.x + bounds.w / 2) * scale;
      const oy = H / 2 - (bounds.y + bounds.h / 2) * scale;
      fit.current = { scale, x: ox, y: oy };

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);

      for (const id of s.project.order) {
        const e = s.project.entities[id];
        if (!e || e.hidden) continue;
        const layer = s.project.layers.find((l) => l.id === e.layerId);
        if (layer && !layer.visible) continue;
        if (e.type === 'room') {
          ctx.fillStyle = e.color;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.moveTo(e.polygon[0].x, e.polygon[0].y);
          for (let i = 1; i < e.polygon.length; i++) ctx.lineTo(e.polygon[i].x, e.polygon[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (e.type === 'wall') {
          const o = wallOutline(e);
          ctx.fillStyle = theme.wallFill;
          ctx.beginPath();
          ctx.moveTo(o[0].x, o[0].y);
          for (let i = 1; i < o.length; i++) ctx.lineTo(o[i].x, o[i].y);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();

      // Viewport indicator.
      ctx.strokeStyle = theme.selection;
      ctx.fillStyle = theme.selectionFill;
      ctx.lineWidth = 1.5;
      const vx = view.x * scale + ox;
      const vy = view.y * scale + oy;
      const vw = view.w * scale;
      const vh = view.h * scale;
      ctx.fillRect(vx, vy, vw, vh);
      ctx.strokeRect(vx, vy, vw, vh);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [canvasSize.width, canvasSize.height]);

  const jump = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = ref.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const { scale, x, y } = fit.current;
      const worldX = (clientX - r.left - x) / scale;
      const worldY = (clientY - r.top - y) / scale;
      const vp = store.getState().viewport;
      store.setViewport({
        x: worldX - canvasSize.width / 2 / vp.scale,
        y: worldY - canvasSize.height / 2 / vp.scale,
      });
    },
    [canvasSize.width, canvasSize.height],
  );

  return (
    <div
      className="minimap"
      role="img"
      aria-label="Plan overview. Click to move the view."
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        jump(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => dragging.current && jump(e.clientX, e.clientY)}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      <canvas ref={ref} style={{ width: W, height: H }} />
    </div>
  );
}
