/** Lower case without accents, for searching ("Zürich" matches "zurich"). */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();

/** Whether any of the texts contains every word of the query. An empty query matches everything. */
export function matchesQuery(query: string, ...texts: (string | undefined)[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(texts.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}
