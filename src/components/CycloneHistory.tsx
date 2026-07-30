import { History } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { cycloneCategory, type Cyclone } from "@/lib/cyclones"

/**
 * Every cyclone in the track record that reached Cambodia, nearest approach
 * first. Selecting one draws its real observed track on the map.
 *
 * Note the wording: "closest approach", not "crossed". Warning centres stop
 * issuing fixes once a system drops below tropical-depression strength, which
 * for Cambodia usually happens over Vietnam or Laos — so the track record ends
 * short of the border even when the remnants carried on inland.
 */
export function CycloneHistory({
  cyclones,
  selectedId,
  onSelect,
}: {
  cyclones: Cyclone[]
  selectedId: string | null
  onSelect: (cyclone: Cyclone) => void
}) {
  if (cyclones.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-rain" /> Storms that reached Cambodia
          </span>
          <span className="font-mono text-[11px] font-normal text-storm-500">
            {cyclones.length}
          </span>
        </CardTitle>
        <p className="font-khmer text-xs text-storm-300">ព្យុះដែលបានមកដល់កម្ពុជា</p>
      </CardHeader>

      <CardContent>
        {/* Bounded and scrolled rather than pushed down the rail — the list can
            run to dozens of storms and would otherwise bury everything below. */}
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {cyclones.map((c) => {
          const selected = c.id === selectedId
          const date = new Date(c.observedAt)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              aria-pressed={selected}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                selected
                  ? "border-rain bg-rain/10"
                  : "border-transparent bg-storm-800/60 hover:bg-storm-800"
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-storm-100">
                  {c.shortName}{" "}
                  <span className="font-normal text-storm-500">{c.designation}</span>
                </p>
                <p className="font-mono text-[10px] text-storm-500">
                  {date.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {c.peakWindKmh != null && ` · peak ${Math.round(c.peakWindKmh)} km/h`}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-xs text-storm-100">
                  {Math.round(c.closestApproachKm)} km
                </span>
                {c.crossedCambodia ? (
                  <Badge variant="danger" className="px-1.5 py-0 text-[9px]">
                    crossed
                  </Badge>
                ) : (
                  <span className="text-[9px] uppercase tracking-wider text-storm-500">
                    {cycloneCategory(c.peakWindKmh).split(" ").slice(-1)[0]}
                  </span>
                )}
              </div>
              </button>
            )
          })}
        </div>

        <p className="pt-2 text-[11px] leading-relaxed text-storm-500">
          Distance is the closest the reported track came to central Cambodia. Fixes stop once a
          system weakens, so a track ending nearby can still have brought rain inland.
        </p>
      </CardContent>
    </Card>
  )
}
