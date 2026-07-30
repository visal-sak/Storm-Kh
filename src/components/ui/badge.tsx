import * as React from "react"
import { cn } from "@/lib/utils"

type Variant = "safe" | "watch" | "danger" | "neutral"

const styles: Record<Variant, string> = {
  safe: "bg-safe/15 text-safe border-safe/40",
  watch: "bg-watch/15 text-watch border-watch/40",
  danger: "bg-danger/15 text-danger border-danger/40",
  neutral: "bg-storm-800 text-storm-300 border-storm-700",
}

export function Badge({
  className,
  variant = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        styles[variant],
        className
      )}
      {...props}
    />
  )
}
