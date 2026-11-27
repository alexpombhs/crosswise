import { classifyWalkingPath, loadFootways } from './walking-geometry.js';
import { renderScenarioExplorer } from './scenario-explorer.jsx';
import { renderCrossingRows } from './crossing-inventory.jsx';
import { figmaIcon } from './assets.js';
import { attachAddressLookup, resolveAddress } from './address-lookup.js';
import { distance, initialRouteBearing, projectToRoute, bounds, decodePolyline6, scoreColor, averageScores } from './geo.js';

const $ = id => document.getElementById(id);
const state = { map:null, gps:null, gpsWatch:null, markers:[], endpoints:[], route:null, routes:[], routeNames:[], detail:null, crossingScores:[], loaded:false };
const routeFields = ['from', 'to'];
const savedDirectionsKey = 'crosswise.directions';

function saveDirections() {
 const directions = {};
 for (const field of routeFields) {
  const value = $(field).value;
  directions[field] = value.trim().toLowerCase() === 'current location' ? '' : value;
 }
 try {
  localStorage.setItem(savedDirectionsKey, JSON.stringify(directions));
 } catch {
  // The planner also works when browser storage is unavailable.
 }
}
function restoreDirections() {
 try {
  const directions = JSON.parse(localStorage.getItem(savedDirectionsKey));
  for (const field of routeFields) {
   const value = directions?.[field];
   if (typeof value === 'string' && value.trim().toLowerCase() !== 'current location') {
    $(field).value = value;
   }
  }
 } catch {
  // Treat invalid or inaccessible storage as an empty planner.
 }
}

const coords = [-71.2748, 42.4903]; // Bedford, MA approximate initial viewport; not a crosswalk location.
const mapStyle = 'https://tiles.openfreemap.org/styles/liberty';
const routeEndpoint = 'https://valhalla1.openstreetmap.de/route';
// Allow for minor coordinate differences between the route shape and OSM crossing points.
const crossingMatchMeters = 3;
const overpassEndpoint = 'https://overpass-api.de/api/interpreter';
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function setBusy(b){
 $('find').disabled=b;
 $('find-label').textContent=b?'Finding walking route…':'Find walking route';
}
function mapReady(){if(state.map&&state.loaded)return true;status('Map is still loading. Check your connection.',true);return false;}
function coordPair(text){const m=text.trim().match(/^\s*([-+]?\d{1,2}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)\s*$/);if(!m)return null;const lat=Number(m[1]),lon=Number(m[2]);return Math.abs(lat)<=90&&Math.abs(lon)<=180?[lon,lat]:null;}
function resolvePlace(text) {
 return (text.trim().toLowerCase() === 'current location' ? state.gps : null) ?? coordPair(text) ?? resolveAddress(text);
}
function markerElement(cls){const e=document.createElement('div');e.className=cls;return e;}
function clearMarkers(collection){for(const m of collection)m.remove();collection.length=0;}
function locate(){
 if(!('geolocation' in navigator)){status('Geolocation is unavailable in this browser.',true);return;}
 status('Requesting location permission…');
 if(state.gpsWatch!==null)navigator.geolocation.clearWatch(state.gpsWatch);
 const startValue = $('from').value;
 let firstPosition = true;
 state.gpsWatch=navigator.geolocation.watchPosition(position=>{
  state.gps=[position.coords.longitude,position.coords.latitude];
  if (firstPosition && $('from').value === startValue) {
   $('from').value='Current location';
   saveDirections();
  }
  const centerOnFix = firstPosition && document.querySelector('.app').dataset.view === 'planner';
  firstPosition = false;
  if(state.gpsMarker)state.gpsMarker.setLngLat(state.gps);else if(state.map)state.gpsMarker=new maplibregl.Marker({element:markerElement('map-gps')}).setLngLat(state.gps).addTo(state.map);
  if (centerOnFix) {
   state.map?.easeTo({center:state.gps,zoom:Math.max(15,state.map.getZoom()),duration:750});
   status('Current position acquired. Enter a destination and choose Find walking route.');
  }
 },err=>{status(err.code===1?'Location access was denied. Enter a starting address instead.':'Could not determine your location. Try an address instead.',true);},{enableHighAccuracy:true,timeout:16000,maximumAge:10000});
}
function mapBounds(path){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const [x,y] of path){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return[[minX,minY],[maxX,maxY]];}
function lineFeature(path, properties = {}) {
 return {type:'Feature', geometry:{type:'LineString',coordinates:path}, properties};
}
function drawRoutes(route, alternatives) {
 state.map.getSource('alternate-routes')?.setData({
  type:'FeatureCollection', features:alternatives.map(path=>lineFeature(path)),
 });
 state.map.getSource('walking-route')?.setData({
  type:'FeatureCollection',
  features:route.walkingGeometry.sections.map(({ path, mapped })=>lineFeature(path,{mapped})),
 });
}
function renderLine(route, { alternatives = [], overview = false } = {}){
 const coordinates = route.path;
 drawRoutes(route, alternatives);
 if (!overview) {
  focusWalkingStart(coordinates);
  return;
 }
 const height = $('map').clientHeight;
 const padding = {top:Math.min(180,height*.36),bottom:Math.min(150,height*.32),left:24,right:24};
 state.map.fitBounds(mapBounds(coordinates.concat(...alternatives)),{padding,bearing:0,maxZoom:17.5,duration:450});
}
function focusWalkingStart(path) {
 const mapBounds = $('map').getBoundingClientRect();
 if (!mapBounds.height) return;
 const sheetTop = document.querySelector('.results > .route-sheet').getBoundingClientRect().top;
 const startY = Math.max(mapBounds.height * .53, Math.min(mapBounds.height * .76, sheetTop - mapBounds.top - 24));
 state.map.easeTo({
  center:path[0],
  bearing:initialRouteBearing(path),
  pitch:0,
  zoom:17.5,
  padding:0,
  offset:[0,startY - mapBounds.height / 2],
  duration:450,
 });
}
function routeMarkers(origin,destination){
 clearMarkers(state.endpoints);
 state.endpoints.push(new maplibregl.Marker({element:markerElement('map-endpoint')}).setLngLat(origin).addTo(state.map));
 state.endpoints.push(new maplibregl.Marker({element:markerElement('map-endpoint end')}).setLngLat(destination).addTo(state.map));
}
const maxWalkingRoutes = 3;
async function requestWalkingRoute(origin,destination) {
 const basePayload = {
  locations:[{lat:origin[1],lon:origin[0]},{lat:destination[1],lon:destination[0]}],
  costing:'pedestrian',
  alternates:maxWalkingRoutes - 1,
  units:'miles',
  directions_type:'instructions',
  shape_format:'polyline6',
 };
 const footways = loadFootways();
 const preferred = await requestRouteOptions({
  ...basePayload,
  costing_options:{pedestrian:{walkway_factor:0.55,sidewalk_factor:0.75}},
 });
 let options = preferred;
 // The standard pedestrian profile can return distinct routes omitted by sidewalk weighting.
 if (preferred.length < maxWalkingRoutes) {
  const fallback = new AbortController();
  const timeout = setTimeout(()=>fallback.abort(),4500);
  try {
   const standard = await requestRouteOptions(basePayload,fallback.signal);
   options = distinctRoutes([...preferred,...standard]);
  } catch {
   // Keep the preferred walking options when the additional request fails.
  } finally {
   clearTimeout(timeout);
  }
 }
 const index = await footways;
 return options.map(route=>({...route,walkingGeometry:classifyWalkingPath(route.path,index?.cells,index?.bounds)}));
}
async function requestRouteOptions(payload, signal) {
 const response = await fetch(routeEndpoint,{
  method:'POST',headers:{'Content-Type':'application/json','X-Client-Id':'crosswise-msef-prototype'},
  body:JSON.stringify(payload),signal,
 });
 if (!response.ok) throw Error(response.status===429
  ? 'Walking route service is rate-limited. Try again later.'
  : 'Walking routing service could not calculate this route.');
 const data = await response.json();
 const primary = parseTrip(data.trip);
 if (!primary) throw Error('No walking route found.');
 const alternates = (data.alternates ?? []).slice(0,maxWalkingRoutes - 1);
 return distinctRoutes([primary,...alternates.map(option=>parseTrip(option.trip)).filter(Boolean)]);
}
function distinctRoutes(routes) {
 const seen = new Set();
 const distinct = [];
 for (const route of routes) {
  const key = JSON.stringify(route.path);
  if (seen.has(key)) continue;
  seen.add(key);
  distinct.push(route);
  if (distinct.length === maxWalkingRoutes) break;
 }
 return distinct;
}
function parseTrip(trip) {
 const shape = trip?.legs?.[0]?.shape;
 if (!shape || !Number.isFinite(trip.summary?.time) || !Number.isFinite(trip.summary?.length)) return null;
 const path = typeof shape === 'string' ? decodePolyline6(shape) : shape.coordinates;
 if (!path || path.length < 2) return null;
 return {
  path, minutes:Math.round(trip.summary.time/60), miles:trip.summary.length,
  maneuvers:trip.legs.flatMap(leg=>leg.maneuvers ?? []), crossings:null,
 };
}
function renderDirections(maneuvers) {
 const list = $('directions');
 list.replaceChildren();
 for (const [index, maneuver] of maneuvers.entries()) {
  const item = document.createElement('li');
  const number = document.createElement('span');
  number.className = 'step-number';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = index + 1;
  const instruction = document.createElement('span');
  instruction.className = 'step-instruction';
  instruction.textContent = maneuver.instruction || 'Continue walking';
  item.append(number, instruction);
  list.append(item);
 }
}
function updateResult(route) {
 const { crossings } = route;
 $('minutes').textContent=route.minutes;
 $('distance').textContent=`${route.miles.toFixed(2)} mi`;
 $('count').textContent=crossings?.length ?? '—';
 const avg=routeScore(crossings);
 $('route-score-label').textContent=avg.demo ? 'DEMO SCORE' : 'SCORE';
 const scoreDescription = avg.value === null ? 'Route score unavailable' : `${avg.demo ? 'Demo route score' : 'Route score'} ${avg.value} out of 100`;
 $('route-score').setAttribute('aria-label', `${scoreDescription}. Open route crossing score`);
 $('map-demo-label').hidden=!avg.demo;
 $('overall').textContent=avg.value ?? '—';
 $('overall').className = avg.value === null ? '' : `score-text-${scoreColor(avg.value)}`;
 $('overall').title=avg.demo ? 'Demo score includes simulated values'
  : avg.covered ? `Verified scores for ${avg.covered} of ${avg.total} matched crossings` : 'No crossing scores available';
 if (state.detail === 'score-sheet') renderScoreInventory(route);
}
async function loadScoredCrossings(){
 try{const r=await fetch(new URL('../data/crossings.json',import.meta.url),{cache:'no-cache'});if(!r.ok)throw Error();const json=await r.json();return Array.isArray(json)?json:[];}catch{return []}
}
function matchScore(c,items){
 const identified=items.find(x=>x.osmType===c.osmType&&String(x.osmId)===String(c.osmId));
 const nearby=items.filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)&&distance([c.lon,c.lat],[x.longitude,x.latitude])<8).sort((a,b)=>distance([c.lon,c.lat],[a.longitude,a.latitude])-distance([c.lon,c.lat],[b.longitude,b.latitude]))[0];
 const candidate=identified||nearby;
 // Only source-backed, manually reviewed values qualify as research scores.
 return candidate?.reviewed===true&&typeof candidate.source==='string'&&candidate.source.trim()&&Number.isFinite(candidate.safetyScore)&&candidate.safetyScore>=0&&candidate.safetyScore<=100?candidate:null;
}
let crossingInventory;
function loadCrossingInventory() {
 crossingInventory ??= fetch(new URL('../data/bedford-crossings.json', import.meta.url))
  .then(response => {
   if (!response.ok) throw Error('Bedford crossing data is temporarily unavailable.');
   return response.json();
  })
  .catch(error => {
   crossingInventory = undefined;
   throw error;
  });
 return crossingInventory;
}
async function queryCrossings(bbox) {
 const [south, west, north, east] = bbox;
 if (north-south>0.08||east-west>0.12) throw Error('The route is too long to retrieve crossings in one request.');
 const box = `(${bbox.map(coordinate => coordinate.toFixed(6)).join(',')})`;
 const query = `[out:json][timeout:22];(node["highway"="crossing"]${box};way["highway"="crossing"]${box};way["footway"="crossing"]${box};);out center;`;
 const r = await fetch(overpassEndpoint, {method:'POST', body:new URLSearchParams({data:query})});
 if (!r.ok) throw Error('Crosswalk map service is temporarily unavailable.');
 const data = await r.json();
 if (data.remark || !Array.isArray(data.elements)) throw Error('Crosswalk map service returned incomplete results.');
 return data.elements.map(n => ({
  osmType:n.type, osmId:n.id, lon:n.lon??n.center?.lon, lat:n.lat??n.center?.lat,
  name:n.tags?.name, roadNames:n.tags?.['addr:street'] ? [n.tags['addr:street']] : [],
 }));
}
function demoCrossingScore(crossing) {
 const key = `${crossing.osmType}:${crossing.osmId}`;
 let hash = 2166136261;
 for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
 return (hash >>> 0) % 101;
}
function routeScore(crossings) {
 return {...averageScores(crossings ?? []), demo:crossings?.some(crossing=>crossing.demo) ?? false};
}
async function loadCrossings(path){
 const bbox = bounds(path);
 const inventory = await loadCrossingInventory().catch(() => null);
 const insideInventory = inventory && bbox.every((edge, index) =>
  index < 2 ? edge >= inventory.bounds[index] : edge <= inventory.bounds[index]);
 const records = insideInventory ? inventory.crossings : await queryCrossings(bbox);
 const candidates = records
  .map(c => ({...c, ...projectToRoute([c.lon,c.lat],path)}))
  .filter(c => c.meters <= crossingMatchMeters)
  .sort((a,b) => a.meters - b.meters);
 // Remove duplicate representations of the same physical crossing.
 const unique=[];
 for(const c of candidates){if(!unique.some(x=>distance([x.lon,x.lat],[c.lon,c.lat])<8))unique.push(c);}
 return unique.sort((a,b)=>a.position-b.position).map(c=>{
  const reviewed = matchScore(c,state.crossingScores);
  const score = reviewed?.safetyScore ?? demoCrossingScore(c);
  return {...c,name:c.name||'Mapped crossing',score,color:scoreColor(score),demo:!reviewed,verifiedSource:reviewed?.source};
 });
}
function renderCrossings(crossings, route = state.route) {
 clearMarkers(state.markers);
 for (const crossing of crossings) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = crossing.demo ? 'map-crossing map-crossing--demo' : 'map-crossing';
  button.setAttribute('aria-label', `${crossingTitle(crossing, route)}. ${crossing.demo ? 'Demo' : 'Research'} score ${crossing.score}. Open crossing evidence`);
  const dot = document.createElement('span');
  dot.className = crossing.color;
  dot.textContent = crossing.score;
  button.append(dot);
  button.addEventListener('click',event=>{
   event.stopPropagation();
   showCrossingEvidence(crossing,button,route);
  });
  const marker = new maplibregl.Marker({element:button,anchor:'center'})
   .setLngLat([crossing.lon,crossing.lat]).addTo(state.map);
  state.markers.push(marker);
 }
}
async function loadRouteCrossings(route) {
 route.crossingRequest ??= loadCrossings(route.path).then(crossings => {
  route.crossings = crossings;
 }).catch(() => {
  route.crossingRequest = undefined;
 });
 await route.crossingRequest;
}
function showSelectedRoute() {
 const route = state.route;
 $('route-destination').textContent=state.routeNames[1];
 $('route-estimate').textContent=`Walking · ${route.minutes} min · ${route.miles.toFixed(2)} mi`;
 $('maneuver-text').textContent=route.maneuvers.find(step=>step.instruction)?.instruction || 'Follow the walking route';
 renderCrossings(route.crossings ?? []);
 updateResult(route);
 renderDirections(route.maneuvers);
}
async function selectRoute(route) {
 state.route=route;
 showSelectedRoute();
 renderLine(route);
 await loadRouteCrossings(route);
 if (state.route === route) {
  if (state.detail !== 'comparison-sheet') renderCrossings(route.crossings ?? []);
  updateResult(route);
 }
}
function crossingTitle(crossing, route) {
 const roads = crossing.roadNames ?? [];
 if (roads.length === 1) return `Crosses ${roads[0]}`;
 if (roads.length > 1) return `At ${roads.join(' and ')}`;
 if (crossing.name !== 'Mapped crossing') return crossing.name;
 const segment = route.maneuvers.find(step =>
  step.begin_shape_index <= crossing.position && crossing.position <= step.end_shape_index
  && step.street_names?.length);
 return segment ? `Near ${segment.street_names[0]}` : 'Mapped pedestrian crossing';
}
let crossingEvidenceTrigger;
let evidenceCrossing;
function showCrossingEvidence(crossing, trigger, route = state.route) {
 crossingEvidenceTrigger = trigger;
 evidenceCrossing = crossing;
 $('nav-simulate').removeAttribute('aria-disabled');
 $('nav-simulate').removeAttribute('title');
 $('evidence-title').textContent = crossingTitle(crossing, route);
 $('evidence-score-label').textContent = crossing.demo ? 'Demo crosswalk score' : 'Crosswalk score';
 $('evidence-score').textContent = crossing.score;
 const meter = $('evidence-meter');
 meter.className = `evidence-meter evidence-meter--${crossing.color}`;
 meter.style.setProperty('--evidence-score', `${crossing.score}%`);
 $('evidence-score-note').textContent = crossing.demo
  ? 'This demo score is generated from the mapped crossing ID to illustrate the app. It does not use the factors below or measure crossing safety.'
  : `Reviewed research score. Source: ${crossing.verifiedSource}`;
 const roads = crossing.roadNames ?? [];
 const laneText = crossing.lanes ? ` · ${crossing.lanes} mapped ${crossing.lanes === 1 ? 'lane' : 'lanes'}` : '';
 $('evidence-road').textContent = roads.length ? roads.join(' and ') + laneText : 'Crossed road not identified in map data';
 $('evidence-protection').textContent = crossing.features?.join(' · ') || 'No features recorded in map data';
 $('evidence-source').href = `https://www.openstreetmap.org/${crossing.osmType}/${crossing.osmId}`;
 const evidence = $('crossing-evidence');
 evidence.hidden = false;
 document.querySelector('.app').dataset.crossingEvidence = 'open';
 evidence.scrollTop = 0;
 $('evidence-title').focus({preventScroll:true});
}
function closeCrossingEvidence(restoreFocus = false) {
 closeScenarioExplorer(false);
 $('crossing-evidence').hidden = true;
 $('nav-simulate').setAttribute('aria-disabled','true');
 $('nav-simulate').title = 'Open a crossing to simulate treatments';
 evidenceCrossing = undefined;
 delete document.querySelector('.app').dataset.crossingEvidence;
 if (restoreFocus) {
  state.map?.resize();
  const fallback = state.detail === 'score-sheet' ? $('score-heading') : $('nav-routes');
  (crossingEvidenceTrigger?.isConnected ? crossingEvidenceTrigger : fallback).focus({preventScroll:true});
 }
 crossingEvidenceTrigger = undefined;
}
function showScenarioExplorer() {
 if (!evidenceCrossing || !$('scenario-explorer').hidden) return;
 const panel = $('scenario-explorer');
 $('crossing-evidence').hidden = true;
 panel.hidden = false;
 panel.scrollTop = 0;
 for (const id of ['nav-map', 'nav-routes']) $(id).removeAttribute('aria-current');
 $('nav-simulate').setAttribute('aria-current','page');
 renderScenarioExplorer(panel, evidenceCrossing, $('evidence-title').textContent, closeScenarioExplorer);
}
function closeScenarioExplorer(returnToEvidence = true) {
 const panel = $('scenario-explorer');
 if (panel.hidden) return;
 panel.hidden = true;
 $('nav-simulate').removeAttribute('aria-current');
 const view = document.querySelector('.app').dataset.view;
 $(view === 'route' ? 'nav-routes' : 'nav-map').setAttribute('aria-current','page');
 if (returnToEvidence) {
  $('crossing-evidence').hidden = false;
  $('simulate-crossing').focus({preventScroll:true});
 }
}
function renderScoreInventory(route) {
 const { crossings } = route;
 const { value, demo, total } = routeScore(crossings);
 const score = $('score-sheet-value');
 score.textContent=value ?? '—';
 score.className=value === null ? '' : `score-text-${scoreColor(value)}`;
 const summary = $('score-sheet-summary');
 if (total) {
  const count = total === 1 ? '1 crossing' : `${total} crossings`;
  summary.textContent=demo ? `Demo average across ${count}. Simulated scores do not measure crossing safety.` : `Average across ${count}`;
 } else {
  summary.textContent=crossings ? 'No mapped crossings matched this route.'
   : route.crossingRequest ? 'Loading crossings…' : 'Crossing data is unavailable for this route.';
 }
 renderCrossingRows($('route-crossing-inventory'), crossings ?? [],
  crossing=>crossingTitle(crossing,route), showCrossingEvidence);
}
let comparisonPreview;
const comparisonHitLayer = 'comparison-route-hit-target';

function renderComparison() {
 $('comparison-demo-label').hidden = !state.routes.some(route=>routeScore(route.crossings).demo);
 const comparisonStatus = $('comparison-status');
 comparisonStatus.hidden = state.routes.length > 1;
 comparisonStatus.textContent = 'No alternate walking routes were returned for these addresses.';
 for (let index = 0; index < maxWalkingRoutes; index++) {
  const option = $('route-option-' + index);
  const route = state.routes[index];
  option.hidden = !route;
  if (!route) continue;
  const selected = route === state.route;
  const { value, covered, total, demo } = routeScore(route.crossings);
  const street = [...route.maneuvers].sort((a,b)=>(b.length ?? 0)-(a.length ?? 0))
   .find(step=>step.street_names?.length)?.street_names[0];
  const score = option.querySelector('.option-score');
  score.textContent = value ?? '—';
  score.className = `option-score ${scoreColor(value)}`;
  score.title = demo ? 'Demo score includes simulated values' : value === null ? 'No crossing score available' : `Verified scores for ${covered} of ${total} matched crossings`;
  score.setAttribute('aria-label', score.title);
  option.setAttribute('aria-pressed', String(selected));
  option.toggleAttribute('data-previewed', route === comparisonPreview);
  option.querySelector('.option-selected').textContent = selected ? 'Selected' : 'Preview';
  option.querySelector('strong').textContent = `${route.minutes} min · ${route.miles.toFixed(2)} mi`;
  option.querySelector('small').textContent = street ? `Via ${street}` : `Route ${index + 1}`;
  option.querySelector('.option-demo').hidden = !demo;
  const coverage = route.walkingGeometry.mappedPercent;
  option.querySelector('.option-footways').textContent = coverage === null
   ? 'Mapped path coverage unavailable'
   : `${coverage}% matches mapped paths`;
 }
}
function alternativePaths(route) {
 return state.routes.filter(option=>option!==route).map(option=>option.path);
}
function previewComparison(route) {
 if (state.detail !== 'comparison-sheet' || !route || route === comparisonPreview) return;
 comparisonPreview = route;
 drawRoutes(route, alternativePaths(route));
 renderCrossings(route.crossings ?? [], route);
 renderComparison();
}
async function showComparison() {
 const routes = state.routes;
 showRouteDetails('comparison-sheet');
 state.map.getSource(comparisonHitLayer)?.setData({
  type:'FeatureCollection', features:routes.map((route,index)=>lineFeature(route.path,{index})),
 });
 previewComparison(state.route);
 renderLine(state.route, {overview:true, alternatives:alternativePaths(state.route)});
 await Promise.all(routes.map(async route=>{
  await loadRouteCrossings(route);
  if (state.routes !== routes || state.detail !== 'comparison-sheet') return;
  if (route === comparisonPreview) renderCrossings(route.crossings ?? [], route);
  renderComparison();
 }));
}
async function chooseRoute(index) {
 const choice = state.routes[index];
 if (!choice) return;
 showRouteDetails();
 status('');
 await selectRoute(choice);
}
async function calculate(){
 if($('find').disabled || !mapReady())return;
 if(!$('to').value.trim()){status('Enter a destination.',true);$('to').focus();return;}
 setBusy(true);status('Looking up places and calculating a pedestrian route…');
 try{
  const from=await resolvePlace($('from').value);
  const to=await resolvePlace($('to').value);
  if(distance(from,to)<40)throw Error('Starting point and destination are too close.');
  const fromLabel = $('from').value.replace(/, Bedford, MA$/i,'');
  const toLabel = $('to').value.replace(/, Bedford, MA$/i,'');
  state.routes=await requestWalkingRoute(from,to);
  state.routeNames=[fromLabel,toLabel];
  showRouteDetails();
  setView('route');
  routeMarkers(from,to);
  status('');
  await selectRoute(state.routes[0]);
 }catch(e){status(e.message||'Could not calculate the route.',true);}
 finally{setBusy(false);}
}
function setView(view) {
 closeCrossingEvidence();
 const navigating = view === 'route';
 document.querySelector('.app').dataset.view = view;
 document.querySelector('.route-top').hidden = !navigating;
 document.querySelector('.results').hidden = !navigating;
 $('locate').setAttribute('aria-label', navigating ? 'Recenter walking route' : 'Recenter on location');
 const map = $('nav-map');
 const routes = $('nav-routes');
 for (const [button, active, icon] of [[map,!navigating,'map'],[routes,navigating,'routes']]) {
  if (active) button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
  button.querySelector('img').src=figmaIcon(active ? `${icon}-active` : icon);
 }
 state.map?.resize();
}
function showRouteDetails(id) {
 if (state.detail === 'comparison-sheet' && id !== 'comparison-sheet') {
  comparisonPreview = undefined;
  state.map.getSource(comparisonHitLayer)?.setData({type:'FeatureCollection',features:[]});
  state.map.getCanvas().style.cursor = '';
 }
 state.detail=id;
 document.querySelector('.app').dataset.routeDetail = id ?? '';
 const stepsVisible = id === 'steps-details';
 const comparisonVisible = id === 'comparison-sheet';
 const scoreVisible = id === 'score-sheet';
 $('steps-details').hidden = !stepsVisible;
 $('comparison-sheet').hidden = !comparisonVisible;
 $('score-sheet').hidden = !scoreVisible;
 $('route-score').setAttribute('aria-expanded', String(scoreVisible));
 $('compare-routes').setAttribute('aria-expanded', String(comparisonVisible));
 $('back').setAttribute('aria-label', id ? 'Back to route overview' : 'Back to route planner');
 for (const trigger of ['next-step', 'show-steps']) {
  $(trigger).setAttribute('aria-expanded', String(stepsVisible));
 }
 if (stepsVisible) {
  $('route-destination').textContent='Walking directions';
  $('route-estimate').textContent='';
  $('steps-details').scrollTop = 0;
  $('steps-heading').focus({preventScroll:true});
 }
 if (scoreVisible) {
  $('route-destination').textContent='Route crossing score';
  $('route-estimate').textContent=state.routeNames.join(' → ');
  renderScoreInventory(state.route);
  $('score-sheet').scrollTop=0;
  $('score-heading').focus({preventScroll:true});
 }
 if (comparisonVisible) {
  $('route-destination').textContent='Choose a walking route';
  $('route-estimate').textContent=state.routeNames.join(' → ');
  $('comparison-heading').focus({preventScroll:true});
 }
}
function showPlanner() {
 showRouteDetails();
 status('');
 setView('planner');
 if (state.route) {
  renderCrossings(state.route.crossings ?? []);
  renderLine(state.route, {overview:true});
 }
}
function showNavigation() {
 if (!state.route) {
  status('Plan a walking route to see directions.');
  $('from').focus();
  return;
 }
 showRouteDetails();
 setView('route');
 showSelectedRoute();
 renderLine(state.route);
}
function initializeMap(){
 if(typeof maplibregl==='undefined'){$('map-loader').textContent='MapLibre could not load. Check your connection.';status('Map JavaScript failed to load.',true);return;}
 const map=new maplibregl.Map({container:'map',style:mapStyle,center:coords,zoom:14,attributionControl:false});state.map=map;
 map.on('load',()=>{
  state.loaded=true;$('map-loader')?.remove();
  for (const layer of ['road_path_pedestrian','bridge_path_pedestrian','tunnel_path_pedestrian']) {
   if (!map.getLayer(layer)) continue;
   map.setPaintProperty(layer,'line-color','#627b72');
   map.setPaintProperty(layer,'line-width',['interpolate',['linear'],['zoom'],14,0.8,18,2.2,20,4]);
  }
  map.addSource('alternate-routes',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'alternate-route-lines',type:'line',source:'alternate-routes',paint:{'line-color':'#7898a7','line-width':4,'line-dasharray':[2,2]},layout:{'line-cap':'round','line-join':'round'}});
  map.addSource('walking-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  const matched = ['==',['get','mapped'],true];
  const unmatched = ['==',['get','mapped'],false];
  const lineLayout = {'line-cap':'round','line-join':'round'};
  map.addLayer({id:'route-outline',type:'line',source:'walking-route',
   paint:{'line-color':'#fff','line-width':7},layout:lineLayout});
  map.addLayer({id:'walking-route',type:'line',source:'walking-route',filter:matched,
   paint:{'line-color':'#0c7890','line-width':4},layout:lineLayout});
  map.addLayer({id:'walking-route-approximate',type:'line',source:'walking-route',filter:unmatched,
   paint:{'line-color':'#52667a','line-width':4},layout:lineLayout});
  map.addSource(comparisonHitLayer,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:comparisonHitLayer,type:'line',source:comparisonHitLayer,
   paint:{'line-color':'#000','line-opacity':0,'line-width':18},
   layout:{'line-cap':'round','line-join':'round'}});
  map.on('mousemove',comparisonHitLayer,event=>{
   if (state.detail !== 'comparison-sheet' || !event.features?.length) return;
   map.getCanvas().style.cursor = 'pointer';
   const routes = event.features.map(feature=>state.routes[feature.properties.index]);
   // Shared segments keep the current preview until the pointer reaches a distinct route.
   if (!routes.includes(comparisonPreview)) previewComparison(routes[0]);
  });
  map.on('mouseleave',comparisonHitLayer,()=>{map.getCanvas().style.cursor = '';});
 });
 map.on('error',e=>{if(!state.loaded) $('map-loader').textContent='Map tiles unavailable. Check network or map provider.';console.error('MapLibre:',e.error?.message||e);});
 $('zoom-in').addEventListener('click',()=>map.zoomIn());$('zoom-out').addEventListener('click',()=>map.zoomOut());
}
$('evidence-back').addEventListener('click',()=>closeCrossingEvidence(true));
$('simulate-crossing').addEventListener('click',showScenarioExplorer);
$('nav-simulate').addEventListener('click',showScenarioExplorer);
$('gps').addEventListener('click',locate);
$('locate').addEventListener('click',()=>{
 if (state.route && document.querySelector('.app').dataset.view === 'route') {
  if (state.detail === 'comparison-sheet') {
   const route = comparisonPreview ?? state.route;
   renderLine(route, {overview:true,alternatives:alternativePaths(route)});
  } else {
   if (state.detail) closeRouteDetails();
   focusWalkingStart(state.route.path);
  }
 } else if (state.gps) {
  state.map?.flyTo({center:state.gps,zoom:16});
 } else {
  locate();
 }
});
$('find').addEventListener('click',calculate);
$('swap').addEventListener('click',()=>{
 const from = $('from');
 const to = $('to');
 from.blur();
 to.blur();
 [from.value, to.value] = [to.value, from.value];
 saveDirections();
});
$('back').addEventListener('click',()=>state.detail ? closeRouteDetails() : showPlanner());
$('nav-map').addEventListener('click',showPlanner);
$('nav-routes').addEventListener('click',showNavigation);
for (const id of ['next-step','show-steps']) $(id).addEventListener('click',()=>showRouteDetails('steps-details'));
function closeRouteDetails() {
 const detail = state.detail;
 showRouteDetails();
 showSelectedRoute();
 if (detail === 'comparison-sheet') renderLine(state.route);
 const trigger = {'steps-details':'show-steps', 'comparison-sheet':'compare-routes', 'score-sheet':'route-score'}[detail];
 $(trigger).focus({preventScroll:true});
}
$('route-score').addEventListener('click',()=>showRouteDetails('score-sheet'));
$('compare-routes').addEventListener('click',showComparison);
for (let index = 0; index < maxWalkingRoutes; index++) {
 const option = $('route-option-' + index);
 option.addEventListener('pointerenter',event=>{
  if (event.pointerType !== 'touch') previewComparison(state.routes[index]);
 });
 option.addEventListener('focus',()=>previewComparison(state.routes[index]));
 option.addEventListener('click',()=>chooseRoute(index));
}
for (const id of ['info','nav-sources']) $(id).addEventListener('click',()=>$('sources-dialog').showModal());
restoreDirections();
for (const field of routeFields) {
 const input = $(field);
 input.addEventListener('input',saveDirections);
 input.addEventListener('change',saveDirections);
 attachAddressLookup(input, $(`${field}-suggestions`), $(`${field}-lookup-status`));
 $(`clear-${field}`).addEventListener('click',()=>{
  input.value='';
  input.dispatchEvent(new Event('input', {bubbles:true}));
  input.focus();
 });
}
$('from').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.defaultPrevented&&!e.isComposing){e.preventDefault();$('to').focus();}});
$('to').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.defaultPrevented&&!e.isComposing){e.preventDefault();calculate();}});
state.crossingScores=await loadScoredCrossings();
initializeMap();
