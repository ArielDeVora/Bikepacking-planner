import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Adds a round map icon: a white stroked symbol on a coloured disc (`filled`), or a coloured
 * symbol on a white disc.
 */
export function addRoundIcon(map: MapLibreMap, id: string, path: string, color: string, size = 26, filled = true): void {
  if (map.hasImage(id)) return;
  map.addImage(id, roundIcon(path, color, size, filled), { pixelRatio: 2 });
}

/** Adds a round icon, or redraws it if it exists (e.g. after its colour or symbol changed). */
export function setRoundIcon(map: MapLibreMap, id: string, path: string, color: string, size = 26, filled = true): void {
  const image = roundIcon(path, color, size, filled);
  if (map.hasImage(id)) map.updateImage(id, image);
  else map.addImage(id, image, { pixelRatio: 2 });
}

function roundIcon(path: string, color: string, size: number, filled: boolean): ImageData {
  const ratio = 2;
  const px = size * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  g.scale(ratio, ratio);
  const r = size / 2;
  g.beginPath();
  g.arc(r, r, r - 1.5, 0, Math.PI * 2);
  g.fillStyle = filled ? color : '#ffffff';
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = filled ? '#ffffff' : color;
  g.stroke();
  const scale = (size * 0.58) / 24;
  g.translate(r - 12 * scale, r - 12 * scale);
  g.scale(scale, scale);
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = filled ? '#ffffff' : color;
  g.stroke(new Path2D(path));
  return g.getImageData(0, 0, px, px);
}

/** A small gold crown, drawn with its bottom edge at the bottom of the image. */
export function addCrownIcon(map: MapLibreMap, id: string, size = 18): void {
  if (map.hasImage(id)) return;
  const ratio = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * ratio;
  const g = canvas.getContext('2d')!;
  g.scale((size * ratio) / 24, (size * ratio) / 24);
  const crown = new Path2D('M3 20 2 8l5.5 4.5L12 4l4.5 8.5L22 8l-1 12z');
  g.lineJoin = 'round';
  g.lineWidth = 3.5;
  g.strokeStyle = '#ffffff';
  g.stroke(crown);
  g.fillStyle = '#fcc419';
  g.fill(crown);
  g.lineWidth = 1.6;
  g.strokeStyle = '#a05a00';
  g.stroke(crown);
  for (const [x, y] of [[2, 8], [12, 4], [22, 8]] as const) {
    g.beginPath();
    g.arc(x, y, 1.6, 0, Math.PI * 2);
    g.fillStyle = '#f59f00';
    g.fill();
  }
  map.addImage(id, g.getImageData(0, 0, size * ratio, size * ratio), { pixelRatio: ratio });
}
