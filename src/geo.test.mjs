import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseWalkingRoutes, classifyWalkingPath, findParallelSidewalks, indexFootways, rankWalkingRoutes, sidewalkWaypointOptions, walkingDisplaySections } from './walking-geometry.js';
import {distance,initialRouteBearing,crossingsAlongPath,nearRoute,bounds,decodePolyline6,scoreColor,averageScores} from './geo.js';
test('safety score color thresholds',()=>{assert.equal(scoreColor(0),'red');assert.equal(scoreColor(49),'red');assert.equal(scoreColor(50),'orange');assert.equal(scoreColor(79),'orange');assert.equal(scoreColor(80),'green');assert.equal(scoreColor(100),'green');assert.equal(scoreColor(null),'unscored');});
test('scoring omits missing values instead of treating them as zeros',()=>{assert.deepEqual(averageScores([{score:35},{score:85},{score:null}]),{value:60,covered:2,total:3});assert.deepEqual(averageScores([{score:null}]),{value:null,covered:0,total:1});});
test('geographic distance and route matching',()=>{const a=[-71.275,42.490],b=[-71.275,42.491];assert.ok(distance(a,b)>100&&distance(a,b)<125);assert.ok(nearRoute([-71.275,42.4905],[a,b])<1);assert.ok(nearRoute([-71.27,42.4905],[a,b])>300);});
test('route geographic bounds',()=>{assert.deepEqual(bounds([[10,20],[12,25]],0),[20,10,25,12]);});
test('polyline6 decoder',()=>{function encode(values){let last=[0,0],out='';for(const [lat,lon] of values){for(const [i,val] of [[0,lat],[1,lon]]){let x=Math.round(val*1e6)-last[i];last[i]+=x;x=x<0?~(x<<1):x<<1;while(x>=32){out+=String.fromCharCode((32|(x&31))+63);x>>=5;}out+=String.fromCharCode(x+63);}}return out;}const shape=encode([[42.49,-71.27],[42.491,-71.272]]);const points=decodePolyline6(shape);assert.ok(Math.abs(points[1][0]-(-71.272))<.000001);assert.ok(Math.abs(points[0][1]-42.49)<.000001);});
test('walking camera follows the start of the route before a later turn', () => {
  const start = [-71.275, 42.49];
  const east = [-71.2746, 42.49];
  const north = [-71.2746, 42.491];
  assert.ok(Math.abs(initialRouteBearing([start, start, east, north]) - 90) < 0.01);
  assert.equal(initialRouteBearing([east, north]), 0);
  assert.equal(initialRouteBearing([start, start]), 0);
});

test('street centerlines and brief intersections do not count as mapped footways', () => {
  const footway = [[-71.275, 42.49], [-71.274, 42.49]];
  const parallelStreet = footway.map(([lon, lat]) => [lon, lat + 0.00005]);
  const crossingStreet = [[-71.2745, 42.48975], [-71.2745, 42.49025]];
  const index = indexFootways([footway]);
  assert.equal(classifyWalkingPath(footway, index).mappedPercent, 100);
  assert.equal(classifyWalkingPath(parallelStreet, index).mappedPercent, 0);
  assert.ok(classifyWalkingPath(crossingStreet, index).sections.every(section => !section.mapped));
  assert.equal(classifyWalkingPath(footway, null).mappedPercent, null);
});

test('shared route stretches have the same footway boundaries with different shape vertices', () => {
  const start = [-71.275, 42.49];
  const end = [-71.274, 42.49];
  const path = [[-71.2748, 42.49], [-71.2743, 42.49]];
  const index = indexFootways([path]);
  const a = classifyWalkingPath([start, end], index);
  const b = classifyWalkingPath([start, [-71.2746, 42.49], end], index);
  assert.equal(a.mappedPercent, b.mappedPercent);
  assert.deepEqual(a.sections.map(section => section.mapped), [false, true, false]);
  assert.deepEqual(b.sections.map(section => section.mapped), [false, true, false]);
  for (const [i, section] of a.sections.entries()) {
    assert.ok(Math.abs(section.path.at(-1)[0] - b.sections[i].path.at(-1)[0]) < 1e-10);
  }
});

test('shared stretches retain nearby distinct crossing identities', () => {
  const shared = [[-71.275, 42.49], [-71.274, 42.49]];
  const routes = [
    [[-71.275, 42.4899], ...shared],
    [shared[0], [-71.2744, 42.49], shared[1], [-71.274, 42.4901]],
  ];
  const first = { osmType: 'node', osmId: 10, lon: -71.27485, lat: 42.49 };
  const second = { osmType: 'node', osmId: 11, lon: -71.27479, lat: 42.49 };
  const branchOnly = { osmType: 'node', osmId: 12, lon: -71.274, lat: 42.49007 };
  const records = [second, first, first, branchOnly];
  const matches = routes.map(route => crossingsAlongPath(records, route, 3).map(crossing => crossing.osmId));
  assert.deepEqual(matches, [[10, 11], [10, 11, 12]]);
});

test('walking route recommendations prefer mapped pedestrian coverage', () => {
  const route = (name, mappedPercent) => ({ name, walkingGeometry: { mappedPercent } });
  const options = [
    route('fastest', 38),
    route('footways', 93),
    route('another footway route', 93),
    route('outside coverage', null),
  ];
  assert.deepEqual(rankWalkingRoutes(options).map(option => option.name),
    ['footways', 'another footway route', 'fastest', 'outside coverage']);
});

test('street routing is allowed where no parallel sidewalk is mapped', () => {
  const street = [[-71.275, 42.49], [-71.274, 42.49]];
  const distantPath = [[-71.275, 42.491], [-71.274, 42.491]];
  const crossingsOnly = [[-71.2745, 42.4898], [-71.2745, 42.4902]];
  const index = indexFootways([distantPath, crossingsOnly]);
  const geometry = classifyWalkingPath(street, index);
  assert.equal(geometry.mappedPercent, 0);
  assert.deepEqual(findParallelSidewalks(geometry, index), []);
});

test('nearby sidewalks on both sides produce distinct through-waypoint options', () => {
  const street = [[-71.275, 42.49], [-71.274, 42.49]];
  const north = [[-71.2749, 42.49006], [-71.2741, 42.49006]];
  const south = [[-71.2749, 42.48994], [-71.2741, 42.48994]];
  const index = indexFootways([north, south]);
  const geometry = classifyWalkingPath(street, index);
  const conflicts = findParallelSidewalks(geometry, index);
  assert.equal(conflicts.length, 1);
  const [[first], [second]] = sidewalkWaypointOptions(conflicts);
  assert.ok(nearRoute(first, north) < 0.1);
  assert.ok(nearRoute(second, south) < 0.1);
  assert.deepEqual(findParallelSidewalks(classifyWalkingPath(north, index), index), []);
});

test('the sidewalk conflict check uses the full stretch across short route vertices', () => {
  const street = Array.from({ length: 11 }, (_, index) => [-71.275 + index * 0.00004, 42.49]);
  const sidewalk = street.map(([lon, lat]) => [lon, lat + 0.00006]);
  const index = indexFootways([sidewalk]);
  const conflicts = findParallelSidewalks(classifyWalkingPath(street, index), index);
  assert.equal(conflicts.length, 1);
  assert.ok(conflicts[0].length > 30);
  assert.equal(sidewalkWaypointOptions(conflicts).length, 1);
});

test('route selection keeps a single guided fallback when every route has sidewalk conflicts', () => {
  const option = (mappedPercent, lengths) => ({
    walkingGeometry: { mappedPercent },
    sidewalkConflicts: lengths.map(length => ({ length })),
  });
  const first = option(92, [25, 15]);
  const second = option(83, [20]);
  const clean = option(70, []);
  assert.deepEqual(chooseWalkingRoutes([first, second], 3), [second]);
  assert.deepEqual(chooseWalkingRoutes([first, second, clean], 3), [clean]);
});

test('fallback styling marks sidewalk guidance only beside the mapped sidewalk', () => {
  const path = [[-71.275, 42.49], [-71.274, 42.49]];
  const sidewalk = [[-71.2748, 42.49006], [-71.2743, 42.49006]];
  const geometry = classifyWalkingPath(path, indexFootways([sidewalk]));
  const conflicts = findParallelSidewalks(geometry, indexFootways([sidewalk]));
  const segments = walkingDisplaySections(geometry, conflicts);
  assert.deepEqual(segments.map(segment => segment.useSidewalk), [false, true, false]);
  assert.ok(Math.abs(segments[1].path[0][0] - sidewalk[0][0]) < 1e-10);
  assert.ok(Math.abs(segments[1].path.at(-1)[0] - sidewalk[1][0]) < 1e-10);
});
