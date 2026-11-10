// Downloads the TerraClimate 1991–2020 monthly averages (Climatology Lab, UC Merced; public
// domain, CC0) of daily highs, daily lows and precipitation, at 1/4° (every 6th cell of the
// 1/24° grid), into public/climate/. Run once (`npm run climate`): the averages never change, and
// the files are committed, so the site never calls the data server.
//
// Each file holds one variable for one month: 1440 × 720 bytes (west to east from 180°W, north to
// south from 90°N), one byte per cell, 0 where there is no data (sea). Rows are delta-coded
// (each byte minus the one before it, mod 256), then deflated. Decoding is in
// src/modules/climate/codec.ts.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const BASE = 'http://thredds.northwestknowledge.net:8080/thredds/dodsC/TERRACLIMATE_ALL/climatology';
const OUT = new URL('../public/climate/', import.meta.url);
const STRIDE = 6;
const WIDTH = 8640 / STRIDE;
const HEIGHT = 4320 / STRIDE;
const PAUSE_MS = 1500;

/** Physical value to byte (1–255). */
const ENCODE = {
  tmax: (c) => 1 + Math.round((c + 60) * 2),
  tmin: (c) => 1 + Math.round((c + 60) * 2),
  ppt: (mm) => 1 + Math.round(Math.sqrt(Math.max(0, mm)) * 5.5),
};
/** File value to physical value (from the dataset's scale_factor and add_offset). */
const SCALE = {
  tmax: { scale: 0.1, offset: -73, fill: -32768 },
  tmin: { scale: 0.1, offset: -73, fill: -32768 },
  ppt: { scale: 0.1, offset: 0, fill: -2147483648 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchMonth(variable, month) {
  const sel = `${variable}[${month}:1:${month}][0:${STRIDE}:4319][0:${STRIDE}:8639]`;
  const url = `${BASE}/TerraClimate_19912020_${variable}.nc.ascii?${encodeURIComponent(sel)}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'bikepacking-planner climate script (one-time download)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 4) throw err;
      console.warn(`  retry ${variable} ${month + 1} (${err.message})`);
      await sleep(5000 * attempt);
    }
  }
}

/** Parses the OPeNDAP ASCII grid ("[0][row], v, v, …" lines) into bytes. */
function parse(text, variable) {
  const { scale, offset, fill } = SCALE[variable];
  const out = new Uint8Array(WIDTH * HEIGHT);
  const start = text.indexOf('\n', text.indexOf(`${variable}.${variable}[`));
  let rows = 0;
  for (const line of text.slice(start + 1).split('\n')) {
    const m = /^\[0\]\[(\d+)\], (.*)$/.exec(line);
    if (!m) {
      if (rows) break;
      continue;
    }
    const row = Number(m[1]);
    const values = m[2].split(', ');
    for (let x = 0; x < values.length && x < WIDTH; x++) {
      const raw = Number(values[x]);
      if (raw === fill || Number.isNaN(raw)) continue;
      out[row * WIDTH + x] = Math.min(255, Math.max(1, ENCODE[variable](raw * scale + offset)));
    }
    rows++;
  }
  if (rows !== HEIGHT) throw new Error(`${variable}: expected ${HEIGHT} rows, got ${rows}`);
  return out;
}

function pack(bytes) {
  const delta = new Uint8Array(bytes.length);
  for (let y = 0; y < HEIGHT; y++) {
    let prev = 0;
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      delta[i] = (bytes[i] - prev) & 255;
      prev = bytes[i];
    }
  }
  return deflateSync(delta, { level: 9 });
}

await mkdir(OUT, { recursive: true });
let total = 0;
for (const variable of ['tmax', 'tmin', 'ppt']) {
  for (let month = 0; month < 12; month++) {
    const text = await fetchMonth(variable, month);
    const file = pack(parse(text, variable));
    const name = `${variable}-${String(month + 1).padStart(2, '0')}.bin`;
    await writeFile(new URL(name, OUT), file);
    total += file.length;
    console.log(`${name}: ${(file.length / 1024).toFixed(0)} KB`);
    await sleep(PAUSE_MS);
  }
}
await writeFile(
  new URL('meta.json', OUT),
  JSON.stringify(
    {
      source: 'TerraClimate 1991–2020 monthly climatology, Climatology Lab, UC Merced (Abatzoglou et al. 2018, doi:10.1038/sdata.2017.191)',
      license: 'CC0 1.0 (public domain)',
      url: 'https://www.climatologylab.org/terraclimate.html',
      width: WIDTH,
      height: HEIGHT,
      cellDegrees: 360 / WIDTH,
      fetchedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(`Done: ${(total / 1024 / 1024).toFixed(1)} MB`);
