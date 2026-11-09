import { en, type StringKey } from '../i18n/en';

export type { StringKey };

const strings: Record<StringKey, string> = en;

export function t(key: StringKey, params?: Record<string, string | number>): string {
  const s = strings[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}
