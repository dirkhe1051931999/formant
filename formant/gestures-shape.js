/** Recognize mouse-gesture strokes: L/R/U/D, lenient circle (O), and X. */

/**
 * @typedef {{ x: number, y: number }} GesturePoint
 */

export function directionFromDelta(dx, dy) {
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "R" : "L") : dy >= 0 ? "D" : "U";
}

/**
 * Four-direction loops (RDLU and rotations) count as a circle.
 * @param {string} path
 */
export function canonicalGesturePath(path) {
  const key = String(path || "")
    .toUpperCase()
    .replace(/[^LRUDXO]/g, "");
  if (key === "O" || key === "X") return key;
  const unique = new Set(key.split(""));
  if (unique.size >= 4) return "O";
  if (key.length >= 4 && unique.size >= 3 && (unique.has("L") || unique.has("R")) && (unique.has("U") || unique.has("D"))) {
    return "O";
  }
  return key.slice(0, 8);
}

/**
 * Ignore start jitter; one direction per major corner, drop tiny wiggles.
 * @param {GesturePoint[]} points
 * @param {number} [stepMin]
 */
export function pathFromPoints(points, stepMin = 16) {
  const segments = directionSegments(points, stepMin);
  if (!segments.length) return "";
  const longest = Math.max(...segments.map((seg) => seg.len));
  const minKeep = Math.max(stepMin, longest * 0.22);
  let path = "";
  for (const seg of segments) {
    if (seg.len < minKeep) continue;
    if (path.slice(-1) !== seg.dir) path += seg.dir;
  }
  return path.slice(0, 8);
}

/**
 * @param {GesturePoint[][]} strokes
 * @param {{ stepMin?: number }} [opts]
 */
export function recognizeGesture(strokes, opts = {}) {
  const cleaned = sanitizeStrokes(strokes);
  if (!cleaned.length) return "";
  if (cleaned.length >= 2 && strokesFormX(cleaned[0], cleaned[cleaned.length - 1])) return "X";
  const points = cleaned.length === 1 ? cleaned[0] : cleaned.flat();
  if (cleaned.length === 1 && looksLikeSelfIntersectX(points)) return "X";
  if (looksLikeCircle(points)) return "O";
  return canonicalGesturePath(pathFromPoints(points, opts.stepMin ?? 16));
}

/**
 * Straight-ish diagonal: wait for a second stroke to complete X.
 * @param {GesturePoint[]} points
 */
export function mightBeFirstStrokeOfX(points) {
  if (!Array.isArray(points) || points.length < 2) return false;
  if (looksLikeCircle(points) || looksLikeSelfIntersectX(points)) return false;
  const box = bbox(points);
  const w = Math.max(1, box.maxX - box.minX);
  const h = Math.max(1, box.maxY - box.minY);
  const len = pathLength(points);
  const first = points[0];
  const last = points[points.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  if (len < 36 || chord / len < 0.84) return false;
  return Math.min(w, h) / Math.max(w, h) > 0.28;
}

/**
 * @param {unknown} raw
 * @returns {GesturePoint[][]}
 */
function sanitizeStrokes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((stroke) =>
      Array.isArray(stroke)
        ? stroke.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
        : [],
    )
    .filter((stroke) => stroke.length >= 2);
}

/**
 * @param {GesturePoint[]} points
 */
function looksLikeCircle(points) {
  if (points.length < 6) return false;
  const box = bbox(points);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const size = Math.max(w, h);
  if (size < 24) return false;
  if (Math.min(w, h) / size < 0.28) return false;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const quadrants = [false, false, false, false];
  for (const point of points) {
    quadrants[(point.x >= cx ? 1 : 0) + (point.y >= cy ? 2 : 0)] = true;
  }
  if (quadrants.filter(Boolean).length < 3) return false;
  const len = pathLength(points);
  const peri = Math.PI * ((w + h) / 2);
  if (len < peri * 0.32 || len > peri * 3.2) return false;
  const turn = Math.abs(totalTurning(points));
  if (turn < Math.PI * 0.55 || turn > Math.PI * 4) return false;
  const dirs = microDirs(points, 10);
  return dirs.size >= 3;
}

/**
 * @param {GesturePoint[]} points
 * @param {number} stepMin
 */
function microDirs(points, stepMin) {
  /** @type {Set<string>} */
  const dirs = new Set();
  let last = points[0];
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (Math.hypot(dx, dy) < stepMin) continue;
    dirs.add(directionFromDelta(dx, dy));
    last = point;
  }
  return dirs;
}

/**
 * @param {GesturePoint[]} points
 * @param {number} stepMin
 * @returns {Array<{ dir: string, len: number }>}
 */
function directionSegments(points, stepMin) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const total = pathLength(points);
  const commit = Math.max(stepMin, Math.min(56, total * 0.14 || stepMin));
  const start = points[0];
  /** @type {Array<{ dir: string, len: number }>} */
  const segments = [];
  let origin = start;
  let currentDir = "";
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    if (!currentDir && Math.hypot(point.x - start.x, point.y - start.y) < commit) continue;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < commit) continue;
    const dir = directionFromDelta(dx, dy);
    if (!currentDir) {
      currentDir = dir;
      origin = point;
      segments.push({ dir, len: dist });
      continue;
    }
    if (dir === currentDir) {
      segments[segments.length - 1].len += dist;
      origin = point;
      continue;
    }
    currentDir = dir;
    origin = point;
    segments.push({ dir, len: dist });
  }
  return segments;
}

/**
 * @param {GesturePoint[]} a
 * @param {GesturePoint[]} b
 */
function strokesFormX(a, b) {
  if (pathLength(a) < 32 || pathLength(b) < 32) return false;
  const ang = undirectedAngleDiff(principalAngle(a), principalAngle(b));
  if (ang < (26 * Math.PI) / 180) return false;
  if (polylinesIntersect(a, b)) return true;
  return minDistanceBetweenPolylines(a, b) < 30 && bboxOverlap(bbox(a), bbox(b), 12);
}

/**
 * @param {GesturePoint[]} points
 */
function looksLikeSelfIntersectX(points) {
  const hit = firstSelfIntersection(points);
  if (!hit) return false;
  return strokesFormX(points.slice(0, hit.j + 1), points.slice(hit.i));
}

/**
 * @param {GesturePoint[]} points
 */
function bbox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * @param {ReturnType<typeof bbox>} a
 * @param {ReturnType<typeof bbox>} b
 * @param {number} [pad]
 */
function bboxOverlap(a, b, pad = 0) {
  return a.minX <= b.maxX + pad && a.maxX + pad >= b.minX && a.minY <= b.maxY + pad && a.maxY + pad >= b.minY;
}

/**
 * @param {GesturePoint[]} points
 */
function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i += 1) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/**
 * @param {GesturePoint[]} points
 */
function principalAngle(points) {
  const first = points[0];
  const last = points[points.length - 1];
  return Math.atan2(last.y - first.y, last.x - first.x);
}

/**
 * @param {number} a
 * @param {number} b
 */
function undirectedAngleDiff(a, b) {
  let diff = Math.abs(a - b) % Math.PI;
  if (diff > Math.PI / 2) diff = Math.PI - diff;
  return diff;
}

/**
 * @param {GesturePoint[]} points
 */
function totalTurning(points) {
  let sum = 0;
  let prev = null;
  for (let i = 1; i < points.length; i += 1) {
    const ang = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
    if (prev != null) {
      let delta = ang - prev;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      sum += delta;
    }
    prev = ang;
  }
  return sum;
}

/**
 * @param {GesturePoint} a1
 * @param {GesturePoint} a2
 * @param {GesturePoint} b1
 * @param {GesturePoint} b2
 */
function segmentsIntersect(a1, a2, b1, b2) {
  const d1 = cross(a2.x - a1.x, a2.y - a1.y, b1.x - a1.x, b1.y - a1.y);
  const d2 = cross(a2.x - a1.x, a2.y - a1.y, b2.x - a1.x, b2.y - a1.y);
  const d3 = cross(b2.x - b1.x, b2.y - b1.y, a1.x - b1.x, a1.y - b1.y);
  const d4 = cross(b2.x - b1.x, b2.y - b1.y, a2.x - b1.x, a2.y - b1.y);
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0) || (d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0)) return false;
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) return false;
  return true;
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

/**
 * @param {GesturePoint[]} a
 * @param {GesturePoint[]} b
 */
function polylinesIntersect(a, b) {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

/**
 * @param {GesturePoint[]} a
 * @param {GesturePoint[]} b
 */
function minDistanceBetweenPolylines(a, b) {
  let min = Infinity;
  for (const point of a) {
    for (let j = 0; j < b.length - 1; j += 1) {
      min = Math.min(min, pointToSegment(point, b[j], b[j + 1]));
    }
  }
  for (const point of b) {
    for (let j = 0; j < a.length - 1; j += 1) {
      min = Math.min(min, pointToSegment(point, a[j], a[j + 1]));
    }
  }
  return min;
}

/**
 * @param {GesturePoint} p
 * @param {GesturePoint} a
 * @param {GesturePoint} b
 */
function pointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * @param {GesturePoint[]} points
 */
function firstSelfIntersection(points) {
  const last = points.length - 2;
  for (let i = 0; i < last; i += 1) {
    for (let j = i + 2; j < last; j += 1) {
      if (i === 0 && j === last) continue;
      if (segmentsIntersect(points[i], points[i + 1], points[j], points[j + 1])) {
        return { i, j };
      }
    }
  }
  return null;
}
