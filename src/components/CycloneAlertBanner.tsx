import { AlertTriangle, Info, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CycloneAlert } from "@/lib/alert"

const STYLES = {
  warning: {
    box: "border-danger/50 bg-danger/10",
    text: "text-danger",
    Icon: AlertTriangle,
  },
  watch: {
    box: "border-watch/50 bg-watch/10",
    text: "text-watch",
    Icon: Radio,
  },
  advisory: {
    box: "border-storm-700 bg-storm-800/50",
    text: "text-storm-300",
    Icon: Info,
  },
} as const

/**
 * Khmer leads and carries the larger type — an alert that only reads in English
 * is not an alert for most of the people it concerns.
 */
export function CycloneAlertBanner({ alert }: { alert: CycloneAlert }) {
  if (alert.level === "none") return null

  const { box, text, Icon } = STYLES[alert.level]

  return (
    <div
      role={alert.level === "warning" ? "alert" : "status"}
      aria-live={alert.level === "warning" ? "assertive" : "polite"}
      className={cn("rounded-xl border p-3", box)}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", text)} />
        <div className="min-w-0">
          <p className={cn("font-khmer text-sm leading-snug font-semibold", text)}>
            {alert.headlineKm}
          </p>
          <p className="font-khmer mt-1 text-xs leading-relaxed text-storm-300">{alert.bodyKm}</p>

          <p className="mt-2 text-[11px] font-medium text-storm-300">{alert.headlineEn}</p>
          <p className="text-[11px] text-storm-500">{alert.bodyEn}</p>

          <p className="font-khmer mt-2 border-t border-storm-700/60 pt-2 text-[11px] text-storm-500">
            {alert.adviceKm}
          </p>
        </div>
      </div>
    </div>
  )
}
