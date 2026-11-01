'use client'

/**
 * Day 57 — Web Share API + clipboard share helpers.
 *
 * HONEST capability model:
 *  - `navigator.share` with FILES (level 2) is the only way to hand the actual
 *    rendered video/audio/image to the OS share sheet — widely available on
 *    mobile Chrome/Safari, rarely on desktop. `canShareFile()` probes the REAL
 *    capability per mime type via navigator.canShare and the UI disables the
 *    button with a truthful label when the platform says no.
 *  - The OS clipboard cannot hold video/audio/zip blobs — for those we copy a
 *    share TEXT summary instead (labeled as such). Plain text (sidecar
 *    captions) and PNG images DO have real clipboard paths: writeText and
 *    ClipboardItem('image/png') respectively, both with graceful fallbacks.
 */
import { toast } from 'sonner'

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'error'

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share === 'undefined') return false
  try {
    const probe = new File([new Blob(['probe'])], 'probe.txt', { type: 'text/plain' })
    return !!navigator.canShare?.({ files: [probe] })
  } catch {
    return false
  }
}

/** probe whether THIS exact file type can go through the OS share sheet */
export function canShareThisMime(mime: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share === 'undefined') return false
  try {
    const probe = new File([new Blob(['probe'])], 'probe', { type: mime })
    return !!navigator.canShare?.({ files: [probe] })
  } catch {
    return false
  }
}

export interface ShareFileOptions {
  title?: string
  text?: string
}

/** fetch the blob URL, wrap it in a File, hand it to the OS share sheet */
export async function shareBlobAsFile(
  blobUrl: string,
  fileName: string,
  mime: string,
  opts?: ShareFileOptions
): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unsupported'
  try {
    const blob = await (await fetch(blobUrl)).blob()
    const file = new File([blob], fileName, { type: mime })
    if (!navigator.canShare?.({ files: [file] })) return 'unsupported'
    await navigator.share({ files: [file], title: opts?.title, text: opts?.text })
    return 'shared'
  } catch (err) {
    const e = err as DOMException
    if (e?.name === 'AbortError') return 'cancelled'
    return 'error'
  }
}

export async function shareText(text: string, title?: string): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unsupported'
  try {
    await navigator.share({ title, text })
    return 'shared'
  } catch (err) {
    const e = err as DOMException
    if (e?.name === 'AbortError') return 'cancelled'
    return 'error'
  }
}

/** clipboard text with a legacy execCommand fallback; returns success */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/**
 * Copy a PNG blob as a real image onto the clipboard (ClipboardItem).
 * Only image/png is universally supported by the async clipboard — other
 * types return false and the caller falls back to copyText.
 */
export async function copyImageBlob(blobUrl: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
    const blob = await (await fetch(blobUrl)).blob()
    if (blob.type !== 'image/png') return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

export function shareSummaryText(fileName: string, sizeBytes: number, extra?: string): string {
  const kb = sizeBytes >= 1024 * 1024 ? `${(sizeBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
  return `${fileName} · ${kb}${extra ? ` · ${extra}` : ''} — made locally with NovaCut Studio`
}

/** one toast per outcome — every path tells the truth */
export function toastShareOutcome(outcome: ShareOutcome, what: string): void {
  if (outcome === 'shared') toast.success(`${what} shared`)
  else if (outcome === 'cancelled') toast.message('Share sheet closed — nothing shared')
  else if (outcome === 'unsupported') toast.error(`${what} can't be shared from this device — download it instead`)
  else toast.error(`Sharing ${what} failed`)
}
