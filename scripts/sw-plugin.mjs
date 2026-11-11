// Vite plugin: writes sw.js (from scripts/sw-template.js) into the build, with the build id and the
// list of the app's own files to keep for offline use.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Files of public/ to keep with the app (the big climate and data files are kept once used). */
function publicFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'climate' && name !== 'data') walk(p);
      } else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  try {
    walk(dir);
  } catch {
    /* no public folder */
  }
  return out;
}

export function serviceWorker(build) {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'version.json');
      const precache = ['./', ...[...files, ...publicFiles('public')].map((f) => `./${f}`)];
      const source = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')
        .replace('__BUILD__', build)
        .replace('__PRECACHE__', JSON.stringify([...new Set(precache)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
