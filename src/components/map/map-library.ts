import * as maplibregl from "maplibre-gl"
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import "maplibre-gl/dist/maplibre-gl.css"

// maplibre-gl derives its worker URL from `import.meta.url`, which points at
// Vite's pre-bundled copy in .vite/deps — a directory that has no worker file.
// The request 404s, no vector tile ever gets parsed, and the map hangs on its
// loading spinner forever. Handing Vite's own bundled worker URL to maplibre
// fixes it in both dev and production builds.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

export type MapLibraryName = "mapbox" | "maplibre"

const detectedLibrary: MapLibraryName = "maplibre"

const mapgl = maplibregl

export { mapgl, detectedLibrary }
