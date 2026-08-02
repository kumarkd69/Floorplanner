import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Vec2, Viewport } from '@/types';
import type { Rect } from '@/core/geometry';
import { projectBounds, selectionBounds } from '@/core/entities';
import { screenToWorld } from '@/render/renderer';
import { store } from '@/state/store';

export const MIN_SCALE = 0.002; // ~ zoomed way out on a 200×200 ft site
export const MAX_SCALE = 2; // 1 mm ≈ 2 px

export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

/** Zoom about a fixed screen point so the world point under it stays put. */
export function zoomAt(vp: Viewport, screenPoint: Vec2, factor: number): Viewport {
  const scale = clampScale(vp.scale * factor);
  if (scale === vp.scale) return vp;
  const before = screenToWorld(screenPoint, vp);
  const after = screenToWorld(screenPoint, { ...vp, scale });
  return { x: vp.x + (before.x - after.x), y: vp.y + (before.y - after.y), scale };
}

export function fitRect(rect: Rect, width: number, height: number, padding = 80): Viewport {
  const w = Math.max(rect.w, 1);
  const h = Math.max(rect.h, 1);
  const scale = clampScale(Math.min((width - padding * 2) / w, (height - padding * 2) / h));
  return {
    scale,
    x: rect.x + rect.w / 2 - width / 2 / scale,
    y: rect.y + rect.h / 2 - height / 2 / scale,
  };
}

/**
 * Wheel zoom, trackpad pan, and pinch zoom for the canvas element.
 *
 * Wheel handling is attached natively (not via React) because React attaches
 * wheel listeners passively, which would make `preventDefault` a no-op and let
 * the page scroll behind the canvas.
 */
export function useViewportControls(
  el: HTMLElement | null,
  size: { width: number; height: number },
) {
  const pinch = useRef<{ dist: number; center: Vec2 } | null>(null);

  useEffect(() => {
    if (!el) return;

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const point = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      const vp = store.getState().viewport;

      // ctrl/⌘+wheel is the pinch gesture browsers synthesise on trackpads.
      if (ev.ctrlKey || ev.metaKey) {
        store.setViewport(zoomAt(vp, point, Math.exp(-ev.deltaY * 0.01)));
        return;
      }
      if (ev.shiftKey) {
        store.setViewport({ x: vp.x + ev.deltaY / vp.scale });
        return;
      }
      // A mouse wheel reports large discrete deltas; treat those as zoom and
      // small continuous ones as two-finger panning.
      if (ev.deltaMode !== 0 || Math.abs(ev.deltaY) > 48) {
        store.setViewport(zoomAt(vp, point, ev.deltaY < 0 ? 1.12 : 1 / 1.12));
      } else {
        store.setViewport({ x: vp.x + ev.deltaX / vp.scale, y: vp.y + ev.deltaY / vp.scale });
      }
    };

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 2) return;
      const rect = el.getBoundingClientRect();
      const [a, b] = [ev.touches[0], ev.touches[1]];
      pinch.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        center: {
          x: (a.clientX + b.clientX) / 2 - rect.left,
          y: (a.clientY + b.clientY) / 2 - rect.top,
        },
      };
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 2 || !pinch.current) return;
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const [a, b] = [ev.touches[0], ev.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const center = {
        x: (a.clientX + b.clientX) / 2 - rect.left,
        y: (a.clientY + b.clientY) / 2 - rect.top,
      };
      const vp = store.getState().viewport;
      let next = zoomAt(vp, center, d / pinch.current.dist);
      // Two-finger drag pans at the same time as pinching.
      const dx = center.x - pinch.current.center.x;
      const dy = center.y - pinch.current.center.y;
      next = { ...next, x: next.x - dx / next.scale, y: next.y - dy / next.scale };
      store.setViewport(next);
      pinch.current = { dist: d, center };
    };

    const onTouchEnd = () => {
      pinch.current = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [el]);

  const zoomBy = useCallback(
    (factor: number) => {
      const vp = store.getState().viewport;
      store.setViewport(zoomAt(vp, { x: size.width / 2, y: size.height / 2 }, factor));
    },
    [size.width, size.height],
  );

  const zoomToFit = useCallback(() => {
    const p = store.getState().project;
    const b = projectBounds(p) ?? { x: 0, y: 0, w: p.width || 10000, h: p.height || 10000 };
    store.setViewport(fitRect(b, size.width, size.height));
  }, [size.width, size.height]);

  const zoomToSelection = useCallback(() => {
    const s = store.getState();
    const b = selectionBounds(s.project, s.ui.selection);
    if (!b) {
      zoomToFit();
      return;
    }
    store.setViewport(fitRect(b, size.width, size.height, 120));
  }, [size.width, size.height, zoomToFit]);

  const zoomTo100 = useCallback(() => {
    const vp = store.getState().viewport;
    store.setViewport(zoomAt(vp, { x: size.width / 2, y: size.height / 2 }, 0.2 / vp.scale));
  }, [size.width, size.height]);

  return useMemo(
    () => ({ zoomBy, zoomToFit, zoomToSelection, zoomTo100 }),
    [zoomBy, zoomToFit, zoomToSelection, zoomTo100],
  );
}
