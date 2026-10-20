// Lenis smooth scroll driving GSAP ScrollTrigger. GSAP owns every scroll
// timeline; CSS handles hovers only.
import { env } from './env.js';

export let lenis = null;

export function initMotion() {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  if (!env.motion || !window.Lenis) return;
  lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

export const stopScroll = () => lenis?.stop();
export const startScroll = () => lenis?.start();
