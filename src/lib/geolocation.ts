import { useCallback, useEffect, useRef, useState } from "react"
import type { Coordinates } from "./storm"

export type LocateStatus = "idle" | "locating" | "ready" | "denied" | "unavailable" | "error"

export type UserLocation = {
  coordinates: Coordinates
  /** Reported horizontal accuracy in metres. */
  accuracy: number
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 60_000,
}

function messageFor(error: GeolocationPositionError): { status: LocateStatus; message: string } {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      status: "denied",
      message: "Location permission was blocked. Allow it in your browser's site settings.",
    }
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return { status: "unavailable", message: "Your device could not determine a position." }
  }
  return { status: "error", message: "Locating timed out. Try again." }
}

/**
 * Wraps the Geolocation API. On mount it only auto-locates when permission has
 * already been granted, so a first-time visitor is never ambushed by a browser
 * prompt they did not ask for.
 */
export function useGeolocation() {
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [status, setStatus] = useState<LocateStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable")
      setError("This browser does not support location. Geolocation also needs HTTPS or localhost.")
      return
    }

    setStatus("locating")
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return
        setLocation({
          coordinates: [position.coords.longitude, position.coords.latitude],
          accuracy: position.coords.accuracy,
        })
        setStatus("ready")
      },
      (positionError) => {
        if (!mountedRef.current) return
        const { status: nextStatus, message } = messageFor(positionError)
        setStatus(nextStatus)
        setError(message)
      },
      GEO_OPTIONS
    )
  }, [])

  useEffect(() => {
    if (!("permissions" in navigator) || !("geolocation" in navigator)) {
      return
    }
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        if (result.state === "granted" && mountedRef.current) {
          locate()
        }
      })
      .catch(() => {
        // Permissions API unsupported — wait for an explicit request.
      })
  }, [locate])

  return { location, status, error, locate }
}
