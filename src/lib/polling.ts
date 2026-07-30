import { useEffect, useRef, useState } from "react"

/**
 * Runs a loader on an interval, but only while the tab is actually being
 * looked at. A one-minute poll left running in a background tab burns the
 * shared Open-Meteo quota for nobody's benefit, so polling stops on hide and
 * fires once immediately on show — which also means a tab you come back to is
 * never showing stale numbers.
 */
export function usePolling(load: () => void, intervalMs: number) {
  // Kept in a ref so a changing callback identity doesn't restart the timer.
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let timer: number | undefined

    const start = () => {
      stop()
      timer = window.setInterval(() => loadRef.current(), intervalMs)
    }

    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }

    const handleVisibility = () => {
      if (document.hidden) {
        stop()
        return
      }
      loadRef.current()
      start()
    }

    loadRef.current()
    start()
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [intervalMs])
}

/**
 * A clock that ticks once a second, so "updated 34s ago" actually counts up
 * instead of freezing at whatever it said when the data last changed.
 */
export function useNow(tickMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Only tick while visible; a hidden tab has nothing to redraw.
      if (!document.hidden) setNow(Date.now())
    }, tickMs)
    return () => window.clearInterval(timer)
  }, [tickMs])

  return now
}

/**
 * Tracks the OS "reduce motion" setting. The map's rain, lightning and cyclone
 * sprites repaint every frame forever, which is exactly the kind of continuous
 * animation that setting exists to stop.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  )

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return reduced
}

/** "just now" / "34s ago" / "4m ago" / "2h ago" — coarsest useful unit. */
export function formatSince(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
