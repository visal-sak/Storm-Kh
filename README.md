# Storm-Kh

# 🌀 StormWatch Kampuchea · ប្រព័ន្ធតាមដានព្យុះ

A live tropical-cyclone and weather monitor for Cambodia. It tracks all 25 first-level
divisions — the 24 provinces plus Phnom Penh — alongside five offshore "sentinel" points
in the South China Sea and Gulf of Thailand, the corridors typhoons actually use to reach
Cambodia.

Built with **React 19 + Vite + TypeScript**, **Tailwind CSS v4**, shadcn-style UI, and
**[terrae](https://terrae.dev)** map components running on **MapLibre GL** — no map token
needed.

## What it shows

- **25 provinces**, each with live temperature, wind, gusts, pressure, present weather and
  US AQI.
- **Live weather on the map** — animated rain where rain is reported, and lightning where
  the WMO present-weather code is a thunderstorm (95/96/99).
- **Real cyclone tracks** from the operational warning centres, drawn from observed fixes,
  plus a 24-hour extrapolation of the current heading.
- **Khmer-first alerts** — headline, distance and wind in Khmer with Khmer numerals,
  English as a subtitle.
- **Hour-by-hour rain, cloud and thunder** for the current day, averaged nationally.
- **Storms that reached Cambodia** — every cyclone in the track record whose observed path
  came within 500 km, replayable on the map.
- Light and dark themes, and your own position relative to the nearest monitored province.

## Data sources

Everything is fetched at runtime from the browser. No API keys, no environment variables.

| Source | Provides | Polled |
| --- | --- | --- |
| [Open-Meteo Forecast](https://open-meteo.com) | temperature, wind, gusts, pressure, precipitation, WMO code, CAPE, cloud cover, hourly series | 1 min |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | PM2.5, PM10, US AQI | 1 h |
| [NASA EONET v3](https://eonet.gsfc.nasa.gov/docs/v3) | cyclone name, designation, observed fixes, sustained winds | 15 min |
| [CARTO basemaps](https://carto.com/basemaps/) | positron / dark-matter tiles | static |

Each source has its own clock, matched to how often the upstream model actually changes —
polling faster just refetches identical numbers. Polling pauses while the tab is hidden.

Province coordinates, risk thresholds, and the WMO / US-EPA lookup tables are static: they
are geography and published standards, not observations.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # tsc -b && vite build
npm run lint       # oxlint
```

## How it works

```
src/
├── lib/
│   ├── storm.ts        # Stations, Open-Meteo fetch, risk scoring, present weather,
│   │                   #   hourly slices, air quality, great-circle geometry
│   ├── cyclones.ts     # NASA EONET tracks, basin filter, staleness, heading/motion
│   ├── alert.ts        # Khmer-first alert ladder (advisory / watch / warning)
│   ├── provinces.ts    # The 25 first-level divisions
│   ├── polling.ts      # Per-source intervals, visibility pause, reduced-motion
│   ├── theme.tsx       # Light-first theme provider
│   └── geolocation.ts  # Browser position, permission-aware
├── components/
│   ├── map/            # terrae components (vendored — see below)
│   ├── ui/             # shadcn-style primitives
│   ├── StormMap.tsx    # Map composition: provinces, rain, lightning, tracks
│   ├── CycloneAlertBanner.tsx
│   ├── CycloneHistory.tsx
│   └── HourlyToday.tsx
└── App.tsx
```

**Risk scoring** (`assessStation`): each province is scored on 24-hour max gusts,
sea-level pressure and 24-hour rainfall, loosely following tropical-storm classification.

**Cyclone status** comes from the track feed, not inference. `approaching` is true when the
last two reported fixes moved the system closer to Cambodia.

**Replay mode** animates a real past cyclone's observed track — pick one from the history
list — so the visualisation has something true to show on a calm day.

## Notes on the terrae components

The official install is:

```bash
npx shadcn@latest add https://www.terrae.dev/map.json
npx shadcn@latest add https://www.terrae.dev/cyclone.json
npx shadcn@latest add https://www.terrae.dev/lightning.json
```

They are vendored into `src/components/map/` with a few patches so they run outside
Next.js on MapLibre:

1. `map-library.ts` swaps Mapbox GL for **MapLibre GL**, and calls `setWorkerUrl` with
   Vite's bundled worker. MapLibre derives its worker path from its own module URL, which
   Vite's dependency optimiser rewrites into a directory that has no worker file — the
   request 404s, no vector tile is ever parsed, and the map hangs on its spinner forever.
   `optimizeDeps.exclude` covers dev; `setWorkerUrl` covers the production build.
2. The `next-themes` hook in `map.tsx` is wired to this app's own theme provider, so the
   basemap follows light/dark.
3. `lightning.tsx` gets a MapLibre type import in place of Mapbox's global namespace.

**`rain.json` is not used.** It drives `map.setRain()`, a Mapbox GL v3.9+ API MapLibre does
not implement, and it is a full-screen post-process — wrong for a dashboard that must show
rain over one province and not another. `src/components/map/rain.tsx` is a MapLibre
equivalent: a per-coordinate animated canvas sprite using the same `StyleImageInterface`
pattern as the cyclone.

## Caveats

This dashboard is educational and **not** an official warning system. For real emergencies
follow **MOWRAM** (Ministry of Water Resources and Meteorology) and **NCDM** (National
Committee for Disaster Management).

Two limits worth knowing:

- EONET publishes fixes roughly every 6 hours and leaves events open after a system was
  last reported. A fix older than 18 hours is marked **stale**: it cannot raise an alert,
  draw a heading, or be labelled a current position.
- The projected heading is a straight-line extrapolation from the last two fixes. Real
  cyclones recurve; only a warning centre issues genuine forecast tracks.
- No cyclone in EONET's recent record has a reported fix inside Cambodian territory —
  systems that reach Cambodia have usually weakened below the threshold at which centres
  keep issuing fixes. The history list therefore reports **closest approach**, not
  "crossed".
