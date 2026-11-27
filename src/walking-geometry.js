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

function nearbyFootways(cells, ax, ay, bx, by, radius = 0) {
  const candidates = new Set();
  for (let x = cell(Math.min(ax, bx) - radius); x <= cell(Math.max(ax, bx) + radius); x++) {
    for (let y = cell(Math.min(ay, by) - radius); y <= cell(Math.max(ay, by) + radius); y++) {
      for (const segment of cells.get(key(x, y)) ?? []) candidates.add(segment);
    }
  }
  return candidates;
}

function coveredIntervals(cells, ax, ay, bx, by, length) {
  const candidates = nearbyFootways(cells, ax, ay, bx, by);
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
  return {
    sections,
    mappedPercent: insideCoverage && total ? Math.round(100 * matched / total) : null,
    unmatchedMeters: insideCoverage ? total - matched : null,
  };
}

export function findParallelSidewalks(geometry, sidewalks) {
  if (!sidewalks) return [];
  const nearbyMeters = 18;
  const stretches = [];
  let position = 0;
  for (const section of geometry.sections) {
    const matches = [];
    for (let index = 1; index < section.path.length; index++) {
      const [ax, ay] = meters(section.path[index - 1]);
      const [bx, by] = meters(section.path[index]);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      const offsetAlongRoute = position;
      position += length;
      if (section.mapped || !length) continue;
      for (const segment of nearbyFootways(sidewalks, ax, ay, bx, by, nearbyMeters)) {
        const segmentLength = Math.sqrt(segment.lengthSquared);
        const ux = segment.dx / segmentLength;
        const uy = segment.dy / segmentLength;
        const along = dx * ux + dy * uy;
        if (Math.abs(along) < minimumAlignment * length) continue;
        const x = ax - segment.ax;
        const y = ay - segment.ay;
        const offset = x * ux + y * uy;
        const lateral = x * uy - y * ux;
        const lateralDelta = dx * uy - dy * ux;
        for (const sign of [-1, 1]) {
          const interval = [0, 1];
          if (!clipRange(offset, along, 0, segmentLength, interval)
            || !clipRange(sign * lateral, sign * lateralDelta, matchMeters, nearbyMeters, interval)) continue;
          const [start, end] = interval;
          const projected = offset + along * (start + end) / 2;
          const lon = (segment.ax + ux * projected) / metersPerLongitudeDegree - 71.27;
          const lat = (segment.ay + uy * projected) / metersPerLatitudeDegree + 42.49;
          matches.push({
            start: offsetAlongRoute + start * length,
            end: offsetAlongRoute + end * length,
            point: [lon, lat],
            side: sign * Math.sign(along) > 0 ? 'left' : 'right',
            overlap: (end - start) * length,
          });
        }
      }
    }
    matches.sort((a, b) => a.start - b.start);
    let current;
    for (const match of matches) {
      if (!current || match.start > current.end + 4) {
        current = { start: match.start, end: match.end, length: 0, coveredTo: match.start };
        stretches.push(current);
      }
      current.length += Math.max(0, match.end - Math.max(match.start, current.coveredTo));
      current.coveredTo = Math.max(current.coveredTo, match.end);
      current.end = Math.max(current.end, match.end);
      if (match.overlap > (current[match.side]?.overlap ?? 0)) current[match.side] = match;
    }
  }
  // Ignore isolated short alignments at crossings and sidewalk connections.
  return stretches.filter(stretch => stretch.length >= 12);
}

export function sidewalkWaypointOptions(stretches) {
  const prioritized = [...stretches].sort((a, b) => b.length - a.length)
    .slice(0, 6).sort((a, b) => a.start - b.start);
  const left = prioritized.map(stretch => (stretch.left ?? stretch.right).point);
  const right = prioritized.map(stretch => (stretch.right ?? stretch.left).point);
  return JSON.stringify(left) === JSON.stringify(right) ? [left] : [left, right];
}

export function rankWalkingRoutes(routes) {
  return [...routes].sort((a, b) =>
    (b.walkingGeometry.mappedPercent ?? -1) - (a.walkingGeometry.mappedPercent ?? -1));
}

export function chooseWalkingRoutes(routes, limit) {
  const ranked = rankWalkingRoutes(routes);
  const withoutConflicts = ranked.filter(route => !route.sidewalkConflicts.length);
  if (withoutConflicts.length) return withoutConflicts.slice(0, limit);
  const conflictLength = route => route.sidewalkConflicts.reduce((sum, stretch) => sum + stretch.length, 0);
  const fallback = ranked.reduce((best, route) =>
    !best || conflictLength(route) < conflictLength(best) ? route : best, null);
  return fallback ? [fallback] : [];
}

export function walkingDisplaySections(geometry, conflicts) {
  if (!conflicts.length) return geometry.sections;
  const sections = [];
  let position = 0;
  let conflictIndex = 0;
  function append(from, to, mapped, useSidewalk) {
    const last = sections.at(-1);
    if (last?.mapped === mapped && last.useSidewalk === useSidewalk) last.path.push(to);
    else sections.push({ path: [from, to], mapped, useSidewalk });
  }
  for (const section of geometry.sections) {
    for (let i = 1; i < section.path.length; i++) {
      const from = section.path[i - 1];
      const to = section.path[i];
      const [ax, ay] = meters(from);
      const [bx, by] = meters(to);
      const length = Math.hypot(bx - ax, by - ay);
      if (!length) continue;
      const end = position + length;
      if (section.mapped) append(from, to, true, false);
      else {
        let start = position;
        while (conflictIndex < conflicts.length && conflicts[conflictIndex].start < end) {
          const conflict = conflicts[conflictIndex];
          const guideStart = Math.max(start, conflict.start);
          const guideEnd = Math.min(end, conflict.end);
          const point = offset => interpolate(from, to, (offset - position) / length);
          if (guideStart > start) append(point(start), point(guideStart), false, false);
          if (guideEnd > guideStart) append(point(guideStart), point(guideEnd), false, true);
          start = Math.max(start, guideEnd);
          if (conflict.end > end) break;
          conflictIndex++;
        }
        if (start < end) append(interpolate(from, to, (start - position) / length), to, false, false);
      }
      position = end;
    }
  }
  return sections;
}

let footwayIndex;
export function loadFootways() {
  footwayIndex ??= fetch(new URL('../data/bedford-footways.json', import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Footway data unavailable');
      return response.json();
    })
    .then(data => ({
      cells: indexFootways(data.paths),
      sidewalks: indexFootways(data.sidewalks.map(index => data.paths[index])),
      bounds: data.bounds,
    }))
    .catch(() => {
      footwayIndex = undefined;
      return null;
    });
  return footwayIndex;
}
