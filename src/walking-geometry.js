const metersPerLatitudeDegree = 111195;
const metersPerLongitudeDegree = metersPerLatitudeDegree * Math.cos(42.49 * Math.PI / 180);
const cellMeters = 32;
const matchMeters = 1.8;
const minimumAlignment = Math.cos(Math.PI / 6);
const meters = ([lon, lat]) => [(lon + 71.27) * metersPerLongitudeDegree, (lat - 42.49) * metersPerLatitudeDegree];
const cell = value => Math.floor(value / cellMeters);
const key = (x, y) => `${x},${y}`;
const interpolate = (a, b, fraction) => a.map((coordinate, axis) => coordinate + (b[axis] - coordinate) * fraction);

export function indexFootways(paths) {
  const cells = new Map();
  for (const path of paths) {
    const points = path.map(meters);
    for (let index = 1; index < points.length; index++) {
      const [ax, ay] = points[index - 1];
      const [bx, by] = points[index];
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) continue;
      const segment = { ax, ay, dx, dy, lengthSquared };
      for (let x = cell(Math.min(ax, bx) - matchMeters); x <= cell(Math.max(ax, bx) + matchMeters); x++) {
        for (let y = cell(Math.min(ay, by) - matchMeters); y <= cell(Math.max(ay, by) + matchMeters); y++) {
          const id = key(x, y);
          if (!cells.has(id)) cells.set(id, []);
          cells.get(id).push(segment);
        }
      }
    }
  }
  return cells;
}

function clipRange(start, delta, min, max, interval) {
  if (Math.abs(delta) < 1e-9) return start >= min && start <= max;
  const first = (min - start) / delta;
  const second = (max - start) / delta;
  interval[0] = Math.max(interval[0], Math.min(first, second));
  interval[1] = Math.min(interval[1], Math.max(first, second));
  return interval[0] < interval[1];
}

function coveredIntervals(cells, ax, ay, bx, by, length) {
  const candidates = new Set();
  for (let x = cell(Math.min(ax, bx)); x <= cell(Math.max(ax, bx)); x++) {
    for (let y = cell(Math.min(ay, by)); y <= cell(Math.max(ay, by)); y++) {
      for (const segment of cells.get(key(x, y)) ?? []) candidates.add(segment);
    }
  }
  const dx = bx - ax;
  const dy = by - ay;
  const intervals = [];
  for (const segment of candidates) {
    const segmentLength = Math.sqrt(segment.lengthSquared);
    const ux = segment.dx / segmentLength;
    const uy = segment.dy / segmentLength;
    const along = dx * ux + dy * uy;
    if (Math.abs(along) < minimumAlignment * length) continue;
    const x = ax - segment.ax;
    const y = ay - segment.ay;
    const interval = [0, 1];
    if (clipRange(x * ux + y * uy, along, 0, segmentLength, interval)
      && clipRange(x * uy - y * ux, dx * uy - dy * ux, -matchMeters, matchMeters, interval)) {
      intervals.push([interval[0] < 1e-8 ? 0 : interval[0], interval[1] > 1 - 1e-8 ? 1 : interval[1]]);
    }
  }
  return intervals.sort((a, b) => a[0] - b[0]);
}

export function classifyWalkingPath(path, footways, bounds) {
  if (!footways) return { sections: [{ path, mapped: false }], mappedPercent: null };
  const sections = [];
  let total = 0;
  let matched = 0;
  function appendSection(from, to, mapped) {
    const section = sections.at(-1);
    if (section?.mapped === mapped) section.path.push(to);
    else sections.push({ path: [from, to], mapped });
  }
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const [ax, ay] = meters(from);
    const [bx, by] = meters(to);
    const length = Math.hypot(bx - ax, by - ay);
    if (!length) continue;
    total += length;
    const covered = coveredIntervals(footways, ax, ay, bx, by, length);
    // Union overlaps before drawing, so route vertices do not affect coverage boundaries.
    const merged = [];
    for (const interval of covered) {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1] + 1e-8) last[1] = Math.max(last[1], interval[1]);
      else merged.push(interval);
    }
    let position = 0;
    for (const [start, end] of merged) {
      if (start > position) appendSection(interpolate(from, to, position), interpolate(from, to, start), false);
      appendSection(interpolate(from, to, start), interpolate(from, to, end), true);
      matched += length * (end - start);
      position = end;
    }
    if (position < 1) appendSection(interpolate(from, to, position), to, false);
  }
  const insideCoverage = !bounds || path.every(([lon, lat]) =>
    lon >= bounds[0] && lat >= bounds[1] && lon <= bounds[2] && lat <= bounds[3]);
  return { sections, mappedPercent: insideCoverage && total ? Math.round(100 * matched / total) : null };
}

let footwayIndex;
export function loadFootways() {
  footwayIndex ??= fetch(new URL('../data/bedford-footways.json', import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Footway data unavailable');
      return response.json();
    })
    .then(data => ({ cells: indexFootways(data.paths), bounds: data.bounds }))
    .catch(() => {
      footwayIndex = undefined;
      return null;
    });
  return footwayIndex;
}
