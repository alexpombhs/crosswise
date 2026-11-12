import { distance, nearRoute, bounds, decodePolyline6, scoreColor, averageScores } from './geo.js';

const $ = id => document.getElementById(id);
const state = { map:null, gps:null, gpsWatch:null, markers:[], endpoints:[], route:null, crossingScores:[], cachedGeocodes:new Map(), lastGeocode:0, loaded:false };
const coords = [-71.2748, 42.4903]; // Bedford, MA approximate initial viewport; not a crosswalk location.
const mapStyle = 'https://tiles.openfreemap.org/styles/liberty';
const routeEndpoint = 'https://valhalla1.openstreetmap.de/route';
const geocodeEndpoint = 'https://nominatim.openstreetmap.org/search';
const overpassEndpoint = 'https://overpass-api.de/api/interpreter';
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setBusy(b){$('find').disabled=b;$('find').innerHTML=b?'Finding walking route…':'Find walking route <span>→</span>';}
function mapReady(){if(state.map&&state.loaded)return true;status('Map is still loading. Check your connection.',true);return false;}
function coordPair(text){const m=text.trim().match(/^\s*([-+]?\d{1,2}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)\s*$/);if(!m)return null;const lat=Number(m[1]),lon=Number(m[2]);return Math.abs(lat)<=90&&Math.abs(lon)<=180?[lon,lat]:null;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function resolvePlace(text){
 const exact=coordPair(text);if(exact)return exact;
 const key=text.trim().toLowerCase();if(!key)throw Error('Please enter an address or place.');
 if(state.cachedGeocodes.has(key))return state.cachedGeocodes.get(key);
 await sleep(Math.max(0,1150-(Date.now()-state.lastGeocode)));state.lastGeocode=Date.now();
 // No autocomplete; geocoding happens on the explicit Find route action only.
 const url=new URL(geocodeEndpoint);url.searchParams.set('format','jsonv2');url.searchParams.set('limit','1');url.searchParams.set('countrycodes','us');url.searchParams.set('q',text.includes(',')?text:`${text}, Massachusetts, USA`);
 const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw Error('Address lookup is temporarily unavailable.');
 const items=await r.json();if(!items.length)throw Error(`Could not find “${text}”. Try a more specific address.`);
 const loc=[Number(items[0].lon),Number(items[0].lat)];state.cachedGeocodes.set(key,loc);return loc;
}
function markerElement(cls){const e=document.createElement('div');e.className=cls;return e;}
function clearMarkers(collection){for(const m of collection)m.remove();collection.length=0;}
function locate(){
 if(!('geolocation' in navigator)){status('Geolocation is unavailable in this browser.',true);return;}
 status('Requesting location permission…');
 if(state.gpsWatch!==null)navigator.geolocation.clearWatch(state.gpsWatch);
 state.gpsWatch=navigator.geolocation.watchPosition(position=>{
  state.gps=[position.coords.longitude,position.coords.latitude];$('from').value='Current location';
  if(state.gpsMarker)state.gpsMarker.setLngLat(state.gps);else if(state.map)state.gpsMarker=new maplibregl.Marker({element:markerElement('map-gps')}).setLngLat(state.gps).addTo(state.map);
  if(state.map)state.map.easeTo({center:state.gps,zoom:Math.max(15,state.map.getZoom()),duration:750});
  status('Current position acquired. Enter a destination and choose Find walking route.');
 },err=>{status(err.code===1?'Location access was denied. Enter a starting address instead.':'Could not determine your location. Try an address instead.',true);},{enableHighAccuracy:true,timeout:16000,maximumAge:10000});
}
function mapBounds(path){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const [x,y] of path){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return[[minX,minY],[maxX,maxY]];}
function renderLine(coordinates){
 if(!state.map.getSource('walking-route'))return;
 state.map.getSource('walking-route').setData({type:'Feature',geometry:{type:'LineString',coordinates},properties:{}});
 state.map.fitBounds(mapBounds(coordinates),{padding:{top:140,bottom:170,left:Math.min(390,window.innerWidth*.25),right:Math.min(370,window.innerWidth*.24)},maxZoom:17.5,duration:800});
}
function routeMarkers(origin,destination){
 clearMarkers(state.endpoints);
 state.endpoints.push(new maplibregl.Marker({element:markerElement('map-endpoint')}).setLngLat(origin).addTo(state.map));
 state.endpoints.push(new maplibregl.Marker({element:markerElement('map-endpoint end')}).setLngLat(destination).addTo(state.map));
}
async function requestWalkingRoute(origin,destination){
 const payload={locations:[{lat:origin[1],lon:origin[0]},{lat:destination[1],lon:destination[0]}],costing:'pedestrian',units:'miles',directions_type:'instructions',shape_format:'polyline6'};
 const r=await fetch(routeEndpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Client-Id':'crosswise-msef-prototype'},body:JSON.stringify(payload)});
 if(!r.ok)throw Error(r.status===429?'Walking route service is rate-limited. Try again later.':'Walking routing service could not calculate this route.');
 const data=await r.json();if(!data.trip?.legs?.length)throw Error('No walking route found.');
 const shape=data.trip.legs[0].shape;if(!shape)throw Error('Walking route geometry is missing.');
 const path=typeof shape==='string'?decodePolyline6(shape):shape.coordinates;
 if(!path||path.length<2)throw Error('No valid path was returned.');
 return{path,minutes:Math.round(data.trip.summary.time/60),miles:data.trip.summary.length,maneuvers:data.trip.legs.flatMap(l=>l.maneuvers||[])};
}
function renderDirections(maneuvers){$('directions').replaceChildren();for(const m of maneuvers){const li=document.createElement('li');li.textContent=m.instruction||'Continue walking';$('directions').append(li);}}
function updateResult(route,crossings){
 $('empty').hidden=true;$('route-result').hidden=false;
 $('minutes').textContent=route.minutes;$('distance').textContent=`${Number(route.miles).toFixed(2)} mi`;
 $('count').textContent=crossings.length;
 const avg=averageScores(crossings);$('overall').textContent=avg.value===null?'—':avg.value;
 const score=$('overall');score.style.color=avg.value===null?'#16384d':{red:'#c94c45',orange:'#c47d16',green:'#23845d'}[scoreColor(avg.value)];
 $('coverage').textContent=crossings.length?`${avg.covered} of ${avg.total} crossings have verified research scores. The average uses scored crossings only; missing scores are not zero.`:'No mapped crossing nodes were identified along this route. This does not mean the route has no crossings.';
 const list=$('crossing-list');list.replaceChildren();
 if(!crossings.length){const p=document.createElement('p');p.textContent='No crossing details available for this route.';list.append(p);}
 for(const c of crossings){
  const btn=document.createElement('button');btn.type='button';btn.className='crossing-item';const sc=scoreColor(c.score);const value=Number.isFinite(c.score)?String(c.score):'—';
  btn.innerHTML=`<span class="score-dot ${sc}">${value}</span><span><strong>${escapeHtml(c.name)}</strong><small>${Number.isFinite(c.score)?'Research score · '+c.score+'/100':'Crossing found in OpenStreetMap · not yet scored'}</small></span>`;
  btn.addEventListener('click',()=>{state.map.flyTo({center:[c.lon,c.lat],zoom:17.7});c.marker?.togglePopup();});list.append(btn);
 }
 renderDirections(route.maneuvers);
}
async function loadScoredCrossings(){
 try{const r=await fetch(new URL('../data/crossings.json',import.meta.url),{cache:'no-cache'});if(!r.ok)throw Error();const json=await r.json();return Array.isArray(json)?json:[];}catch{return []}
}
function matchScore(c,items){
 const identified=items.find(x=>x.osmType===c.osmType&&String(x.osmId)===String(c.osmId));
 const nearby=items.filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)&&distance([c.lon,c.lat],[x.longitude,x.latitude])<8).sort((a,b)=>distance([c.lon,c.lat],[a.longitude,a.latitude])-distance([c.lon,c.lat],[b.longitude,b.latitude]))[0];
 const candidate=identified||nearby;
 // Only source-backed, manually reviewed 0–100 scores are displayed. Missing is unknown.
 return candidate?.reviewed===true&&typeof candidate.source==='string'&&candidate.source.trim()&&Number.isFinite(candidate.safetyScore)&&candidate.safetyScore>=0&&candidate.safetyScore<=100?candidate.safetyScore:null;
}
async function loadCrossings(path){
 const bbox=bounds(path);const south=bbox[0],west=bbox[1],north=bbox[2],east=bbox[3];
 if(north-south>0.08||east-west>0.12)throw Error('The route is too long to retrieve crossings in one request.');
 const box=`(${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)})`;
 const query=`[out:json][timeout:22];(node["highway"="crossing"]${box};way["highway"="crossing"]${box};);out center;`;
 const r=await fetch(overpassEndpoint,{method:'POST',body:new URLSearchParams({data:query})});
 if(!r.ok)throw Error('Crosswalk map service is temporarily unavailable.');
 const data=await r.json();
 const candidates=(data.elements||[]).map(n=>({osmType:n.type,osmId:n.id,lon:n.lon??n.center?.lon,lat:n.lat??n.center?.lat,tags:n.tags||{}}))
  .filter(n=>Number.isFinite(n.lon)&&Number.isFinite(n.lat)&&nearRoute([n.lon,n.lat],path)<=20);
 // Remove duplicate representations of the same physical crossing.
 const unique=[];
 for(const c of candidates){if(!unique.some(x=>distance([x.lon,x.lat],[c.lon,c.lat])<8))unique.push(c);}
 return unique.slice(0,80).map(c=>({...c,name:c.tags.name||c.tags['addr:street']||'Marked crossing',score:matchScore(c,state.crossingScores)}));
}
function renderCrossings(crossings){
 clearMarkers(state.markers);
 for(const c of crossings){const e=document.createElement('button');e.type='button';e.className='map-crossing';e.title=Number.isFinite(c.score)?`Crossing score ${c.score}`:'Crossing · score not yet available';e.setAttribute('aria-label',e.title);
  const dot=document.createElement('span');dot.className=scoreColor(c.score);dot.textContent=Number.isFinite(c.score)?c.score:'—';e.append(dot);
  const popup=new maplibregl.Popup({offset:20,className:'crossing-popup'}).setHTML(`<b>${escapeHtml(c.name)}</b><small>${Number.isFinite(c.score)?'Research score: '+c.score+'/100':'Mapped OSM crossing — not yet scored'}.</small>`);
  c.marker=new maplibregl.Marker({element:e,anchor:'center'}).setLngLat([c.lon,c.lat]).setPopup(popup).addTo(state.map);
  state.markers.push(c.marker);
 }
}
async function refreshCrossings(){
 if(!state.route)return;
 $('refresh').disabled=true;$('coverage').textContent='Locating mapped crossings near your route…';
 try{const crossings=await loadCrossings(state.route.path);renderCrossings(crossings);updateResult(state.route,crossings);status(`Route ready. ${crossings.length} mapped crossing locations near the walking route.`);}
 catch(e){renderCrossings([]);updateResult(state.route,[]);$('coverage').textContent=`Unable to load crossing inventory: ${e.message} Score information is unavailable; walking directions still work.`;status('Walking route found, but crosswalk data could not be loaded.',true);}
 finally{$('refresh').disabled=false;}
}
async function calculate(){
 if(!mapReady())return;
 if(!$('to').value.trim()){status('Enter a destination.',true);$('to').focus();return;}
 setBusy(true);status('Looking up places and calculating a pedestrian route…');
 try{
  const from=($('from').value.trim().toLowerCase()==='current location'&&state.gps)?state.gps:await resolvePlace($('from').value);
  const to=await resolvePlace($('to').value);
  if(distance(from,to)<40)throw Error('Starting point and destination are too close.');
  const r=await requestWalkingRoute(from,to);state.route=r;renderLine(r.path);routeMarkers(from,to);renderCrossings([]);updateResult(r,[]);
  status('Walking route ready. Checking crosswalk locations…');await refreshCrossings();
 }catch(e){status(e.message||'Could not calculate the route.',true);}
 finally{setBusy(false);}
}
function clear(){
 if(state.gpsWatch!==null){navigator.geolocation.clearWatch(state.gpsWatch);state.gpsWatch=null;}state.gps=null;state.gpsMarker?.remove();state.gpsMarker=null;
 $('from').value='';$('to').value='';state.route=null;
 $('empty').hidden=false;$('route-result').hidden=true;
 clearMarkers(state.endpoints);clearMarkers(state.markers);
 state.map?.getSource('walking-route')?.setData({type:'Feature',geometry:{type:'LineString',coordinates:[]},properties:{}});
 state.map?.flyTo({center:coords,zoom:14,duration:600});status('Enter a destination to start.');
}
function initializeMap(){
 if(typeof maplibregl==='undefined'){$('map-loader').textContent='MapLibre could not load. Check your connection.';status('Map JavaScript failed to load.',true);return;}
 const map=new maplibregl.Map({container:'map',style:mapStyle,center:coords,zoom:14,attributionControl:true});state.map=map;
 map.on('load',()=>{
  state.loaded=true;$('map-loader')?.remove();
  map.addSource('walking-route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[]},properties:{}}});
  map.addLayer({id:'route-outline',type:'line',source:'walking-route',paint:{'line-color':'#ffffff','line-width':10,'line-opacity':.95},layout:{'line-cap':'round','line-join':'round'}});
  map.addLayer({id:'walking-route',type:'line',source:'walking-route',paint:{'line-color':'#0c7890','line-width':6},layout:{'line-cap':'round','line-join':'round'}});
 });
 map.on('error',e=>{if(!state.loaded) $('map-loader').textContent='Map tiles unavailable. Check network or map provider.';console.error('MapLibre:',e.error?.message||e);});
 $('zoom-in').addEventListener('click',()=>map.zoomIn());$('zoom-out').addEventListener('click',()=>map.zoomOut());
}
$('gps').addEventListener('click',locate);
$('locate').addEventListener('click',()=>{if(!state.gps)locate();else state.map?.flyTo({center:state.gps,zoom:16});});
$('find').addEventListener('click',calculate);$('clear').addEventListener('click',clear);
$('refresh').addEventListener('click',refreshCrossings);
$('from').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('to').focus();}});
$('to').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();calculate();}});
state.crossingScores=await loadScoredCrossings();
initializeMap();