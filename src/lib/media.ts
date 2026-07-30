import { useEffect, useState } from "react"

/**
 * Subscribes to a media query. Used to mount either the docked rail or the
 * sheet — never both. Doing this with CSS `hidden` instead would mount two
 * copies of every card, doubling the DOM and the work each poll triggers.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)

  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener("change", update)
    return () => list.removeEventListener("change", update)
  }, [query])

  return matches
}

/** Matches Tailwind's `lg` breakpoint, where the rail docks beside the map. */
export const useIsDesktop = () => useMediaQuery("(min-width: 64rem)")
