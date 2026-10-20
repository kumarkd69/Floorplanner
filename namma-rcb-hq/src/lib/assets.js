// Asset lookup + graded placeholder generation.
// `virtual:assets` is the list of files actually present in /public/assets,
// so we never request a file that is not there.
import manifest from 'virtual:assets';

export const has = (path) => manifest.has(path);
export const assetUrl = (path) => `${import.meta.env.BASE_URL}assets/${path}`;

export function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let noise;
/** A 128px tile of film grain, generated once. */
export function noiseTile() {
  if (noise) return noise;
  noise = document.createElement('canvas');
  noise.width = noise.height = 128;
  const ctx = noise.getContext('2d');
  const data = ctx.createImageData(128, 128);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 26;
  }
  ctx.putImageData(data, 0, 0);
  return noise;
}

/** Small mono tag naming the file a placeholder stands in for. */
export function placeholderLabel(host, file) {
  if (host.querySelector(':scope > .ph-label')) return;
  const tag = document.createElement('span');
  tag.className = 'ph-label';
  tag.setAttribute('aria-hidden', 'true');
  tag.textContent = `placeholder — ${file}`;
  host.appendChild(tag);
}
