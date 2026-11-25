# Crosswise — live walking-map prototype

An MSEF engineering research prototype for comparing the **estimated** pedestrian crossing conditions of routes in Bedford, Massachusetts.

## Features

- Real, pannable, zoomable map: **MapLibre GL JS + OpenFreeMap**, based on OpenStreetMap.
- **From / To** dropdowns for Bedford street addresses, with optional **Use my location** (browser GPS permission).
- A real pedestrian route with walking distance, time estimate, path line, and textual turn-by-turn steps from **Valhalla**.
- **OpenStreetMap crossings** matched within 3 meters of the walking route geometry. Bedford-area routes use a bundled snapshot.
- **0–100 crossing score** markers only for independently reviewed, source-backed data: red **0–49**, orange **50–79**, green **80–100**.
- Route score = **arithmetic mean of available crossing scores**, with coverage displayed. Unknown/missing crossing scores are *never* assigned zero or made-up values.

## Start locally

No build process or API key required for the proof-of-concept static site. Serve the directory over localhost:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. To test calculations: `node --test src/geo.test.mjs`.

**Important:** The services require internet access. GPS works only on secure contexts (`https://` or `localhost`) and only with permission. The application does not store or transmit GPS positions until a route is requested; after requesting a route, the start/destination coordinates are sent to the routing service.

## Install on a phone

Open the deployed HTTPS URL on your phone.

- **iPhone (Safari)** — Open the Share menu, choose **Add to Home Screen**, and tap **Add**.
- **Android (Chrome)** — Open the browser menu and choose **Install app** or **Add to Home screen**.

The installed app opens in its own window. Live maps and directions require an internet connection. A phone's localhost refers to the phone itself, so use the deployed HTTPS URL for installation on a phone.

## Data and scientific limitations

The file [`data/crossings.json`](data/crossings.json) starts empty **on purpose**. No crossing-level safety scores have been verified yet. Publicly mapped crossings render gray with `—`, not an invented numerical score. Once scoring is supported by methodology and site observations, add reviewed records, for example:

```json
[
  {
    "osmType": "node",
    "osmId": 123456789,
    "latitude": 42.49,
    "longitude": -71.27,
    "safetyScore": 75,
    "reviewed": true,
    "source": "Research dataset and analysis reference"
  }
]
```

**Example above is schema documentation only, not a Bedford crossing or a real score.** Use verified OSM IDs or independently checked coordinates. Do not include mock scores in production data. OSM coverage is incomplete; a missing crossing does not mean that the route has no crossings. Route matches use a 3-meter tolerance to account for differences between the route and mapped crossing coordinates. A geometric match alone cannot confirm that the route traverses a crossing. The arithmetic mean is an interface prototype, not a validated safety model or a crash probability. Routes are not certified safe; this does not substitute for street conditions or pedestrian judgment.

## Public services and fair use

| Feature | Provider | Notes |
|---|---|---|
| Basemap | [OpenFreeMap](https://openfreemap.org/) | Open map tiles, no API key |
| GPS | Browser Geolocation API | Explicit permission on user action |
| Address search | [MassGIS Master Address Points](https://www.mass.gov/info-details/massgis-data-master-address-data-basic-address-points) | Bundled Bedford municipality snapshot. The browser searches locally after loading it. |
| Pedestrian directions | [Valhalla public demo](https://valhalla.openstreetmap.de/) | Fair-use rate limits; needs a hosted routing provider for scaled production |
| Crossing coordinates | [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) | Bundled Bedford-area snapshot under ODbL. Routes outside the snapshot coverage use [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API). |

Public demo services are not guaranteed available or suitable for high-traffic deployment. For a permanent community site, configure an appropriate commercial/hosted, campus, or self-hosted geocoding/routing provider, use a rate-limited server proxy/cache, and arrange fair-use compliance. Keep OSM/tiles attribution visible on the map.

## Deployment

The included GitHub Actions workflow publishes this static site when changes reach `main`. In repository settings, select **GitHub Pages → Build and deployment → GitHub Actions**. Your published URL will normally be `https://alexpombhs.github.io/crosswise/` once deployment completes.