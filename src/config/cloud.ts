/** Supabase project for shared trips. Empty values disable sharing; set them in `.env`. */
export const CLOUD = {
  url: (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  key: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim(),
};

export const cloudConfigured = !!(CLOUD.url && CLOUD.key);
