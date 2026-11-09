import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Adds a round map icon: a white stroked symbol on a coloured disc (`filled`), or a coloured
 * symbol on a white disc.
 */
export function addRoundIcon(map: MapLibreMap, id: string, path: string, color: string, size = 26, filled = true): void {
  if (map.hasImage(id)) return;
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
  map.addImage(id, g.getImageData(0, 0, px, px), { pixelRatio: ratio });
}
