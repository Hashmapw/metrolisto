import type { Point } from '../types';

/** Cubic paths store a start point followed by control/control/end triples. */
export function cubicPath(points: Point[]): string {
  return `M ${points[0].join(',')} C ${points
    .slice(1)
    .map((p) => p.join(','))
    .join(' ')}`;
}

export function cubicArrow(points: Point[]) {
  const index = Math.floor((points.length - 1) / 3 / 2) * 3;
  const [a, b, c, d] = points.slice(index, index + 4);
  // Position and derivative at t=1/2 of the middle curve.
  const x = (a[0] + 3 * b[0] + 3 * c[0] + d[0]) / 8;
  const y = (a[1] + 3 * b[1] + 3 * c[1] + d[1]) / 8;
  const dx = -a[0] - b[0] + c[0] + d[0];
  const dy = -a[1] - b[1] + c[1] + d[1];
  return {
    x,
    y,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    length:
      Math.hypot(b[0] - a[0], b[1] - a[1]) +
      Math.hypot(c[0] - b[0], c[1] - b[1]) +
      Math.hypot(d[0] - c[0], d[1] - c[1]),
  };
}
