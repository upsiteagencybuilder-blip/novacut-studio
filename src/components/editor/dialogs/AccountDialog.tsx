'use client'

/**
 * Day 48 — OPTIONAL account scaffolding.
 * Sign-in is never required: the editor stays local-first and all cloud
 * features work on deviceId alone. Signing in only enables device linking
 * (this device ↔ account), which a future iteration will use to scope
 * cloud data across devices.
 */
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Link2, Loader2, LogIn, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import { getDeviceId } from '@/lib/cloud/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface LinkedDevice {
  deviceId: string
  deviceName: string
  updatedAt: string
}

export function AccountDialog() {
  const open = useEditor((s) => s.activeDialog === 'account')
  const openDialog = useEditor((s) => s.openDialog)
  const { data: session, status } = useSession()
  const [name, setName] = useState('')
  const [linking, setLinking] = useState(false)
  const [devices, setDevices] = useState<LinkedDevice[] | null>(null)
  const [myDeviceId, setMyDeviceId] = useState('')

  useEffect(() => {
    setMyDeviceId(getDeviceId())
  }, [])

  const refreshDevices = () => {
    fetch('/api/cloud/link')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unauthorized'))))
      .then((d: { devices: LinkedDevice[] }) => setDevices(d.devices))
      .catch(() => setDevices(null))
  }

  useEffect(() => {
    if (open && session) refreshDevices()
    if (open && !session) setDevices(null)
  }, [open, session])

  const handleLink = async () => {
    if (linking) return
    setLinking(true)
    try {
      const res = await fetch('/api/cloud/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-novacut-device': getDeviceId() },
        body: JSON.stringify({
          deviceName: navigator.userAgent.includes('Mobile') ? 'This phone' : 'This browser',
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'link failed')
      toast.success('Device linked to your account')
      refreshDevices()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Link failed')
    } finally {
      setLinking(false)
    }
  }

  const handleUnlink = async (deviceId: string) => {
    try {
      const res = await fetch(`/api/cloud/link?deviceId=${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('unlink failed')
      toast.success('Device unlinked')
      refreshDevices()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unlink failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && openDialog(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-fuchsia-400" />
            Account
          </DialogTitle>
          <DialogDescription>
            Optional — everything works signed out. Signing in links this device to an account for
            future cross-device cloud scoping.
          </DialogDescription>
        </DialogHeader>

        {status === 'loading' ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : session ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--nc-panel) text-sm font-bold text-fuchsia-300">
                {(session.user?.name ?? '?').charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{session.user?.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  id: {(session.user as { id?: string })?.id ?? '—'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 border border-(--nc-line-strong) px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  void signOut()
                  toast.info('Signed out')
                }}
              >
                <LogOut className="size-3.5" />
                Sign out
              </Button>
            </div>

            <div className="rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <Link2 className="size-3.5 text-sky-300" />
                  Linked devices
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 border border-(--nc-line-strong) px-2 text-[10px] hover:border-fuchsia-400/50 hover:text-foreground"
                  disabled={linking}
                  onClick={() => void handleLink()}
                >
                  {linking ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />}
                  Link this device
                </Button>
              </div>
              {devices === null ? (
                <p className="mt-1.5 text-[10px] text-muted-foreground">Loading…</p>
              ) : devices.length === 0 ? (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  No devices linked yet — link this one to start.
                </p>
              ) : (
                <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
                  {devices.map((d) => (
                    <div
                      key={d.deviceId}
                      className="flex items-center gap-2 rounded-lg border border-(--nc-line) bg-(--nc-panel) px-2.5 py-1.5"
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${d.deviceId === myDeviceId ? 'bg-emerald-400' : 'bg-zinc-500'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium">
                          {d.deviceName || 'Unnamed device'}
                          {d.deviceId === myDeviceId && ' (this device)'}
                        </p>
                        <p className="truncate text-[9px] text-muted-foreground">
                          {d.deviceId} · linked {formatDistanceToNow(new Date(d.updatedAt), { addSuffix: true })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-[10px] text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-300"
                        onClick={() => void handleUnlink(d.deviceId)}
                      >
                        Unlink
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim().length >= 2) {
                    void signIn('credentials', { name: name.trim(), callbackUrl: '/' })
                  }
                }}
                placeholder="Display name (2–40 chars)"
                aria-label="Display name"
                className="h-9 border-(--nc-line) bg-(--nc-panel) text-xs focus-visible:ring-fuchsia-400/50"
              />
              <Button
                variant="ghost"
                disabled={name.trim().length < 2}
                onClick={() => void signIn('credentials', { name: name.trim(), callbackUrl: '/' })}
                className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white hover:opacity-90"
              >
                <LogIn className="size-3.5" />
                Sign in (scaffolding identity)
              </Button>
            </div>
            <p className="text-[9.5px] leading-relaxed text-muted-foreground/70">
              Scaffold note: this creates a local identity for device linking. GitHub/Google providers
              activate automatically when their env keys exist. No cloud behavior changes until you
              link a device.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default AccountDialog
