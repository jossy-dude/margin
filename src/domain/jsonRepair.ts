/**
 * Reads a JSON file that may have junk after it. A write that does not truncate the file (Android's SAF
 * provider, 2026-11-15: `.margin/margin.json`) leaves the old file's tail behind the new JSON, so the whole text
 * no longer parses although its start is the complete, newest document. This returns that first complete value
 * and says it was repaired, so the caller can write the file back clean. A file cut short is NOT guessed at:
 * there is no complete value to keep, so it reads as null.
 */
export function parseJsonLenient(text: string): { value: unknown; repaired: boolean } | null {
  try { return { value: JSON.parse(text), repaired: false }; } catch { /* look for the first complete value */ }
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) {
        try { return { value: JSON.parse(text.slice(start, i + 1)), repaired: true }; } catch { return null; }
      }
    }
  }
  return null;
}
