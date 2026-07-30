import { CloudRain, Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { nationalHours, type StationWeather } from "@/lib/storm"

/** Rain in mm/h that fills the full bar height. Above this, bars just cap out. */
const RAIN_FULL_SCALE = 6

/**
 * Hour-by-hour rain, cloud and thunder for today across all 25 provinces.
 * Every column is one hour of Open-Meteo's hourly series in Asia/Phnom_Penh
 * local time — the same field the map effects are driven from, so the strip
 * and the map never disagree.
 */
export function HourlyToday({
  stations,
  dateLabel,
}: {
  stations: StationWeather[]
  dateLabel: string
}) {
  const hours = nationalHours(stations)
  if (hours.length === 0) return null

  const totalRain = hours.reduce((sum, h) => sum + h.meanRain, 0)
  const thunderHours = hours.filter((h) => h.thunderCount > 0).length
  const wettest = hours.reduce((a, b) => (b.meanRain > a.meanRain ? b : a))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Today · hourly</span>
          <span className="font-mono text-[11px] font-normal text-storm-500">{dateLabel}</span>
        </CardTitle>
        <p className="font-khmer text-xs text-storm-300">ថ្ងៃនេះ · មួយម៉ោងម្ដង</p>
      </CardHeader>

      <CardContent>
        <div className="flex h-20 items-end gap-[3px]">
          {hours.map((h) => {
            const fill = Math.min(1, h.meanRain / RAIN_FULL_SCALE)
            return (
              <div
                key={h.hour}
                // h-full matters: the bars below are sized in %, which collapses
                // to zero unless the column has a definite height to resolve against.
                className="group relative flex h-full flex-1 flex-col items-center justify-end"
                title={`${String(h.hour).padStart(2, "0")}:00 · ${h.meanRain.toFixed(1)} mm avg · peak ${h.maxRain.toFixed(1)} mm · cloud ${Math.round(h.meanCloud)}%${
                  h.thunderCount ? ` · thunder in ${h.thunderCount}` : ""
                }`}
              >
                {/* Cloud cover sits behind rain as a faint column */}
                <div
                  className="absolute bottom-0 w-full rounded-sm bg-storm-500/15"
                  style={{ height: `${Math.max(4, h.meanCloud)}%` }}
                />
                <div
                  className={cn(
                    "relative w-full rounded-sm transition-all",
                    h.thunderCount > 0 ? "bg-watch" : "bg-rain",
                    h.isPast && "opacity-45"
                  )}
                  style={{ height: `${Math.max(fill > 0 ? 6 : 2, fill * 100)}%` }}
                />
              </div>
            )
          })}
        </div>

        <div className="mt-1 flex justify-between font-mono text-[10px] text-storm-500">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <Summary
            icon={<CloudRain className="h-3 w-3" />}
            label="rain today"
            value={`${totalRain.toFixed(1)} mm`}
          />
          <Summary
            icon={<CloudRain className="h-3 w-3" />}
            label="wettest"
            value={`${String(wettest.hour).padStart(2, "0")}:00`}
          />
          <Summary
            icon={<Zap className="h-3 w-3" />}
            label="thunder hrs"
            value={`${thunderHours}`}
            highlight={thunderHours > 0}
          />
        </div>

        <p className="mt-2 text-[11px] text-storm-500">
          Averaged across all {stations.length} provinces · amber bars are hours with a
          thunderstorm forecast somewhere in the country.
        </p>
      </CardContent>
    </Card>
  )
}

function Summary({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg bg-storm-800/60 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-storm-500">
        {icon} {label}
      </p>
      <p className={cn("font-mono text-sm", highlight ? "text-watch" : "text-storm-100")}>{value}</p>
    </div>
  )
}
