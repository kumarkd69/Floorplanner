// SplitType wrapper: lines + chars, each line inside an overflow:hidden mask
// so chars can rise from 110%. Not for Kannada (it would break conjuncts).
export function maskSplit(el) {
  if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.trim().replace(/\s+/g, ' '));
  const split = new window.SplitType(el, { types: 'lines, chars', tagName: 'span' });
  for (const line of split.lines) {
    const mask = document.createElement('span');
    mask.className = 'line-mask';
    mask.setAttribute('aria-hidden', 'true');
    line.parentNode.insertBefore(mask, line);
    mask.appendChild(line);
  }
  return {
    lines: split.lines,
    chars: split.chars,
    charsOf: (line) => [...line.querySelectorAll('.char')],
    revert: () => split.revert(),
  };
}
