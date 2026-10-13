import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface TrackShape {
  d: string;
  width: number;
  height: number;
}

const SIZE = 200;
const cache = new Map<string, TrackShape>();

// Ramer–Douglas–Peucker: drop points that sit within `eps` of the line between their neighbours.
function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts.at(-1)!;
  const len = Math.hypot(bx - ax, by - ay);
  let max = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    // A closed outline starts and ends on the same point; measure from that point instead.
    const dist = len
      ? Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / len
      : Math.hypot(px - ax, py - ay);
    if (dist > max) [max, idx] = [dist, i];
  }
  if (max <= eps) return [pts[0], pts.at(-1)!];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/** Circuit outline from data/tracks/<id>.geojson as an SVG path, longest side SIZE units. */
export function trackShape(id: string): TrackShape {
  const hit = cache.get(id);
  if (hit) return hit;

  const geo = JSON.parse(readFileSync(resolve('data/tracks', `${id}.geojson`), 'utf8'));
  const coords: [number, number][] = geo.features[0].geometry.coordinates;

  // Equirectangular projection around the circuit's latitude is plenty at this scale.
  const lat0 = (coords.reduce((s, c) => s + c[1], 0) / coords.length) * (Math.PI / 180);
  const xy = coords.map(([lon, lat]): [number, number] => [lon * Math.cos(lat0), -lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const scale = SIZE / Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  const pts = simplify(
    xy.map(([x, y]): [number, number] => [(x - minX) * scale, (y - minY) * scale]),
    0.25,
  );

  const shape = {
    d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z',
    width: Math.max(...xs.map((x) => (x - minX) * scale)),
    height: Math.max(...ys.map((y) => (y - minY) * scale)),
  };
  cache.set(id, shape);
  return shape;
}
