export const radians=x=>x*Math.PI/180;
export function distance(a,b){const lat1=radians(a[1]),lat2=radians(b[1]),dLat=lat2-lat1,dLon=radians(b[0]-a[0]);const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));}
export function initialRouteBearing(path, lookAheadMeters = 20) {
  const [start] = path;
  if (!start) return 0;
  let remaining = lookAheadMeters;
  let target = start;
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const meters = distance(from, to);
    if (!meters) continue;
    if (meters >= remaining) {
      const fraction = remaining / meters;
      target = from.map((coordinate, axis) => coordinate + fraction * (to[axis] - coordinate));
      break;
    }
    remaining -= meters;
    target = to;
  }
  const latitude = radians(start[1]);
  const targetLatitude = radians(target[1]);
  const longitudeDelta = radians(target[0] - start[0]);
  const east = Math.sin(longitudeDelta) * Math.cos(targetLatitude);
  const north = Math.cos(latitude) * Math.sin(targetLatitude)
    - Math.sin(latitude) * Math.cos(targetLatitude) * Math.cos(longitudeDelta);
  return Math.atan2(east, north) * 180 / Math.PI;
}
export function projectToRoute(point, path) {
  const latitude = radians(point[1]);
  const xy = ([lon, lat]) => [
    radians(lon - point[0]) * Math.cos(latitude) * 6371000,
    radians(lat - point[1]) * 6371000,
  ];
  let meters = Infinity;
  let position = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = xy(path[i - 1]);
    const [bx, by] = xy(path[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const candidate = Math.hypot(ax + fraction * dx, ay + fraction * dy);
    if (candidate < meters) {
      meters = candidate;
      position = i - 1 + fraction;
    }
  }
  return { meters, position };
}
export function nearRoute(point, path) {
  return projectToRoute(point, path).meters;
}
export function crossingsAlongPath(records, path, maxMeters) {
  const unique = new Map();
  for (const record of records) {
    if (!Number.isFinite(record.lon) || !Number.isFinite(record.lat)) continue;
    const id = `${record.osmType}:${record.osmId}`;
    if (unique.has(id)) continue;
    const projection = projectToRoute([record.lon, record.lat], path);
    if (projection.meters <= maxMeters) unique.set(id, { ...record, ...projection });
  }
  return Array.from(unique.values()).sort((a, b) => a.position - b.position);
}
export function bounds(path,pad=.0006){return [Math.min(...path.map(x=>x[1]))-pad,Math.min(...path.map(x=>x[0]))-pad,Math.max(...path.map(x=>x[1]))+pad,Math.max(...path.map(x=>x[0]))+pad];}
export function decodePolyline6(shape){let lat=0,lon=0,index=0;const out=[];function num(){let r=0,shift=0,byte;do{byte=shape.charCodeAt(index++)-63;r|=(byte&31)<<shift;shift+=5;}while(byte>=32&&index<shape.length);return r&1?~(r>>1):r>>1;}while(index<shape.length){lat+=num();lon+=num();out.push([lon/1e6,lat/1e6]);}return out;}
export function scoreColor(n){if(!Number.isFinite(n)||n<0||n>100)return'unscored';return n<50?'red':n<80?'orange':'green';}
export function averageScores(cs){const ok=cs.filter(c=>Number.isFinite(c.score)&&c.score>=0&&c.score<=100);return{value:ok.length?Math.round(ok.reduce((s,c)=>s+c.score,0)/ok.length):null,covered:ok.length,total:cs.length};}