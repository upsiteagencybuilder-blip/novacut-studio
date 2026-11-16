'use client'

/**
 * UX60 Phase 7 (Days 49–52) — the shared async-placeholder for panel surfaces.
 *
 * Every lazy panel (and the properties sheet) mounts behind one of these:
 * the surface's real skeleton shape renders immediately while the chunk
 * evaluates, so nothing ever greets the user with a bare spinner. The shapes
 * mirror the real layouts (header + list/grid rows) to avoid layout shift
 * when the real panel swaps in.
 */

import { Skeleton } from '@/components/ui/skeleton'

function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2 px-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  )
}

/** list-shaped panel (text / audio / AI results) */
export function PanelSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex h-full flex-col gap-3 pt-3" data-nc-panel-skeleton>
      <div className="flex items-center gap-2 px-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="ml-auto h-7 w-9 rounded-md" />
      </div>
      <SkeletonRows rows={rows} className="h-14 rounded-lg" />
      <span className="sr-only">Loading panel…</span>
    </div>
  )
}

/** grid-shaped panel (media / stickers / effects catalogs) */
export function PanelGridSkeleton({ tiles = 8 }: { tiles?: number }) {
  return (
    <div className="flex h-full flex-col gap-3 pt-3" data-nc-panel-skeleton>
      <div className="flex items-center gap-2 px-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="ml-auto h-7 w-9 rounded-md" />
      </div>
      <Skeleton className="mx-3 h-8 rounded-md" />
      <div className="grid grid-cols-2 gap-2 px-3" aria-hidden>
        {Array.from({ length: tiles }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <span className="sr-only">Loading panel…</span>
    </div>
  )
}

/** narrow properties-column skeleton (right rail / mobile props sheet) */
export function PropertiesSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 pt-3" data-nc-panel-skeleton>
      <div className="flex items-center gap-2 px-4">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="flex flex-col gap-3 px-4" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 rounded-md" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading properties…</span>
    </div>
  )
}
