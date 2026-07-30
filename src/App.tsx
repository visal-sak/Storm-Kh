import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CloudRain,
  CloudRainWind,
  Crosshair,
  Gauge,
  MapPin,
  PanelRightOpen,
  RefreshCw,
  Sun,
  Waves,
  Wind,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle"
import { Sheet } from "@/components/ui/sheet"
import { StormMap } from "@/components/StormMap"
import { CycloneAlertBanner } from "@/components/CycloneAlertBanner"
import { CycloneHistory } from "@/components/CycloneHistory"
import { HourlyToday } from "@/components/HourlyToday"
import { cn } from "@/lib/utils"
import { useGeolocation } from "@/lib/geolocation"
import { useIsDesktop } from "@/lib/media"
import { formatSince, useNow, usePolling } from "@/lib/polling"
import { PROVINCES } from "@/lib/provinces"
import { cycloneAlert } from "@/lib/alert"
import {
  airQualityBand,
  assessStation,
  fetchAirQuality,
  fetchStations,
  isRaining,
  isThundering,
  nearestStation,
  overallRisk,
  weatherLabel,
  SENTINELS,
  type AirQuality,
  type Coordinates,
  type RiskLevel,
  type StationWeather,
} from "@/lib/storm"
import {
  CROSSED_CAMBODIA_KM,
  cycloneCategory,
  cycloneMotion,
  fetchCyclonesNearCambodia,
  fetchLiveCyclones,
  type Cyclone,
} from "@/lib/cyclones"

// Each source gets its own clock, matched to how often it actually changes.
// Polling faster than the upstream model re-runs just refetches identical
// numbers and burns the shared Open-Meteo quota.
const REFRESH_WEATHER_MS = 60 * 1000 // 1 min — model re-runs ~every 15
const REFRESH_AIR_MS = 60 * 60 * 1000 // 1 h — the CAMS field is hourly
const REFRESH_TRACKS_MS = 15 * 60 * 1000 // 15 min — fixes are published 6-hourly

export default function App() {
  const [cityWeather, setCityWeather] = useState<StationWeather[]>([])
  const [sentinelWeather, setSentinelWeather] = useState<StationWeather[]>([])
  const [airById, setAirById] = useState<Record<string, AirQuality | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [simulation, setSimulation] = useState(false)
  const [liveStorm, setLiveStorm] = useState<Cyclone | null>(null)
  const [history, setHistory] = useState<Cyclone[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [trackError, setTrackError] = useState<string | null>(null)
  const { location, status: locateStatus, error: locateError, locate } = useGeolocation()
  const now = useNow()
  const isDesktop = useIsDesktop()
  const [railOpen, setRailOpen] = useState(false)

  const loadWeather = useCallback(async () => {
    setLoading(true)
    try {
      const [provinces, sentinels] = await Promise.all([
        fetchStations(PROVINCES),
        fetchStations(SENTINELS),
      ])
      setCityWeather(provinces)
      setSentinelWeather(sentinels)
      setUpdatedAt(Date.now())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load weather data")
    } finally {
      setLoading(false)
    }
  }, [])

  // Air quality moves on its own hourly clock, so it is fetched and stored
  // separately rather than being thrown away on every weather refresh.
  const loadAir = useCallback(async () => {
    const air = await fetchAirQuality(PROVINCES)
    setAirById(Object.fromEntries(PROVINCES.map((p, i) => [p.id, air[i]])))
  }, [])

  const loadTracks = useCallback(async () => {
    const [live, past] = await Promise.allSettled([
      fetchLiveCyclones(),
      // Tight radius so the list matches its heading: these are systems that
      // actually reached the country, not everything that shared the basin.
      fetchCyclonesNearCambodia(CROSSED_CAMBODIA_KM),
    ])

    if (live.status === "fulfilled") {
      setLiveStorm(live.value[0] ?? null)
      setTrackError(null)
    } else {
      setTrackError("Cyclone track feed is unreachable")
    }
    if (past.status === "fulfilled") setHistory(past.value)
  }, [])

  const load = useCallback(() => {
    loadWeather()
    loadAir()
    loadTracks()
  }, [loadWeather, loadAir, loadTracks])

  usePolling(loadWeather, REFRESH_WEATHER_MS)
  usePolling(loadAir, REFRESH_AIR_MS)
  usePolling(loadTracks, REFRESH_TRACKS_MS)

  // Air quality is joined on at render time, so the two clocks stay independent.
  const provinceWeather = useMemo(
    () => cityWeather.map((w) => ({ ...w, air: airById[w.station.id] ?? null })),
    [cityWeather, airById]
  )

  const cityRisks = useMemo(
    () => provinceWeather.map((w) => ({ id: w.station.id, risk: assessStation(w) })),
    [provinceWeather]
  )
  const riskById = useMemo(
    () =>
      Object.fromEntries(cityRisks.map((c) => [c.id, c.risk.level])) as Record<string, RiskLevel>,
    [cityRisks]
  )

  // Replay mode shows a real past cyclone — whichever the reader picked from
  // the history list, defaulting to the most recent one.
  const replayStorm = useMemo(
    () => history.find((c) => c.id === selectedId) ?? history[0] ?? null,
    [history, selectedId]
  )
  const storm = simulation ? replayStorm : liveStorm

  const overall = useMemo(() => {
    if (simulation) {
      return {
        level: "watch" as RiskLevel,
        labelEn: replayStorm ? `Replay: ${replayStorm.nameEn}` : "Replay: no past storm on file",
        labelKm: "ការចាក់ឡើងវិញ",
        reasons: replayStorm
          ? [
              `Observed track from ${new Date(replayStorm.fixes[0].at).toLocaleDateString("en-GB")} — closest approach ${Math.round(replayStorm.closestApproachKm)} km`,
            ]
          : ["No past cyclone in range to replay"],
      }
    }
    return overallRisk(
      cityRisks.map((c) => c.risk),
      liveStorm
    )
  }, [simulation, cityRisks, liveStorm, replayStorm])

  // Rotating to landscape docks the rail, so a sheet left open would otherwise
  // reappear the next time the viewport narrows.
  useEffect(() => {
    if (isDesktop) setRailOpen(false)
  }, [isDesktop])

  // Picking a storm from the history implies wanting to see it, so replay turns
  // itself on and — on a phone — the sheet steps out of the map's way.
  const selectHistoric = useCallback((cyclone: Cyclone) => {
    setSelectedId(cyclone.id)
    setSimulation(true)
    setRailOpen(false)
  }, [])

  // Alerts speak about the live system only — a replayed track must never
  // raise one, which cycloneAlert enforces via the isLive flag.
  const alert = useMemo(() => cycloneAlert(liveStorm), [liveStorm])

  // Heading is only meaningful for a system still being tracked.
  const motion = useMemo(
    () => (storm && storm.isLive && !storm.isStale ? cycloneMotion(storm) : null),
    [storm]
  )

  // The default view is framed on Cambodia; a real cyclone is often well
  // outside it, so the cyclone card can pull the map over to the system.
  const [focus, setFocus] = useState<{
    coordinates: Coordinates
    zoom: number
    nonce: number
  } | null>(null)

  const showStormOnMap = useCallback(() => {
    if (!storm) return
    setFocus((previous) => ({
      coordinates: storm.center,
      zoom: 4.5,
      nonce: (previous?.nonce ?? 0) + 1,
    }))
  }, [storm])

  // A GPS fix is only useful here once it is tied to the nearest monitored city.
  const nearby = useMemo(() => {
    if (!location) return null
    const nearest = nearestStation(location.coordinates)
    if (!nearest) return null
    const risk = cityRisks.find((c) => c.id === nearest.station.id)?.risk
    return { ...nearest, risk }
  }, [location, cityRisks])

  // The rail is built once and rendered into exactly one place: docked beside
  // the map on desktop, or inside a sheet below `lg`. Stacking it under the map
  // on a phone buried the map under a metre of scrolling.
  const rail = (
    <>
      {/* Khmer-first cyclone alert, above everything it would affect */}
      <CycloneAlertBanner alert={alert} />

          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="sw-live-dot h-2 w-2 rounded-full bg-safe" />
                {overall.labelEn}
              </CardTitle>
              <p className="font-khmer text-xs text-storm-300">{overall.labelKm}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-xs text-storm-300">
                {overall.reasons.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
              {/* Ticks every second, so freshness is visible rather than implied */}
              <p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-storm-500">
                {updatedAt ? (
                  <>
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        loading ? "bg-rain" : "sw-live-dot bg-safe"
                      )}
                    />
                    Updated {formatSince(updatedAt, now)} · every 60s
                  </>
                ) : (
                  "Waiting for first update…"
                )}
              </p>
              {error && (
                <p className="mt-2 text-xs text-danger">
                  {error}. Check your connection, then press Refresh.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Where the viewer is */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-rain" /> Your location
              </CardTitle>
              <p className="font-khmer text-xs text-storm-300">ទីតាំងរបស់អ្នក</p>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {location && nearby ? (
                <>
                  <p className="font-mono text-[11px] text-storm-500">
                    {location.coordinates[1].toFixed(3)}, {location.coordinates[0].toFixed(3)} · ±
                    {Math.round(location.accuracy)} m
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-storm-300">
                      {Math.round(nearby.distanceKm)} km from{" "}
                      <span className="font-semibold text-storm-100">{nearby.station.nameEn}</span>
                    </p>
                    {nearby.risk && (
                      <Badge variant={badgeVariant(nearby.risk.level)}>{nearby.risk.labelEn}</Badge>
                    )}
                  </div>
                  {nearby.distanceKm > 300 && (
                    <p className="text-storm-500">
                      You are outside the monitored area — readings are for the nearest Cambodian
                      city.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-storm-300">
                    Show where you are relative to the storm and the nearest monitored city.
                  </p>
                  <Button
                    variant="outline"
                    className="h-8 w-full text-xs"
                    onClick={locate}
                    disabled={locateStatus === "locating"}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {locateStatus === "locating" ? "Locating…" : "Use my location"}
                  </Button>
                </>
              )}
              {locateError && <p className="text-danger">{locateError}</p>}
            </CardContent>
          </Card>

          {/* Cyclone panel — every figure here is a reported fix, not a model */}
          {storm && (
            <Card
              className={
                storm.isLive && !storm.isStale ? "border-danger/40" : "border-storm-700/70"
              }
            >
              <CardHeader>
                <CardTitle
                  className={cn(
                    "flex items-center gap-2",
                    storm.isLive && !storm.isStale ? "text-danger" : "text-storm-300"
                  )}
                >
                  <Waves className="h-4 w-4" />
                  {!storm.isLive ? (
                    <>
                      Past system · <span className="font-khmer">ព្យុះកន្លងមក</span>
                    </>
                  ) : storm.isStale ? (
                    <>
                      Last known · <span className="font-khmer">ទីតាំងចុងក្រោយ</span>
                    </>
                  ) : (
                    <>
                      Active system · <span className="font-khmer">ព្យុះសកម្ម</span>
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                {/* The RSMC-assigned name and the warning centre's own
                    classification, both straight from the feed. */}
                <p className="text-base font-semibold text-storm-100">{storm.shortName}</p>
                <p className="text-storm-300">
                  {storm.designation}
                  {" · "}
                  {cycloneCategory(storm.currentWindKmh ?? storm.peakWindKmh)}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 font-mono">
                  <Stat
                    // "now" is only honest while the feed is still being updated.
                    label={storm.isLive && !storm.isStale ? "winds now" : "winds at last fix"}
                    value={
                      storm.currentWindKmh != null
                        ? `${Math.round(storm.currentWindKmh)} km/h`
                        : "—"
                    }
                  />
                  <Stat label="peak winds" value={
                    storm.peakWindKmh != null ? `${Math.round(storm.peakWindKmh)} km/h` : "—"
                  } />
                  <Stat label="distance" value={`${Math.round(storm.distanceKm)} km`} />
                  <Stat
                    label="moving"
                    value={motion ? `${motion.compass} ${Math.round(motion.speedKmh)} km/h` : "—"}
                  />
                </div>
                <p className="mt-2 text-storm-300">
                  {!storm.isLive
                    ? `Closest approach ${Math.round(storm.closestApproachKm)} km. This system has already passed.`
                    : storm.isStale
                      ? "No new position published — this is the last known fix, not a current location."
                      : storm.approaching
                        ? "Last two fixes moved it closer to Cambodia — monitor official MOWRAM bulletins."
                        : "Last two fixes moved it away from Cambodia."}
                </p>
                {motion && (
                  <p className="text-storm-500">
                    Amber line projects {motion.projectionHours}h on the current heading —
                    extrapolation only, {motion.towardCambodia ? "currently toward" : "away from"}{" "}
                    Cambodia. Cyclones recurve; only MOWRAM issues real forecast tracks.
                  </p>
                )}
                <p className="font-mono text-[11px] text-storm-500">
                  Fix {new Date(storm.observedAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {formatAge(storm.fixAgeHours)} · NASA EONET
                </p>
                <Button
                  variant="outline"
                  className="mt-2 h-8 w-full text-xs"
                  onClick={showStormOnMap}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Show on map
                </Button>
              </CardContent>
            </Card>
          )}

          {trackError && (
            <p className="text-[11px] text-danger">{trackError} — station readings are unaffected.</p>
          )}

          {/* Hour-by-hour rain, cloud and thunder for today */}
          <HourlyToday
            stations={provinceWeather}
            dateLabel={new Date().toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          />

          {/* Every past cyclone that reached Cambodia; picking one replays it */}
          <CycloneHistory
            cyclones={history}
            selectedId={replayStorm?.id ?? null}
            onSelect={selectHistoric}
          />

          {/* Province cards — all 25 first-level divisions */}
          <div>
            <p className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-storm-500">
              <span>
                <span className="font-khmer">ខេត្ត</span> · provinces
              </span>
              <span className="font-mono normal-case tracking-normal">
                {provinceWeather.length || PROVINCES.length}
              </span>
            </p>
            <div className="flex flex-col gap-2">
              {loading && provinceWeather.length === 0
                ? PROVINCES.map((c) => <Skeleton key={c.id} className="h-20" />)
                : provinceWeather.map((w) => {
                    const risk = cityRisks.find((c) => c.id === w.station.id)?.risk
                    return (
                      <Card key={w.station.id}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">
                                {w.station.nameEn}{" "}
                                <span className="font-khmer font-normal text-storm-300">
                                  {w.station.nameKm}
                                </span>
                              </p>
                              <p className="font-mono text-[11px] text-storm-500">
                                {w.temperature.toFixed(0)}°C now
                              </p>
                              {/* Present weather drives the map effects too, so
                                  the rail and the map always agree. */}
                              <p
                                className={cn(
                                  "mt-0.5 flex items-center gap-1 text-[11px]",
                                  isThundering(w)
                                    ? "text-watch"
                                    : isRaining(w)
                                      ? "text-rain"
                                      : "text-storm-500"
                                )}
                              >
                                {isThundering(w) ? (
                                  <Zap className="h-3 w-3" />
                                ) : isRaining(w) ? (
                                  <CloudRain className="h-3 w-3" />
                                ) : (
                                  <Sun className="h-3 w-3" />
                                )}
                                {weatherLabel(w)}
                                {w.precipitation > 0 && ` · ${w.precipitation.toFixed(1)} mm/h`}
                              </p>
                            </div>
                            {risk && <Badge variant={badgeVariant(risk.level)}>{risk.labelEn}</Badge>}
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <Metric
                              icon={<Wind className="h-3.5 w-3.5" />}
                              label="gust 24h"
                              value={`${Math.round(w.maxGust24h)}`}
                              unit="km/h"
                            />
                            <Metric
                              icon={<CloudRainWind className="h-3.5 w-3.5" />}
                              label="rain 24h"
                              value={`${Math.round(w.rain24h)}`}
                              unit="mm"
                            />
                            <Metric
                              icon={<Gauge className="h-3.5 w-3.5" />}
                              label="pressure"
                              value={`${Math.round(w.pressure)}`}
                              unit="hPa"
                            />
                          </div>
                          {/* Air quality, live from Open-Meteo's CAMS endpoint */}
                          {w.air && (
                            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-storm-800/60 px-2 py-1.5">
                              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-storm-500">
                                <Wind className="h-3 w-3" /> air · us aqi
                              </p>
                              <p className="flex items-center gap-1.5">
                                <span className="font-mono text-sm text-storm-100">
                                  {Math.round(w.air.usAqi)}
                                </span>
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold",
                                    airQualityBand(w.air.usAqi).level === "warning"
                                      ? "text-danger"
                                      : airQualityBand(w.air.usAqi).level === "watch"
                                        ? "text-watch"
                                        : "text-safe"
                                  )}
                                >
                                  {airQualityBand(w.air.usAqi).label}
                                </span>
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
            </div>
          </div>

      <p className="mt-auto pt-2 text-[11px] leading-relaxed text-storm-500">
        Live data: Open-Meteo and NASA EONET. This dashboard is educational — for real
        emergencies follow the Ministry of Water Resources and Meteorology (MOWRAM) and NCDM
        bulletins.
      </p>
    </>
  )

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* ── Top bar ── */}
      <header className="flex shrink-0 items-center gap-2 border-b border-storm-700/60 bg-storm-900/60 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-5 sm:py-3">
        <div className="min-w-0">
          {/* The kicker is the first thing worth losing on a narrow screen */}
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.2em] text-rain sm:block">
            <span className="font-khmer">ប្រព័ន្ធតាមដានព្យុះ</span> · cyclone monitor
          </p>
          <h1 className="truncate text-base leading-tight font-bold tracking-tight sm:text-lg">
            StormWatch <span className="text-rain">Kampuchea</span>
          </h1>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* Full chip needs room; below sm the status shows on the map bar instead */}
          <div className="hidden md:block">
            <OverallChip
              level={overall.level}
              labelEn={overall.labelEn}
              labelKm={overall.labelKm}
            />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Switch
              checked={simulation}
              onCheckedChange={setSimulation}
              label="Replay the most recent cyclone in the region"
            />
            <span className="text-xs text-storm-300">Replay</span>
          </div>
          <AnimatedThemeToggle />
          <Button
            variant="outline"
            onClick={load}
            disabled={loading}
            aria-label="Refresh data"
            className="w-9 px-0 md:w-auto md:px-3.5"
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span className="hidden md:inline">{loading ? "Updating…" : "Refresh"}</span>
          </Button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Map — takes the whole viewport below lg, where the rail is a sheet */}
        <section className="relative min-h-0 min-w-0" aria-label="Storm map">
          <StormMap
            cityWeather={provinceWeather}
            cityRisks={riskById}
            sentinelWeather={sentinelWeather}
            storm={storm}
            simulation={simulation}
            userLocation={location}
            locating={locateStatus === "locating"}
            onLocate={locate}
            focus={focus}
          />

          {/* Legend. It used to wrap into an unreadable block on a phone, so it
              scrolls sideways instead and clears the sheet trigger. */}
          <div className="absolute right-2 bottom-14 left-2 rounded-lg border border-storm-700/60 bg-storm-950/85 backdrop-blur lg:right-auto lg:bottom-3 lg:left-3">
            <div className="overflow-x-auto">
              <p className="flex w-max items-center gap-3 px-3 py-2 text-[11px] whitespace-nowrap text-storm-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-safe" /> ok
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-watch" /> watch
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-danger" /> warning
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rotate-45 border border-rain/70 bg-rain/20" />{" "}
                  sentinel
                </span>
                <span className="flex items-center gap-1.5">
                  <CloudRain className="h-3 w-3 text-rain" /> rain
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-watch" /> thunder
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full border-2 border-storm-950 bg-rain" /> you
                </span>
              </p>
            </div>
          </div>

          {/* Below lg the rail lives in a sheet, so the map keeps the viewport
              and the status stays visible on a persistent bar. */}
          {!isDesktop && (
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-storm-700/60 bg-storm-900/90 px-3 py-2 backdrop-blur">
              <button
                type="button"
                onClick={() => setRailOpen(true)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                aria-label="Open dashboard details"
              >
                <span
                  className={cn(
                    "sw-live-dot h-2 w-2 shrink-0 rounded-full",
                    overall.level === "warning"
                      ? "bg-danger"
                      : overall.level === "watch"
                        ? "bg-watch"
                        : "bg-safe"
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-storm-100">
                    {overall.labelEn}
                  </span>
                  <span className="font-khmer block truncate text-[11px] text-storm-300">
                    {overall.labelKm}
                  </span>
                </span>
              </button>
              <Button
                variant="outline"
                onClick={() => setRailOpen(true)}
                className="h-8 shrink-0 px-3 text-xs"
              >
                <PanelRightOpen className="h-3.5 w-3.5" />
                Details
              </Button>
            </div>
          )}
        </section>

        {/* Docked rail, desktop only */}
        {isDesktop && (
          <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto border-l border-storm-700/60 p-4">
            {rail}
          </aside>
        )}
      </main>

      {/* Same rail, in a sheet, below lg */}
      {!isDesktop && (
        <Sheet
          open={railOpen}
          onClose={() => setRailOpen(false)}
          title={overall.labelEn}
          subtitle={overall.labelKm}
        >
          {/* Replay lives here below lg — there is no room for it in the header */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-storm-700/60 bg-storm-800/40 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-storm-100">Replay last storm</p>
              <p className="font-khmer text-[11px] text-storm-300">ចាក់ព្យុះចុងក្រោយឡើងវិញ</p>
            </div>
            <Switch
              checked={simulation}
              onCheckedChange={setSimulation}
              label="Replay the most recent cyclone in the region"
            />
          </div>
          {rail}
        </Sheet>
      )}
    </div>
  )
}

/** How long ago a cyclone fix was reported, in the coarsest useful unit. */
function formatAge(hours: number): string {
  if (hours < 1) return "just now"
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

function badgeVariant(level: RiskLevel) {
  return level === "warning" ? "danger" : level === "watch" ? "watch" : "safe"
}

function OverallChip({
  level,
  labelEn,
  labelKm,
}: {
  level: RiskLevel
  labelEn: string
  labelKm: string
}) {
  return (
    <Badge variant={badgeVariant(level)} className="normal-case">
      <span className="font-khmer">{labelKm}</span>
      <span className="opacity-70">·</span>
      {labelEn}
    </Badge>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-storm-700/60 bg-storm-800/60 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-storm-500">{label}</p>
      <p className="text-sm text-storm-100">{value}</p>
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="rounded-lg bg-storm-800/60 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-storm-500">
        {icon} {label}
      </p>
      <p className="font-mono text-sm text-storm-100">
        {value} <span className="text-[10px] text-storm-500">{unit}</span>
      </p>
    </div>
  )
}
