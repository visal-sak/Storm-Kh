import * as React from "react"
import { cn } from "@/lib/utils"

type Variant = "default" | "outline" | "ghost"

const styles: Record<Variant, string> = {
  default: "bg-rain text-storm-950 hover:bg-rain/85 font-semibold",
  outline: "border border-storm-700 text-storm-100 hover:bg-storm-800",
  ghost: "text-storm-300 hover:bg-storm-800 hover:text-storm-100",
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(({ className, variant = "default", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      // Tailwind v4's preflight resets buttons to cursor: default.
      "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 text-sm transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rain",
      "disabled:cursor-not-allowed disabled:opacity-50",
      styles[variant],
      className
    )}
    {...props}
  />
))
Button.displayName = "Button"
