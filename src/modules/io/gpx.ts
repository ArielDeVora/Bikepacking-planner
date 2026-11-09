import type { Coord } from '../../lib/geo/polyline';
import type { LngLat } from '../../model/types';

export interface GpxTrack {
  name: string;
  desc?: string;
  type?: string;
  coords: Coord[];
}

export interface GpxWaypoint {
  name: string;
  desc?: string;
  lngLat: LngLat;
  links?: string[];
}

const esc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** Longitudes of great-circle arcs may be unwrapped beyond ±180; GPX wants them back in range. */
const lon = (v: number) => (((v + 180) % 360) + 360) % 360 - 180;
const fmt = (v: number) => v.toFixed(6).replace(/\.?0+$/, '');

function point(tag: 'wpt' | 'trkpt', c: readonly number[], inner = ''): string {
  const ele = c.length > 2 && Number.isFinite(c[2]) ? `<ele>${c[2]!.toFixed(1)}</ele>` : '';
  return `<${tag} lat="${fmt(c[1]!)}" lon="${fmt(lon(c[0]!))}">${ele}${inner}</${tag}>`;
}

/** GPX 1.1, one track per segment, no timestamps. */
export function toGpx(name: string, tracks: GpxTrack[], waypoints: GpxWaypoint[] = []): string {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Bikepacking Planner" xmlns="http://www.topografix.com/GPX/1/1">',
    `<metadata><name>${esc(name)}</name></metadata>`,
  ];
  for (const w of waypoints) {
    const inner =
      `<name>${esc(w.name)}</name>` +
      (w.desc ? `<desc>${esc(w.desc)}</desc>` : '') +
      (w.links ?? []).map((href) => `<link href="${esc(href)}"/>`).join('');
    out.push(point('wpt', w.lngLat, inner));
  }
  for (const tr of tracks) {
    if (tr.coords.length < 2) continue;
    out.push('<trk>', `<name>${esc(tr.name)}</name>`);
    if (tr.desc) out.push(`<desc>${esc(tr.desc)}</desc>`);
    if (tr.type) out.push(`<type>${esc(tr.type)}</type>`);
    out.push('<trkseg>', ...tr.coords.map((c) => point('trkpt', c)), '</trkseg>', '</trk>');
  }
  out.push('</gpx>', '');
  return out.join('\n');
}

export function safeFileName(name: string, ext: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'trip';
  return `${base}.${ext}`;
}

export function download(fileName: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
