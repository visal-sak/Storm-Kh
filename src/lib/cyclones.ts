// ─────────────────────────────────────────────────────────────────
// StormWatch Kampuchea — tropical cyclone tracks
// Source: NASA EONET v3 (free, no API key, CORS-enabled)
// https://eonet.gsfc.nasa.gov/docs/v3
//
// EONET aggregates the operational warning centres (JTWC/NHC/JMA) into
// one feed. Each severe-storm event carries a chronological series of
// fixes — position plus sustained wind in knots — which is a real
// observed track, not an interpolation.
// ─────────────────────────────────────────────────────────────────

import {
  bearingDeg,
  compassPoint,
  destinationPoint,
  distanceKm,
  type Coordinates,
} from "./storm"

const EONET = "https://eonet.gsfc.nasa.gov/api/v3/events"

/** Rough centroid of the monitored area, used for all "how far away" maths. */
const CAMBODIA: Coordinates = [104.9, 12.5]

/**
 * Storms that can reach Cambodia come from the South China Sea, or far more
 * rarely the Gulf of Thailand. Atlantic and East-Pacific systems share the
 * same feed, so the basin window is what keeps a Gulf-of-Mexico hurricane out
 * of a Cambodian dashboard.
 */
const BASIN = { minLon: 92, maxLon: 145, minLat: -5, maxLat: 34 }

/** Cambodia's land extent, for deciding whether a fix was actually overhead. */
const CAMBODIA_BBOX = { minLon: 102.3, maxLon: 107.7, minLat: 10.3, maxLat: 14.8 }

/** How close a past storm had to come before it is worth replaying. */
const REPLAY_RADIUS_KM = 1400

const KNOTS_TO_KMH = 1.852

/**
 * Warning centres fix a live system every 6 hours. Past a day of silence the
 * position is history, not a current location, and must not be presented as one.
 */
const STALE_AFTER_HOURS = 18

export type CycloneFix = {
  coordinates: Coordinates
  /** Sustained wind in km/h; null when the feed omits a magnitude. */
  windKmh: number | null
  at: string
}

export type Cyclone = {
  id: string
  /** Feed title, e.g. "Typhoon Noul". */
  nameEn: string
  /** The storm's own name, e.g. "Noul" — the RSMC-assigned name. */
  shortName: string
  /** The warning centre's classification, e.g. "Super Typhoon". */
  designation: string
  /** The same classification in Khmer, for the alert banner. */
  designationKm: string
  /** Every reported fix, oldest first. */
  fixes: CycloneFix[]
  /** Just the coordinates, for drawing the track line. */
  track: Coordinates[]
  /** Latest reported position. */
  center: Coordinates
  /** Strongest wind seen anywhere along the track, km/h. */
  peakWindKmh: number | null
  /** Wind at the latest fix, km/h. */
  currentWindKmh: number | null
  /** ISO timestamp of the latest fix. */
  observedAt: string
  /** Latest position to Cambodia, km. */
  distanceKm: number
  /** Closest the track has ever come to Cambodia, km. */
  closestApproachKm: number
  /**
   * True when a reported fix falls inside Cambodia's bounding box. In practice
   * this is rare: systems that reach Cambodia have usually weakened below the
   * threshold at which warning centres keep issuing fixes, so the track record
   * ends over Vietnam or Laos even when the remnants carried on inland.
   */
  crossedCambodia: boolean
  /** True when the last two fixes moved it closer to Cambodia. */
  approaching: boolean
  /** Hours since the latest fix was reported. */
  fixAgeHours: number
  /**
   * True when the warning centres have stopped publishing positions. EONET
   * leaves events open long after a system is last reported, so an "open"
   * event is not proof of a system that still exists.
   */
  isStale: boolean
  /** False for a replayed past storm. */
  isLive: boolean
  /** Feed article, when one is published. */
  link: string | null
}

type EonetGeometry = {
  type: string
  coordinates: [number, number]
  date: string
  magnitudeValue?: number | null
  magnitudeUnit?: string | null
}

type EonetEvent = {
  id: string
  title: string
  closed?: string | null
  geometry: EonetGeometry[]
  sources?: { url: string }[]
}

/**
 * EONET titles read "<designation> <name>", e.g. "Super Typhoon Bavi" or
 * "Tropical Storm Maysak". Splitting them keeps the RSMC-assigned name — the
 * one bulletins and news reports use — separate from the classification, so
 * neither has to be invented.
 */
// Khmer here is a complete noun phrase, not a modifier, so callers never have
// to glue "ព្យុះ" on the front and risk an ungrammatical line.
const DESIGNATIONS: { en: string; km: string }[] = [
  { en: "Super Typhoon", km: "ព្យុះទីហ្វុងធំ" },
  { en: "Tropical Cyclone", km: "ព្យុះត្រូពិច" },
  { en: "Tropical Depression", km: "ជ្រលងសម្ពាធទាបត្រូពិច" },
  { en: "Tropical Storm", km: "ព្យុះត្រូពិច" },
  { en: "Post-Tropical Cyclone", km: "ព្យុះក្រោយត្រូពិច" },
  { en: "Subtropical Storm", km: "ព្យុះស៊ុបត្រូពិច" },
  { en: "Hurricane", km: "ព្យុះហឺរីខេន" },
  { en: "Typhoon", km: "ព្យុះទីហ្វុង" },
  { en: "Cyclone", km: "ព្យុះស៊ីក្លូន" },
]

function splitTitle(title: string): {
  shortName: string
  designation: string
  designationKm: string
} {
  const match = DESIGNATIONS.find((d) => title.toLowerCase().startsWith(d.en.toLowerCase()))
  if (!match) return { shortName: title, designation: "Tropical system", designationKm: "" }
  const shortName = title.slice(match.en.length).trim()
  return { shortName: shortName || title, designation: match.en, designationKm: match.km }
}

function inBasin([lon, lat]: Coordinates): boolean {
  return lon >= BASIN.minLon && lon <= BASIN.maxLon && lat >= BASIN.minLat && lat <= BASIN.maxLat
}

function toKmh(fix: EonetGeometry): number | null {
  if (fix.magnitudeValue == null) return null
  // The feed reports knots for cyclones; anything else is left alone.
  return fix.magnitudeUnit === "kts" ? fix.magnitudeValue * KNOTS_TO_KMH : fix.magnitudeValue
}

function parseEvent(event: EonetEvent, isLive: boolean): Cyclone | null {
  const fixes: CycloneFix[] = (event.geometry ?? [])
    .filter((g) => g.type === "Point" && Array.isArray(g.coordinates))
    .map((g) => ({
      coordinates: [g.coordinates[0], g.coordinates[1]] as Coordinates,
      windKmh: toKmh(g),
      at: g.date,
    }))

  if (fixes.length === 0) return null

  const latest = fixes[fixes.length - 1]
  const winds = fixes.map((f) => f.windKmh).filter((w): w is number => w != null)
  const distances = fixes.map((f) => distanceKm(f.coordinates, CAMBODIA))

  // Two fixes are enough to know whether it is closing in; a single-fix event
  // has no direction yet, so treat it as not approaching rather than guessing.
  const approaching =
    distances.length >= 2 && distances[distances.length - 1] < distances[distances.length - 2]

  const sources = event.sources ?? []

  const { shortName, designation, designationKm } = splitTitle(event.title)

  const fixAgeHours = (Date.now() - Date.parse(latest.at)) / 3_600_000
  const isStale = fixAgeHours > STALE_AFTER_HOURS

  const crossedCambodia = fixes.some(
    ({ coordinates: [lon, lat] }) =>
      lon >= CAMBODIA_BBOX.minLon &&
      lon <= CAMBODIA_BBOX.maxLon &&
      lat >= CAMBODIA_BBOX.minLat &&
      lat <= CAMBODIA_BBOX.maxLat
  )

  return {
    id: event.id,
    nameEn: event.title,
    shortName,
    designation,
    designationKm,
    fixes,
    track: fixes.map((f) => f.coordinates),
    center: latest.coordinates,
    peakWindKmh: winds.length ? Math.max(...winds) : null,
    currentWindKmh: latest.windKmh,
    observedAt: latest.at,
    distanceKm: distances[distances.length - 1],
    closestApproachKm: Math.min(...distances),
    crossedCambodia,
    approaching,
    fixAgeHours,
    isStale,
    isLive,
    link: sources[0]?.url ?? null,
  }
}

async function fetchEvents(params: Record<string, string>): Promise<EonetEvent[]> {
  const query = new URLSearchParams({ category: "severeStorms", ...params })
  const res = await fetch(`${EONET}?${query}`)
  if (!res.ok) throw new Error(`EONET request failed (${res.status})`)
  const json = await res.json()
  return Array.isArray(json?.events) ? json.events : []
}

/**
 * Cyclones active right now whose latest fix sits in this basin, nearest first.
 */
export async function fetchLiveCyclones(): Promise<Cyclone[]> {
  const events = await fetchEvents({ status: "open", limit: "40" })
  return events
    .map((e) => parseEvent(e, true))
    .filter((c): c is Cyclone => c !== null && inBasin(c.center))
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

/**
 * Every ended cyclone whose track came within `maxApproachKm` of Cambodia,
 * newest first. The default radius is deliberately tight — a system that
 * passed within 500 km is one that actually delivered weather here, rather
 * than merely existing in the same basin.
 */
export async function fetchCyclonesNearCambodia(
  maxApproachKm = REPLAY_RADIUS_KM
): Promise<Cyclone[]> {
  const events = await fetchEvents({
    status: "closed",
    limit: "200",
    // EONET bbox is upper-left then lower-right: minLon,maxLat,maxLon,minLat
    bbox: `${BASIN.minLon},${BASIN.maxLat},${BASIN.maxLon},${BASIN.minLat}`,
  })

  return events
    .map((e) => parseEvent(e, false))
    .filter((c): c is Cyclone => c !== null && c.closestApproachKm <= maxApproachKm)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
}

/**
 * The most recently ended cyclone that came near Cambodia. Used by replay mode
 * so the demo shows a real track rather than an invented one.
 */
export async function fetchRecentCyclone(): Promise<Cyclone | null> {
  const all = await fetchCyclonesNearCambodia()
  return all[0] ?? null
}

/** Distance below which a track is treated as having crossed the country. */
export const CROSSED_CAMBODIA_KM = 500

export type CycloneMotion = {
  /** Direction of travel, degrees clockwise from north. */
  bearing: number
  /** 16-point compass label, e.g. "WNW". */
  compass: string
  /** Forward speed along that bearing, km/h. */
  speedKmh: number
  /**
   * Straight-line extrapolation of the current heading. This is NOT a
   * forecast track — real cyclones recurve, and only a warning centre can say
   * where one is going. It answers the narrower question of where the system
   * ends up if it simply keeps doing what the last two fixes show.
   */
  projection: Coordinates[]
  projectionHours: number
  /** True when that straight line would take it over Cambodia. */
  towardCambodia: boolean
}

/**
 * Derives heading and speed from the two most recent fixes. Returns null when
 * there is only one fix, or when the fixes share a timestamp — a direction
 * cannot be invented from a single point.
 */
export function cycloneMotion(cyclone: Cyclone, projectionHours = 24): CycloneMotion | null {
  const { fixes } = cyclone
  if (fixes.length < 2) return null

  const previous = fixes[fixes.length - 2]
  const latest = fixes[fixes.length - 1]
  const hours = (Date.parse(latest.at) - Date.parse(previous.at)) / 3_600_000
  if (!(hours > 0)) return null

  const bearing = bearingDeg(previous.coordinates, latest.coordinates)
  const speedKmh = distanceKm(previous.coordinates, latest.coordinates) / hours

  // A few intermediate points so the projected line follows the great circle
  // rather than cutting a straight chord across the map projection.
  const steps = 6
  const total = speedKmh * projectionHours
  const projection: Coordinates[] = [latest.coordinates]
  for (let i = 1; i <= steps; i++) {
    projection.push(destinationPoint(latest.coordinates, bearing, (total * i) / steps))
  }

  const endpoint = projection[projection.length - 1]

  return {
    bearing,
    compass: compassPoint(bearing),
    speedKmh,
    projection,
    projectionHours,
    towardCambodia: distanceKm(endpoint, CAMBODIA) < distanceKm(latest.coordinates, CAMBODIA),
  }
}

/** Maps sustained wind onto the 0–2 range the cyclone renderer expects. */
export function cycloneIntensity(windKmh: number | null): number {
  if (windKmh == null) return 1
  return Math.min(2, Math.max(0.5, windKmh / 90))
}

/** Saffir–Simpson-style label from sustained wind, in the RSMC Tokyo idiom. */
export function cycloneCategory(windKmh: number | null): string {
  if (windKmh == null) return "Tropical system"
  if (windKmh >= 185) return "Violent typhoon"
  if (windKmh >= 150) return "Very strong typhoon"
  if (windKmh >= 118) return "Typhoon"
  if (windKmh >= 89) return "Severe tropical storm"
  if (windKmh >= 63) return "Tropical storm"
  return "Tropical depression"
}
