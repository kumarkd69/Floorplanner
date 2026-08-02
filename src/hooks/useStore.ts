import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { AppState } from '@/state/store';
import { store } from '@/state/store';

/** Shallow equality for plain objects; falls back to `Object.is` for anything else. */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/**
 * Subscribe to a slice of the store.
 *
 * `useSyncExternalStore` requires `getSnapshot` to return a cached value —
 * returning a fresh object each call makes React re-render forever. Selectors
 * here are usually written inline (`(s) => ({ a, b })`), so the result is
 * memoised against the last state and compared shallowly: derived objects stay
 * referentially stable until their contents actually change.
 */
export function useStoreState<T>(
  selector: (s: AppState) => T,
  isEqual: (a: T, b: T) => boolean = shallowEqual,
): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalRef = useRef(isEqual);
  equalRef.current = isEqual;
  const cache = useRef<{ state: AppState; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const cached = cache.current;
    // The store replaces its state object on every change, so identity is a
    // sound "nothing happened" test.
    if (cached && cached.state === state) return cached.value;

    const value = selectorRef.current(state);
    if (cached && equalRef.current(cached.value, value)) {
      cache.current = { state, value: cached.value };
      return cached.value;
    }
    cache.current = { state, value };
    return value;
  }, []);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export const useProject = () => useStoreState((s) => s.project);
export const useUI = () => useStoreState((s) => s.ui);
export const useViewport = () => useStoreState((s) => s.viewport);
export const useSelection = () => useStoreState((s) => s.ui.selection);
export const useHistory = () =>
  useStoreState((s) => ({ entries: s.history, index: s.historyIndex }));

export { store };
