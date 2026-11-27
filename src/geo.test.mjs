import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWalkingPath, indexFootways } from './walking-geometry.js';
import {distance,initialRouteBearing,nearRoute,bounds,decodePolyline6,scoreColor,averageScores} from './geo.js';
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
