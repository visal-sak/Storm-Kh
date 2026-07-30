// ─────────────────────────────────────────────────────────────────
// StormWatch Kampuchea — data layer
// Station weather: Open-Meteo (free, no API key, CORS-enabled)
// https://open-meteo.com/en/docs
// Cyclone tracks live in ./cyclones (NASA EONET).
// ─────────────────────────────────────────────────────────────────

import type { Cyclone } from "./cyclones"
import { PROVINCES } from "./provinces"

export type Coordinates = [longitude: number, latitude: number]

export type Station = {
  id: string
  nameEn: string
  nameKm: string
  coordinates: Coordinates
  kind: "city" | "sentinel"
}

/**
 * Offshore sentinel points — the "early warning line".
 * Typhoons reach Cambodia almost always from the east:
 * South China Sea → central/south Vietnam → Cambodia.
 * We also watch the Gulf of Thailand to the southwest.
 */
export const SENTINELS: Station[] = [
  { id: "scs-n", nameEn: "South China Sea (off Da Nang)", nameKm: "សមុទ្រចិនខាងត្បូង (ជើង)", coordinates: [110.5, 15.5], kind: "sentinel" },
  { id: "scs-c", nameEn: "South China Sea (off Quy Nhon)", nameKm: "សមុទ្រចិនខាងត្បូង (កណ្ដាល)", coordinates: [110.0, 13.5], kind: "sentinel" },
  { id: "scs-s", nameEn: "South China Sea (off Nha Trang)", nameKm: "សមុទ្រចិនខាងត្បូង (ត្បូង)", coordinates: [109.8, 12.0], kind: "sentinel" },
  { id: "viet-c", nameEn: "Central Vietnam coast", nameKm: "ឆ្នេរវៀតណាមកណ្ដាល", coordinates: [107.8, 13.8], kind: "sentinel" },
  { id: "got", nameEn: "Gulf of Thailand", nameKm: "ឈូងសមុទ្រថៃ", coordinates: [102.5, 9.5], kind: "sentinel" },
]

export type StationWeather = {
  station: Station
  temperature: number
  windSpeed: number // km/h (10 m)
  windGusts: number // km/h
  windDirection: number // degrees
  pressure: number // hPa (MSL)
  precipitation: number // mm current hour
  rain24h: number // mm next 24 h
  maxGust24h: number // km/h next 24 h
  weatherCode: number // WMO 4677 present weather
  cape: number // J/kg — convective available potential energy
  cloudCover: number // %
  air: AirQuality | null // separate endpoint, may be missing
  /** Hour-by-hour series in Asia/Phnom_Penh local time. */
  hourly: HourlySeries
  fetchedAt: number
}

export type HourlySeries = {
  /** Local ISO strings, e.g. "2026-07-29T14:00". */
  time: string[]
  precipitation: number[]
  cloudCover: number[]
  weatherCode: number[]
  windGusts: number[]
}

export type HourSlice = {
  /** Local hour, 0–23. */
  hour: number
  time: string
  precipitation: number
  cloudCover: number
  weatherCode: number
  windGusts: number
  isThunder: boolean
  isPast: boolean
}

export type AirQuality = {
  pm25: number // µg/m³
  pm10: number // µg/m³
  usAqi: number
}

export type RiskLevel = "low" | "watch" | "warning"

export type RiskAssessment = {
  level: RiskLevel
  labelEn: string
  labelKm: string
  reasons: string[]
}

// ── Fetching ─────────────────────────────────────────────────────

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast"

export async function fetchStations(stations: Station[]): Promise<StationWeather[]> {
  const lat = stations.map((s) => s.coordinates[1]).join(",")
  const lon = stations.map((s) => s.coordinates[0]).join(",")
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current:
      "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,weather_code,cape,cloud_cover",
    hourly: "precipitation,wind_gusts_10m,cloud_cover,weather_code",
    forecast_days: "2",
    timezone: "Asia/Phnom_Penh",
  })
  const res = await fetch(`${OPEN_METEO}?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`)
  const json = await res.json()
  // Open-Meteo returns an array when multiple coordinates are requested,
  // a single object when only one is requested.
  const items: any[] = Array.isArray(json) ? json : [json]

  return items.map((item, i) => {
    const nowIndex = findCurrentHourIndex(item.hourly?.time ?? [])
    const next24rain = sumWindow(item.hourly?.precipitation ?? [], nowIndex, 24)
    const next24gust = maxWindow(item.hourly?.wind_gusts_10m ?? [], nowIndex, 24)
    return {
      station: stations[i],
      temperature: item.current?.temperature_2m ?? 0,
      windSpeed: item.current?.wind_speed_10m ?? 0,
      windGusts: item.current?.wind_gusts_10m ?? 0,
      windDirection: item.current?.wind_direction_10m ?? 0,
      pressure: item.current?.pressure_msl ?? 1013,
      precipitation: item.current?.precipitation ?? 0,
      rain24h: next24rain,
      maxGust24h: next24gust,
      weatherCode: item.current?.weather_code ?? 0,
      cape: item.current?.cape ?? 0,
      cloudCover: item.current?.cloud_cover ?? 0,
      air: null,
      hourly: {
        time: item.hourly?.time ?? [],
        precipitation: item.hourly?.precipitation ?? [],
        cloudCover: item.hourly?.cloud_cover ?? [],
        weatherCode: item.hourly?.weather_code ?? [],
        windGusts: item.hourly?.wind_gusts_10m ?? [],
      },
      fetchedAt: Date.now(),
    }
  })
}

// ── Hourly slices ────────────────────────────────────────────────

/** Local calendar date, e.g. "2026-07-29", in the API's Asia/Phnom_Penh frame. */
export function localDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function localHourNow(date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Phnom_Penh",
      hour: "2-digit",
      hour12: false,
    }).format(date)
  )
}

/**
 * The 24 hours of one local day for a station. Open-Meteo already returns
 * local timestamps because the request pins timezone=Asia/Phnom_Penh, so the
 * date prefix can be matched directly rather than converted.
 */
export function hoursForDate(w: StationWeather, dateKey = localDateKey()): HourSlice[] {
  const currentHour = localHourNow()
  const today = localDateKey()
  const slices: HourSlice[] = []

  w.hourly.time.forEach((stamp, i) => {
    if (!stamp.startsWith(dateKey)) return
    const hour = Number(stamp.slice(11, 13))
    const code = w.hourly.weatherCode[i] ?? 0
    slices.push({
      hour,
      time: stamp,
      precipitation: w.hourly.precipitation[i] ?? 0,
      cloudCover: w.hourly.cloudCover[i] ?? 0,
      weatherCode: code,
      windGusts: w.hourly.windGusts[i] ?? 0,
      isThunder: THUNDERSTORM_CODES.has(code),
      isPast: dateKey < today || (dateKey === today && hour < currentHour),
    })
  })

  return slices
}

export type NationalHour = {
  hour: number
  /** Mean rain across all provinces for this hour, mm. */
  meanRain: number
  /** Wettest single province this hour, mm. */
  maxRain: number
  meanCloud: number
  /** How many provinces are forecast to thunder this hour. */
  thunderCount: number
  isPast: boolean
}

/** Collapses every province's hourly series into one national picture per hour. */
export function nationalHours(
  stations: StationWeather[],
  dateKey = localDateKey()
): NationalHour[] {
  if (stations.length === 0) return []

  const perStation = stations.map((w) => hoursForDate(w, dateKey))
  const hours = perStation[0]?.map((slice) => slice.hour) ?? []

  return hours.map((hour, index) => {
    const slices = perStation.map((s) => s[index]).filter(Boolean)
    const rains = slices.map((s) => s.precipitation)
    return {
      hour,
      meanRain: rains.reduce((a, b) => a + b, 0) / (rains.length || 1),
      maxRain: rains.length ? Math.max(...rains) : 0,
      meanCloud:
        slices.reduce((a, s) => a + s.cloudCover, 0) / (slices.length || 1),
      thunderCount: slices.filter((s) => s.isThunder).length,
      isPast: slices[0]?.isPast ?? false,
    }
  })
}

// ── Air quality ──────────────────────────────────────────────────
// Separate Open-Meteo endpoint (CAMS model), also free and key-less.

const OPEN_METEO_AIR = "https://air-quality-api.open-meteo.com/v1/air-quality"

/**
 * Air quality per station, index-aligned with the input. Returns nulls rather
 * than throwing: a missing AQI should never blank out the storm dashboard.
 */
export async function fetchAirQuality(stations: Station[]): Promise<(AirQuality | null)[]> {
  try {
    const params = new URLSearchParams({
      latitude: stations.map((s) => s.coordinates[1]).join(","),
      longitude: stations.map((s) => s.coordinates[0]).join(","),
      current: "pm10,pm2_5,us_aqi",
      timezone: "Asia/Phnom_Penh",
    })
    const res = await fetch(`${OPEN_METEO_AIR}?${params}`)
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    const items: any[] = Array.isArray(json) ? json : [json]
    return stations.map((_, i) => {
      const current = items[i]?.current
      if (!current || current.us_aqi == null) return null
      return {
        pm25: current.pm2_5 ?? 0,
        pm10: current.pm10 ?? 0,
        usAqi: current.us_aqi,
      }
    })
  } catch {
    return stations.map(() => null)
  }
}

/** US EPA AQI bands, which is the scale the us_aqi field reports on. */
export function airQualityBand(aqi: number): { label: string; labelKm: string; level: RiskLevel } {
  if (aqi <= 50) return { label: "Good", labelKm: "ល្អ", level: "low" }
  if (aqi <= 100) return { label: "Moderate", labelKm: "មធ្យម", level: "low" }
  if (aqi <= 150) return { label: "Unhealthy for sensitive groups", labelKm: "មិនល្អសម្រាប់ក្រុមប្រឈម", level: "watch" }
  if (aqi <= 200) return { label: "Unhealthy", labelKm: "មិនល្អ", level: "watch" }
  if (aqi <= 300) return { label: "Very unhealthy", labelKm: "មិនល្អខ្លាំង", level: "warning" }
  return { label: "Hazardous", labelKm: "គ្រោះថ្នាក់", level: "warning" }
}

// ── Present weather ──────────────────────────────────────────────
// WMO code table 4677, as returned by Open-Meteo.

/** 95/96/99 are the thunderstorm codes; 96 and 99 add hail. */
const THUNDERSTORM_CODES = new Set([95, 96, 99])

/** Drizzle, rain, and rain-shower codes. */
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82])

/** CAPE above this is thunderstorm-favourable even before one is reported. */
const CAPE_THRESHOLD = 2000

export function isThundering(w: StationWeather): boolean {
  return THUNDERSTORM_CODES.has(w.weatherCode)
}

/** Reported thunder, or an atmosphere primed for it. Used for the watch state. */
export function isThunderRisk(w: StationWeather): boolean {
  return isThundering(w) || w.cape >= CAPE_THRESHOLD
}

export function isRaining(w: StationWeather): boolean {
  return w.precipitation > 0 || RAIN_CODES.has(w.weatherCode) || isThundering(w)
}

/**
 * Rain rate mapped to 0–1 for the sprite. 10 mm/h is torrential in Cambodia,
 * so that is treated as the top of the scale.
 */
export function rainIntensity(w: StationWeather): number {
  const fromRate = w.precipitation / 10
  const floor = isThundering(w) ? 0.55 : RAIN_CODES.has(w.weatherCode) ? 0.3 : 0.15
  return Math.min(1, Math.max(floor, fromRate))
}

export function weatherLabel(w: StationWeather): string {
  if (THUNDERSTORM_CODES.has(w.weatherCode)) return "Thunderstorm"
  if (w.weatherCode >= 80) return "Rain showers"
  if (w.weatherCode >= 61) return "Rain"
  if (w.weatherCode >= 51) return "Drizzle"
  if (w.weatherCode >= 45) return "Fog"
  if (w.weatherCode >= 1) return "Cloudy"
  return "Clear"
}

function findCurrentHourIndex(times: string[]): number {
  const now = Date.now()
  let best = 0
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]).getTime() <= now) best = i
    else break
  }
  return best
}

function sumWindow(values: number[], start: number, count: number): number {
  return values.slice(start, start + count).reduce((a, b) => a + (b ?? 0), 0)
}

function maxWindow(values: number[], start: number, count: number): number {
  return Math.max(0, ...values.slice(start, start + count).map((v) => v ?? 0))
}

// ── Risk logic ───────────────────────────────────────────────────
// Thresholds loosely follow tropical-storm classification:
//   Tropical depression ≥ ~50 km/h sustained · Tropical storm ≥ 63 km/h
//   Typhoon ≥ 118 km/h. Low MSL pressure (< 1002 hPa) marks storm cores.

export function assessStation(w: StationWeather): RiskAssessment {
  const reasons: string[] = []
  let score = 0

  if (w.maxGust24h >= 90) {
    score += 3
    reasons.push(`Gusts up to ${Math.round(w.maxGust24h)} km/h expected in 24h`)
  } else if (w.maxGust24h >= 60) {
    score += 2
    reasons.push(`Strong gusts (${Math.round(w.maxGust24h)} km/h) expected in 24h`)
  } else if (w.maxGust24h >= 45) {
    score += 1
    reasons.push(`Breezy: gusts near ${Math.round(w.maxGust24h)} km/h`)
  }

  if (w.pressure > 0 && w.pressure < 1000) {
    score += 2
    reasons.push(`Low pressure ${Math.round(w.pressure)} hPa (storm system nearby)`)
  } else if (w.pressure > 0 && w.pressure < 1005) {
    score += 1
    reasons.push(`Falling pressure ${Math.round(w.pressure)} hPa`)
  }

  if (w.rain24h >= 80) {
    score += 2
    reasons.push(`Heavy rain: ${Math.round(w.rain24h)} mm expected in 24h (flood risk)`)
  } else if (w.rain24h >= 35) {
    score += 1
    reasons.push(`Rain: ${Math.round(w.rain24h)} mm expected in 24h`)
  }

  if (reasons.length === 0) reasons.push("Conditions are calm")

  if (score >= 4) return { level: "warning", labelEn: "Warning", labelKm: "ការព្រមាន", reasons }
  if (score >= 2) return { level: "watch", labelEn: "Watch", labelKm: "តាមដាន", reasons }
  return { level: "low", labelEn: "Low risk", labelKm: "ហានិភ័យទាប", reasons }
}

/**
 * Combines the per-city readings with whatever cyclone the track feed reports.
 * A named system that is both close and closing in is the only thing that
 * escalates straight to warning on its own.
 */
export function overallRisk(cityRisks: RiskAssessment[], storm: Cyclone | null): RiskAssessment {
  const worst = cityRisks.reduce<RiskLevel>((acc, r) => {
    const order: RiskLevel[] = ["low", "watch", "warning"]
    return order.indexOf(r.level) > order.indexOf(acc) ? r.level : acc
  }, "low")

  // A system with no recent fix cannot justify an escalation on its own — the
  // station readings have to carry it.
  const live = storm?.isLive && !storm.isStale ? storm : null
  const wind = live?.currentWindKmh ?? live?.peakWindKmh ?? null
  const windText = wind != null ? `, winds ${Math.round(wind)} km/h` : ""

  if (live && (worst === "warning" || (live.approaching && live.distanceKm <= 1200))) {
    return {
      level: "warning",
      labelEn: "Storm approaching",
      labelKm: "ព្យុះកំពុងខិតជិត",
      reasons: [`${live.nameEn} — ${Math.round(live.distanceKm)} km away${windText}, tracking closer`],
    }
  }
  if (live || worst === "watch" || worst === "warning") {
    return {
      level: "watch",
      labelEn: "Monitoring conditions",
      labelKm: "កំពុងតាមដានស្ថានភាព",
      reasons: live
        ? [`${live.nameEn} active ${Math.round(live.distanceKm)} km away${windText}`]
        : ["Elevated wind or rain at one or more cities"],
    }
  }
  return {
    level: "low",
    labelEn: "All clear",
    labelKm: "ស្ថានភាពធម្មតា",
    reasons: ["No tropical cyclone active in the basin"],
  }
}

// ── Geography ────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371

/** Great-circle distance in kilometres between two [lon, lat] points. */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Initial great-circle bearing from `a` to `b`, in degrees clockwise from north. */
export function bearingDeg(a: Coordinates, b: Coordinates): number {
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const dLon = toRad(b[0] - a[0])
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Point reached by travelling `distance` km from `origin` along `bearing`. */
export function destinationPoint(
  origin: Coordinates,
  bearing: number,
  distance: number
): Coordinates {
  const angular = distance / EARTH_RADIUS_KM
  const theta = toRad(bearing)
  const lat1 = toRad(origin[1])
  const lon1 = toRad(origin[0])

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta)
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    )

  return [((toDeg(lon2) + 540) % 360) - 180, toDeg(lat2)]
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]

/** 16-point compass label for a bearing, the form storm bulletins use. */
export function compassPoint(bearing: number): string {
  return COMPASS[Math.round(((bearing % 360) / 22.5)) % 16]
}

/** The monitored city closest to a point — used to translate a GPS fix into local risk. */
export function nearestStation(
  point: Coordinates,
  stations: Station[] = PROVINCES
): { station: Station; distanceKm: number } | null {
  if (stations.length === 0) return null
  return stations
    .map((station) => ({ station, distanceKm: distanceKm(point, station.coordinates) }))
    .reduce((closest, candidate) => (candidate.distanceKm < closest.distanceKm ? candidate : closest))
}

