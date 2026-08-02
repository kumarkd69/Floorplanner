import { useEffect, useRef } from 'react';
import { store } from '@/state/store';
import { formatLength, niceGridStep } from '@/core/units';
import { getTheme } from '@/render/theme';

const RULER = 22;

/**
 * Ruler gutters along the top and left edges.
 *
 * Drawn on their own canvases (rather than as DOM ticks) so they repaint with
 * the same rAF cadence as the plan and never lag behind a pan.
 */
export function Rulers({ size }: { size: { width: number; height: number } }) {
  const hRef = useRef<HTMLCanvasElement>(null);
  const vRef = useRef<HTMLCanvasElement>(null);

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
      const h = hRef.current;
      const v = vRef.current;
      if (!h || !v) return;

      const s = store.getState();
      const theme = getTheme(s.ui.theme, s.ui.highContrast);
      const vp = s.viewport;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const step = niceGridStep(s.project.unit, 64, vp.scale);

      for (const [canvas, horizontal] of [
        [h, true],
        [v, false],
      ] as Array<[HTMLCanvasElement, boolean]>) {
        const cssW = horizontal ? canvas.clientWidth : RULER;
        const cssH = horizontal ? RULER : canvas.clientHeight;
        if (cssW < 1 || cssH < 1) continue;
        if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
          canvas.width = Math.round(cssW * dpr);
          canvas.height = Math.round(cssH * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.strokeStyle = theme.ruler;
        ctx.fillStyle = theme.rulerText;
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.lineWidth = 1;

        const length = horizontal ? cssW : cssH;
        const originWorld = horizontal ? vp.x : vp.y;
        const start = Math.floor(originWorld / step) * step;
        const end = originWorld + length / vp.scale;

        ctx.beginPath();
        for (let w = start; w <= end; w += step) {
          const p = Math.round((w - originWorld) * vp.scale) + 0.5;
          if (p < 0 || p > length) continue;
          if (horizontal) {
            ctx.moveTo(p, RULER - 7);
            ctx.lineTo(p, RULER);
          } else {
            ctx.moveTo(RULER - 7, p);
            ctx.lineTo(RULER, p);
          }
          // Minor ticks between labelled divisions.
          for (let k = 1; k < 5; k++) {
            const mp = Math.round((w + (step * k) / 5 - originWorld) * vp.scale) + 0.5;
            if (mp < 0 || mp > length) continue;
            if (horizontal) {
              ctx.moveTo(mp, RULER - 4);
              ctx.lineTo(mp, RULER);
            } else {
              ctx.moveTo(RULER - 4, mp);
              ctx.lineTo(RULER, mp);
            }
          }
        }
        ctx.stroke();

        for (let w = start; w <= end; w += step) {
          const p = (w - originWorld) * vp.scale;
          if (p < 12 || p > length - 4) continue;
          const text = formatLength(w, s.project.unit, { compact: true });
          if (horizontal) {
            ctx.textAlign = 'left';
            ctx.fillText(text, p + 3, 10);
          } else {
            ctx.save();
            ctx.translate(11, p - 3);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'right';
            ctx.fillText(text, 0, 0);
            ctx.restore();
          }
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [size.width, size.height]);

  return (
    <>
      <div className="ruler ruler--corner" aria-hidden="true" />
      <div className="ruler ruler--h">
        <canvas ref={hRef} style={{ width: '100%', height: RULER, display: 'block' }} />
      </div>
      <div className="ruler ruler--v">
        <canvas ref={vRef} style={{ width: RULER, height: '100%', display: 'block' }} />
      </div>
    </>
  );
}
