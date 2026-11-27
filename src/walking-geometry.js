const metersPerLatitudeDegree = 111195;
const metersPerLongitudeDegree = metersPerLatitudeDegree * Math.cos(42.49 * Math.PI / 180);
const cellMeters = 32;
const matchMeters = 1.8;
const sampleMeters = 7;
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

function pointMatchesFootway(cells, [lon, lat]) {
  const [x, y] = meters([lon, lat]);
  return cells.get(key(cell(x), cell(y)))?.some(({ ax, ay, dx, dy, lengthSquared }) => {
    const fraction = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
    return Math.hypot(x - ax - dx * fraction, y - ay - dy * fraction) <= matchMeters;
  }) ?? false;
}

export function classifyWalkingPath(path, footways, bounds) {
  if (!footways) return { sections: [{ path, mapped: false }], mappedPercent: null };
  const sections = [];
  let total = 0;
  let matched = 0;
  let previousMatches = pointMatchesFootway(footways, path[0]);
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const [ax, ay] = meters(from);
    const [bx, by] = meters(to);
    const length = Math.hypot(bx - ax, by - ay);
    if (!length) continue;
    const steps = Math.ceil(length / sampleMeters);
    let start = from;
    for (let step = 1; step <= steps; step++) {
      const end = step === steps ? to : interpolate(from, to, step / steps);
      const endMatches = pointMatchesFootway(footways, end);
      const mapped = previousMatches && endMatches && pointMatchesFootway(footways, interpolate(start, end, 0.5));
      const section = sections.at(-1);
      if (section?.mapped === mapped) section.path.push(end);
      else sections.push({ path: [start, end], mapped });
      total += length / steps;
      if (mapped) matched += length / steps;
      start = end;
      previousMatches = endMatches;
    }
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
