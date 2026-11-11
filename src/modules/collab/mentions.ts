/** @mentions in comments: "@Name" in the text, and the ids of the people mentioned. */

export interface Person {
  id: string;
  name: string;
}

/** The "@…" being typed just before the caret, if any: where it starts and what's typed after @. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|\s)@([^\s@]*)$/u);
  if (!m) return null;
  return { start: caret - m[2]!.length - 1, query: m[2]! };
}

/** People whose name starts with (or has a word starting with) the query, best matches first. */
export function suggest(people: Person[], query: string, max = 6): Person[] {
  const q = query.toLocaleLowerCase();
  const score = (p: Person) => {
    const name = p.name.toLocaleLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    return name.includes(q) ? 2 : 3;
  };
  return people
    .filter((p) => p.name && score(p) < 3)
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
    .slice(0, max);
}

/** The text with the "@…" being typed replaced by "@Name ", and where the caret goes next. */
export function insertMention(text: string, at: { start: number; query: string }, person: Person): { text: string; caret: number } {
  const end = at.start + 1 + at.query.length;
  const inserted = `@${person.name} `;
  return { text: text.slice(0, at.start) + inserted + text.slice(end), caret: at.start + inserted.length };
}

/** Everyone whose "@Name" is in the text (longest names first, so "@Ann Marie" isn't taken for "@Ann"). */
export function findMentions(text: string, people: Person[]): string[] {
  const lower = text.toLocaleLowerCase();
  const found: string[] = [];
  let rest = lower;
  for (const p of [...people].filter((p) => p.name).sort((a, b) => b.name.length - a.name.length)) {
    const tag = `@${p.name.toLocaleLowerCase()}`;
    const i = rest.indexOf(tag);
    if (i < 0) continue;
    const after = rest[i + tag.length];
    if (after && /[\p{L}\p{N}]/u.test(after)) continue;
    found.push(p.id);
    rest = rest.slice(0, i) + ' '.repeat(tag.length) + rest.slice(i + tag.length);
  }
  return found;
}

/** The text in pieces, with mentions of these people marked, for display. */
export function splitMentions(text: string, people: Person[]): { text: string; person?: Person }[] {
  const names = [...people].filter((p) => p.name).sort((a, b) => b.name.length - a.name.length);
  const out: { text: string; person?: Person }[] = [];
  let i = 0;
  let plain = '';
  while (i < text.length) {
    const p = text[i] === '@' ? names.find((n) => text.slice(i + 1, i + 1 + n.name.length).toLocaleLowerCase() === n.name.toLocaleLowerCase()) : undefined;
    if (p) {
      if (plain) out.push({ text: plain });
      plain = '';
      out.push({ text: text.slice(i, i + 1 + p.name.length), person: p });
      i += 1 + p.name.length;
    } else plain += text[i++];
  }
  if (plain) out.push({ text: plain });
  return out;
}
