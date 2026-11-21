'use client'

/**
 * NovaCut Studio — UX60 Phase 6 (Days 41–43): grid roving focus.
 *
 * Panel content (media cards, text presets, sticker cells, effect cards,
 * sound rows, pro-wall cards) is a grid of items marked `[data-nc-item]`.
 * Attach `rovingGridKeydown` to the grid container and arrow keys move
 * focus to the spatially nearest item — grid-aware via measured rects —
 * with Home/End jumping to the first/last item. Items keep Tab behavior
 * (real buttons / tabIndex=0), so nothing is removed from tab order.
 */

/** visible, focusable roving items inside the container, in DOM order */
function rovingItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-nc-item]')).filter(
    (el) => el.offsetParent !== null && !el.hasAttribute('disabled'),
  )
}

/** nearest item to `from` in the given direction (unit vector), or null */
function nearest(items: HTMLElement[], from: HTMLElement, dx: -1 | 0 | 1, dy: -1 | 0 | 1): HTMLElement | null {
  const r = from.getBoundingClientRect()
  let best: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const it of items) {
    if (it === from) continue
    const b = it.getBoundingClientRect()
    // require real movement along the primary axis
    if (dx < 0 && b.right > r.left + 1) continue
    if (dx > 0 && b.left < r.right - 1) continue
    if (dy < 0 && b.bottom > r.top + 1) continue
    if (dy > 0 && b.top < r.bottom - 1) continue
    const cx = (b.left + b.right) / 2 - (r.left + r.right) / 2
    const cy = (b.top + b.bottom) / 2 - (r.top + r.bottom) / 2
    // cross-axis closeness weighted double so columns/rows stay straight
    const score = Math.abs(cx) * (dy !== 0 ? 2 : 1) + Math.abs(cy) * (dx !== 0 ? 2 : 1)
    if (score < bestScore) {
      bestScore = score
      best = it
    }
  }
  return best
}

/**
 * Container keydown handler: arrows/Home/End rove focus across
 * `[data-nc-item]` children. If focus is outside the grid entirely, the
 * first arrow press enters the first item (no trap — Tab still leaves).
 */
export function rovingGridKeydown(e: React.KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(e.key)) return
  const container = e.currentTarget
  const items = rovingItems(container)
  if (!items.length) return

  const active = document.activeElement as HTMLElement | null
  const current = active && items.includes(active) ? active : null

  let target: HTMLElement | null = null
  if (e.key === 'Home') target = items[0]
  else if (e.key === 'End') target = items[items.length - 1]
  else if (!current) target = items[0]
  else {
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    target = nearest(items, current, dx, dy) ?? current
  }

  if (target && target !== current) {
    e.preventDefault()
    target.focus()
    // keep the item in view even when the container is the scroll box
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
  }
}

/** programmatic focus into a panel grid (used by Alt+N hand-off) */
export function focusFirstRovingItem(container: HTMLElement | null) {
  const first = container?.querySelector<HTMLElement>('[data-nc-item]')
  first?.focus()
}
