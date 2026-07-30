import { useEffect, useRef, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Bottom sheet for small screens. Hand-rolled rather than pulled from Radix,
 * because this project has no Radix dependency and one primitive is not worth
 * adding the tree for.
 *
 * Covers the parts that are easy to skip and immediately noticeable when
 * missing: Escape to close, backdrop click, background scroll lock, focus moved
 * in on open and restored on close, and `aria-modal` so assistive tech treats
 * the page behind it as inert.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement as HTMLElement | null

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)

    // Lock the page behind the sheet; without this, scrolling the sheet to its
    // end starts scrolling the document underneath it.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    panelRef.current?.focus()

    return () => {
      document.removeEventListener("keydown", handleKey)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-end">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-storm-950/60 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[88vh] w-full flex-col rounded-t-2xl border border-storm-700/70 bg-storm-950 shadow-2xl outline-none",
          // On a landscape phone or small tablet a full-width sheet is wasteful,
          // so it becomes a right-hand panel once there is room for one.
          "sm:h-full sm:max-h-none sm:w-[24rem] sm:rounded-t-none sm:rounded-l-2xl sm:border-r-0",
          className
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-storm-700/60 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-storm-100">{title}</p>
            {subtitle && <p className="font-khmer truncate text-xs text-storm-300">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-storm-300 transition-colors hover:bg-storm-800 hover:text-storm-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* overscroll-contain stops a flick at the end of the list from
            scrolling the page behind the sheet on iOS. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
