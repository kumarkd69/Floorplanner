let counter = 0;

/**
 * Short, sortable, collision-resistant ids. Not cryptographic — they only need
 * to be unique within a document, and short ids keep exported JSON readable.
 */
export function uid(prefix = 'e'): string {
  counter = (counter + 1) % 0xffff;
  const time = Date.now().toString(36).slice(-6);
  const rand = Math.floor(Math.random() * 0xffff).toString(36);
  return `${prefix}_${time}${counter.toString(36)}${rand}`;
}
