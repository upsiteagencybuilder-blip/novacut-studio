'use client'

/**
 * NovaCut Studio — UX60 Phase 6 (Days 44–45): polite live-region announcer.
 *
 * Screen-reader output for async operations that live OUTSIDE the focus
 * path (autosave transitions, export milestones, crash recovery): a single
 * visually-hidden `role="status" aria-live="polite"` node appended to the
 * body once and reused. Re-announcing the same message works — text is
 * cleared first and set on the next frame so the mutation is observed.
 *
 * Sonner toasts already carry their own polite region for click-feedback;
 * this channel covers the operations a keyboard/SR user would otherwise
 * never notice happening in the background.
 */

let node: HTMLElement | null = null

function ensureNode(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  if (node && document.contains(node)) return node
  node = document.createElement('div')
  node.setAttribute('data-nc-live-region', '')
  node.setAttribute('role', 'status')
  node.setAttribute('aria-live', 'polite')
  node.className = 'sr-only'
  document.body.appendChild(node)
  return node
}

/** announce a background state change politely (safe no-op on the server) */
export function announce(message: string) {
  const el = ensureNode()
  if (!el) return
  el.textContent = ''
  window.setTimeout(() => {
    if (el && document.contains(el)) el.textContent = message
  }, 30)
}
