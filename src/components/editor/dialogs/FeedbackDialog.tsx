'use client'

/**
 * Day 47 — In-app feedback widget. Writes to the existing Feedback model
 * (deviceId + optional 1–5 rating + message). Shows the device's sent
 * count honestly; the server enforces 5/hour/device.
 */
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, MessageSquareHeart, Send, Star } from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import { getDeviceId } from '@/lib/cloud/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export function FeedbackDialog() {
  const open = useEditor((s) => s.activeDialog === 'feedback')
  const openDialog = useEditor((s) => s.openDialog)

  const [rating, setRating] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTotal, setSentTotal] = useState<number | null>(null)
  const [lastAt, setLastAt] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    fetch(`/api/feedback?deviceId=${encodeURIComponent(getDeviceId())}`)
      .then((r) => r.json())
      .then((d: { total?: number; last?: { createdAt: string } | null }) => {
        setSentTotal(d.total ?? 0)
        setLastAt(d.last?.createdAt ?? null)
      })
      .catch(() => setSentTotal(null))
  }, [open])

  const handleSend = async () => {
    if (sending) return
    const text = message.trim()
    if (!text) {
      toast.error('Write a few words first')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: getDeviceId(), rating: rating ?? undefined, message: text }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; totalFromDevice?: number }
      if (!res.ok) throw new Error(body.error || `sending failed (${res.status})`)
      toast.success('Feedback sent — thank you!')
      setSentTotal(body.totalFromDevice ?? null)
      setLastAt(new Date().toISOString())
      setMessage('')
      setRating(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send feedback')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && openDialog(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquareHeart className="size-4 text-fuchsia-400" />
            Send feedback
          </DialogTitle>
          <DialogDescription>
            Bugs, ideas, anything — it lands in the NovaCut inbox with your device id (no account).
          </DialogDescription>
        </DialogHeader>

        {/* rating row */}
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Rating (optional)">
          <span className="mr-1 text-[10px] text-muted-foreground">Optional rating:</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => setRating(rating === n ? null : n)}
              className={cn(
                'rounded-md p-1 transition hover:scale-110',
                rating !== null && n <= rating ? 'text-amber-300' : 'text-muted-foreground/50',
              )}
            >
              <Star className={cn('size-4', rating !== null && n <= rating && 'fill-amber-300')} />
            </button>
          ))}
        </div>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
          placeholder="What worked, what broke, what you wish existed…"
          aria-label="Feedback message"
          rows={4}
          className="resize-none border-(--nc-line) bg-(--nc-panel) text-xs focus-visible:ring-fuchsia-400/50"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            {message.length}/2000
            {sentTotal !== null && ` · ${sentTotal} sent from this device`}
            {lastAt && ` · last ${formatDistanceToNow(new Date(lastAt), { addSuffix: true })}`}
          </p>
          <Button
            variant="ghost"
            disabled={sending || message.trim().length === 0}
            onClick={() => void handleSend()}
            className="nc-gradient nc-glow-hover h-9 shrink-0 rounded-lg px-3.5 text-xs font-semibold text-white hover:opacity-90"
          >
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default FeedbackDialog
