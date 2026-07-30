import { Fragment, useEffect } from "react"
import { Loader2, LocateFixed } from "lucide-react"
import { Map } from "@/components/map/map"
import { MapCyclone } from "@/components/map/cyclone"
import { MapMarker, MarkerContent, MarkerTooltip } from "@/components/map/marker"
import { MapControlButton, MapControlGroup, MapControls, MapZoom } from "@/components/map/controls"
import { MapLineAnimated } from "@/components/map/line-animated"
import { MapRain } from "@/components/map/rain"
import { MapLightning } from "@/components/map/lightning"
import { useMap } from "@/components/map/hooks"
import { useTheme } from "@/lib/theme"
import { usePrefersReducedMotion } from "@/lib/polling"
import { PROVINCES } from "@/lib/provinces"
import {
  SENTINELS,
  isRaining,
  isThundering,
  nearestStation,
  rainIntensity,
  weatherLabel,
  type Coordinates,
  type RiskLevel,
  type StationWeather,
} from "@/lib/storm"
import { cycloneIntensity, cycloneMotion, type Cyclone } from "@/lib/cyclones"
import { cn } from "@/lib/utils"
import type { UserLocation } from "@/lib/geolocation"

// Free CARTO basemaps (no token required), one per theme.
const BASEMAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
}

// Weather effects are drawn onto canvas sprites, so they need literal colors
// rather than CSS variables — one set per theme to stay legible over each
// basemap. Rain is darker on positron, brighter on dark-matter.
const CYCLONE_COLORS = {
  light: {
    funnel: "#4a6a95",
    debris: "#8fa3bd",
    track: "#c53a24",
    rain: "#3f7fae",
    bolt: "#f0b429",
    flash: "#ffd67a",
    heading: "#e0862c",
  },
  dark: {
    funnel: "#9fb6d8",
    debris: "#3d4d68",
    track: "#ee5c46",
    rain: "#7fb4d8",
    bolt: "#ffffff",
    flash: "#e0e8ff",
    heading: "#f0a03c",
  },
}

const USER_LOCATION_ZOOM = 8.5

/** Ceiling on simultaneously animated rain/lightning sprites. */
const MAX_WEATHER_EFFECTS = 8

type Props = {
  cityWeather: StationWeather[]
  cityRisks: Record<string, RiskLevel>
  sentinelWeather: StationWeather[]
  storm: Cyclone | null
  /** Replay mode: animate the whole observed track instead of just marking the latest fix. */
  simulation: boolean
  userLocation: UserLocation | null
  locating: boolean
  /** Asks the app for a GPS fix; errors surface in the side rail. */
  onLocate: () => void
  /**
   * A real cyclone can sit thousands of km outside the default view, so the
   * side rail can ask the map to go there. The nonce lets the same target be
   * requested twice.
   */
  focus: { coordinates: Coordinates; zoom: number; nonce: number } | null
}

export function StormMap({
  cityWeather,
  cityRisks,
  sentinelWeather,
  storm,
  simulation,
  userLocation,
  locating,
  onLocate,
  focus,
}: Props) {
  const { resolvedTheme } = useTheme()
  const palette = CYCLONE_COLORS[resolvedTheme]
  // Rain, lightning and the cyclone all repaint every frame indefinitely.
  const reducedMotion = usePrefersReducedMotion()
  const animate = !reducedMotion

  // Only a live system gets a heading drawn. Projecting forward from a storm
  // that ended years ago would be meaningless, and projecting from a stale fix
  // would put a confident arrow on days-old data.
  const motion = storm && storm.isLive && !storm.isStale ? cycloneMotion(storm) : null

  // Note: terrae's <Map> import shadows the built-in Map class here,
  // so plain objects are used for the lookups instead.
  const byId: Record<string, StationWeather> = Object.fromEntries(
    cityWeather.map((w) => [w.station.id, w])
  )
  const sentinelById: Record<string, StationWeather> = Object.fromEntries(
    sentinelWeather.map((w) => [w.station.id, w])
  )

  // Each effect is an animated canvas sprite doing a getImageData per frame.
  // With 25 provinces that adds up fast, so only the most significant weather
  // is drawn: thunderstorms first, then the heaviest rain. Everything else is
  // still reported on the marker and in the side rail.
  const activeWeather = cityWeather
    .filter((w) => isRaining(w) || isThundering(w))
    .sort((a, b) => {
      const byThunder = Number(isThundering(b)) - Number(isThundering(a))
      return byThunder !== 0 ? byThunder : b.precipitation - a.precipitation
    })
    .slice(0, MAX_WEATHER_EFFECTS)

  return (
    <Map styles={BASEMAP_STYLES} center={[106.2, 12.6]} zoom={5.4} minZoom={4} maxZoom={10}>
      <MapControls position="bottom-right">
        {/* The fix itself is owned by the app so the side rail and the map stay
            in agreement; this button only asks for one. */}
        <MapControlGroup>
          <MapControlButton onClick={onLocate} label="Find my location" disabled={locating}>
            {locating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LocateFixed className={cn("size-4", userLocation && "text-rain")} />
            )}
          </MapControlButton>
        </MapControlGroup>
        <MapZoom />
      </MapControls>

      {focus && (
        <FlyTo
          key={focus.nonce}
          coordinates={focus.coordinates}
          zoom={focus.zoom}
        />
      )}

      {/* Where the viewer actually is */}
      {userLocation && (
        <>
          <FlyTo coordinates={userLocation.coordinates} zoom={USER_LOCATION_ZOOM} />
          <MapMarker coordinates={userLocation.coordinates}>
            <MarkerContent>
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <span className="sw-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-rain" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-storm-950 bg-rain shadow" />
              </span>
            </MarkerContent>
            <MarkerTooltip>
              <UserLocationTooltip location={userLocation} />
            </MarkerTooltip>
          </MapMarker>
        </>
      )}

      {/* All 25 provinces. Labelling every one at this zoom collides badly
          around Phnom Penh, and in monsoon season "it is raining" is true
          almost everywhere — so a name is only drawn where the province is
          genuinely notable: elevated risk, or an active thunderstorm. The rest
          stay dots and name themselves on hover. */}
      {PROVINCES.map((city) => {
        const w = byId[city.id]
        const level = cityRisks[city.id] ?? "low"
        const labelled = level !== "low" || (w ? isThundering(w) : false)

        return (
          <MapMarker key={city.id} coordinates={city.coordinates}>
            <MarkerContent>
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "block rounded-full ring-2 ring-storm-950/80",
                    labelled ? "h-3 w-3" : "h-2 w-2",
                    level === "warning" ? "bg-danger" : level === "watch" ? "bg-watch" : "bg-safe"
                  )}
                />
                {labelled && (
                  <span className="rounded bg-storm-950/85 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-storm-100">
                    {city.nameEn}
                  </span>
                )}
              </div>
            </MarkerContent>
            <MarkerTooltip>
              <div className="min-w-40 text-xs">
                <p className="font-semibold">
                  <span className="font-khmer">{city.nameKm}</span> · {city.nameEn}
                </p>
                {w ? (
                  <ul className="mt-1 space-y-0.5 text-storm-300">
                    <li className="font-medium">
                      {weatherLabel(w)}
                      {w.precipitation > 0 && ` · ${w.precipitation.toFixed(1)} mm/h now`}
                    </li>
                    <li>
                      Wind {Math.round(w.windSpeed)} km/h · gusts {Math.round(w.windGusts)} km/h
                    </li>
                    <li>Rain next 24h: {Math.round(w.rain24h)} mm</li>
                    <li>Pressure {Math.round(w.pressure)} hPa</li>
                  </ul>
                ) : (
                  <p className="text-storm-300">Loading…</p>
                )}
              </div>
            </MarkerTooltip>
          </MapMarker>
        )
      })}

      {/* Offshore sentinel line */}
      {SENTINELS.map((s) => {
        const w = sentinelById[s.id]
        const hot = w ? w.maxGust24h >= 60 : false
        return (
          <MapMarker key={s.id} coordinates={s.coordinates}>
            <MarkerContent>
              <span
                className={cn(
                  "block h-2.5 w-2.5 rotate-45 border",
                  hot ? "border-watch bg-watch/50" : "border-rain/70 bg-rain/20"
                )}
              />
            </MarkerContent>
            <MarkerTooltip>
              <div className="min-w-44 text-xs">
                <p className="font-semibold">Sentinel · {s.nameEn}</p>
                {w ? (
                  <ul className="mt-1 space-y-0.5 text-storm-300">
                    <li>Max gust 24h: {Math.round(w.maxGust24h)} km/h</li>
                    <li>Pressure {Math.round(w.pressure)} hPa</li>
                  </ul>
                ) : (
                  <p className="text-storm-300">Loading…</p>
                )}
              </div>
            </MarkerTooltip>
          </MapMarker>
        )
      })}

      {/* Live weather over Cambodia. Every effect below is switched on by the
          station's own reading — rain only falls where rain is reported, and
          lightning only strikes on a WMO thunderstorm code (95/96/99). */}
      {activeWeather.map((w) => {
        const raining = isRaining(w)
        const thundering = isThundering(w)

        return (
          <Fragment key={`wx-${w.station.id}`}>
            {raining && (
              <MapRain
                id={`rain-${w.station.id}`}
                coordinates={w.station.coordinates}
                intensity={rainIntensity(w)}
                color={palette.rain}
                size={thundering ? 180 : 140}
                animated={animate}
              />
            )}
            {thundering && (
              <MapLightning
                id={`bolt-${w.station.id}`}
                coordinates={w.station.coordinates}
                size={170}
                boltColor={palette.bolt}
                flashColor={palette.flash}
                flashIntensity={0.45}
                strikeInterval={3200}
                boltWidth={3}
                autoStrike={animate}
              />
            )}
          </Fragment>
        )
      })}

      {/* Observed track, as reported by the warning centres. A track needs two
          fixes before there is anything to draw. */}
      {storm && storm.track.length >= 2 && (
        <MapLineAnimated
          id="storm-track"
          path={storm.track}
          color={palette.track}
          width={2.5}
          opacity={0.85}
          dashArray={[2, 2]}
          duration={9000}
          loop={simulation}
          showMarker={false}
        />
      )}

      {/* Where the current heading leads. Drawn thinner, paler and in a
          repeating outward sweep so it reads as a projection rather than as
          more reported track — the dashes flow the way the system is moving. */}
      {motion && (
        <MapLineAnimated
          id="storm-heading"
          path={motion.projection}
          color={palette.heading}
          width={2}
          opacity={0.65}
          dashArray={[1, 2]}
          duration={2600}
          loop
          showMarker
          markerColor={palette.heading}
          markerBorderless
        />
      )}

      {/* The cyclone itself (terrae Environment component). In replay mode it
          walks the real track; live, it sits on the latest reported fix. */}
      {storm && (
        <MapCyclone
          id="active-storm"
          coordinates={storm.center}
          path={simulation && storm.track.length >= 2 ? storm.track : undefined}
          duration={45000}
          loop={simulation}
          size={simulation ? 260 : 220}
          intensity={cycloneIntensity(storm.currentWindKmh ?? storm.peakWindKmh)}
          particleCount={140}
          autoStart={animate}
          funnelColor={palette.funnel}
          debrisColor={palette.debris}
        />
      )}
    </Map>
  )
}

function UserLocationTooltip({ location }: { location: UserLocation }) {
  const nearest = nearestStation(location.coordinates)
  return (
    <div className="min-w-44 text-xs">
      <p className="font-semibold">
        Your location · <span className="font-khmer">ទីតាំងរបស់អ្នក</span>
      </p>
      <ul className="mt-1 space-y-0.5 text-storm-300">
        <li className="font-mono">
          {location.coordinates[1].toFixed(3)}, {location.coordinates[0].toFixed(3)}
        </li>
        <li>Accuracy ±{Math.round(location.accuracy)} m</li>
        {nearest && (
          <li>
            {Math.round(nearest.distanceKm)} km from {nearest.station.nameEn}
          </li>
        )}
      </ul>
    </div>
  )
}

/**
 * Centres the map on a coordinate once per new fix. Lives inside <Map> so it can
 * reach the map instance through context; renders nothing.
 */
function FlyTo({ coordinates, zoom }: { coordinates: Coordinates; zoom: number }) {
  const { map, isLoaded } = useMap()
  const [lon, lat] = coordinates

  useEffect(() => {
    if (!map || !isLoaded) {
      return
    }
    map.flyTo({ center: [lon, lat], zoom, duration: 1500 })
  }, [map, isLoaded, lon, lat, zoom])

  return null
}
