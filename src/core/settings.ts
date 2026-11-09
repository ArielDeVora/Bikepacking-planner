export interface Settings {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

/** Per-user preferences in localStorage, namespaced. Never throws (private mode, quota, etc.). */
export function createSettings(namespace: string): Settings {
  const full = (key: string) => `bp:${namespace}:${key}`;
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = localStorage.getItem(full(key));
        return raw === null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown): void {
      try {
        if (value === undefined) localStorage.removeItem(full(key));
        else localStorage.setItem(full(key), JSON.stringify(value));
      } catch {
        /* storage unavailable: preference just won't persist */
      }
    },
  };
}
