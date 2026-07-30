import { useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Thumb travel is the transitions.dev p27 double-bounce — keyframes and the
 * --toggle-* variables live in index.css alongside the app's other motion.
 *
 * `init` gates those keyframes: on first paint the thumb should simply be
 * wherever `checked` says, not animate itself into place.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
}) {
  const [init, setInit] = useState(false)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-on={checked ? "true" : "false"}
      onClick={() => {
        setInit(true)
        onCheckedChange(!checked)
      }}
      className={cn(
        "t-toggle",
        init && "is-init",
        "relative h-6 w-11 shrink-0 cursor-pointer rounded-full",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rain",
        checked ? "bg-rain" : "bg-track"
      )}
    >
      {/* A white knob is the only fill that stays visible on both the neutral
          track and the accent track, in either theme. The shadow is what makes
          it read as sitting on top rather than cut out of the track. */}
      <span
        className="t-toggle-thumb absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.28)]"
        aria-hidden="true"
      />
    </button>
  )
}
