// Chapter background media. Each [data-media] element gets a looping muted
// video (or a procedural placeholder when the file is missing). Loads one
// viewport ahead, plays only while on screen, shows its poster until then.
import { env } from './env.js';
import { has, assetUrl, placeholderLabel } from './assets.js';
import { PlaceholderClip } from './placeholder.js';

const loadIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { loadIO.unobserve(e.target); e.target._media.load(); }
}, { rootMargin: '100% 0px' });

const viewIO = new IntersectionObserver((entries) => {
  for (const e of entries) e.target._media.setVisible(e.isIntersecting);
});

class Media {
  constructor(el) {
    this.el = el;
    this.name = el.dataset.media;
    this.kind = el.dataset.kind || 'default';
    this.player = null;
    this.visible = false;
    this.userPaused = false;

    const poster = `img/posters/${this.name}.webp`;
    if (has(poster) && !el.style.backgroundImage) el.style.backgroundImage = `url(${assetUrl(poster)})`;
    this.poster = has(poster) ? assetUrl(poster) : '';

    if (env.moving) {
      loadIO.observe(el);
      viewIO.observe(el);
    } else {
      // Reduced motion / low power: poster only, with an opt-in play button.
      if (!this.poster) this.still();
      this.playButton();
    }
  }

  file() {
    const m = `video/${this.name}-m.mp4`, d = `video/${this.name}.mp4`;
    if (env.mobile && has(m)) return m;
    return has(d) ? d : null;
  }

  still() {
    const clip = new PlaceholderClip(this.kind, env.mobile);
    this.el.insertBefore(clip.canvas, this.el.querySelector('.grade'));
    placeholderLabel(this.el, `video/${this.name}.mp4`);
    this.stillClip = clip;
  }

  load() {
    if (this.player) return;
    const file = this.file();
    if (file) {
      const v = document.createElement('video');
      Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'metadata', disablePictureInPicture: true });
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      if (this.poster) v.poster = this.poster;
      const webm = `video/${this.name}.webm`;
      if ('webm' in this.el.dataset && !env.mobile && has(webm)) {
        v.appendChild(Object.assign(document.createElement('source'), { src: assetUrl(webm), type: 'video/webm' }));
      }
      v.appendChild(Object.assign(document.createElement('source'), { src: assetUrl(file), type: 'video/mp4' }));
      this.el.insertBefore(v, this.el.querySelector('.grade'));
      this.player = v;
      this.drawable = () => (v.readyState >= 2 ? v : null);
    } else {
      this.stillClip?.canvas.remove();
      const clip = new PlaceholderClip(this.kind, env.mobile);
      this.el.insertBefore(clip.canvas, this.el.querySelector('.grade'));
      placeholderLabel(this.el, `video/${this.name}.mp4`);
      this.player = clip;
      this.drawable = () => clip.canvas;
    }
    if (this.visible && !this.userPaused) this.play();
  }

  setVisible(v) {
    this.visible = v;
    if (v && !this.userPaused) this.play();
    else this.pause();
  }

  play() {
    const p = this.player?.play();
    if (p && p.catch) p.catch(() => {});
  }

  pause() { this.player?.pause(); }

  playButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'play-btn media__play';
    btn.setAttribute('aria-pressed', 'false');
    const label = (on) => `<svg aria-hidden="true"><use href="#i-${on ? 'pause' : 'play'}"/></svg>${on ? 'Pause footage' : 'Play footage'}`;
    btn.innerHTML = label(false);
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      btn.innerHTML = label(on);
      if (on) {
        this.load();
        this.userPaused = false;
        this.play();
      } else {
        this.userPaused = true;
        this.pause();
      }
    });
    this.el.appendChild(btn);
  }
}

export function mountMedia(root = document) {
  return [...root.querySelectorAll('[data-media]')].map((el) => (el._media = new Media(el)));
}
