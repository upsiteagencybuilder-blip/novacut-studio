'use client'

/**
 * Bridge between the Zustand store and the canvas engine.
 * Mount once inside the editor shell; pass the canvas ref through the store-independent
 * engine singleton returned here.
 */
import { useEffect, useRef } from 'react'
import { getEngine } from '@/lib/editor/engine'
import { useEditor } from '@/lib/editor/store'
import { projectDuration } from '@/lib/editor/utils'

export function useEngineBridge(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const initedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || initedRef.current) return
    initedRef.current = true

    const engine = getEngine()
    engine.attach(
      canvas,
      () => {
        const s = useEditor.getState()
        return {
          project: s.project,
          mediaMap: s.getMediaMap(),
          masterVolume: s.masterVolume,
          masterMuted: s.masterMuted,
        }
      },
      {
        onTimeUpdate: (t) => {
          const s = useEditor.getState()
          if (!s.isPlaying) return
          s.setCurrentTime(t)
        },
        onEnded: () => {
          const s = useEditor.getState()
          s.pause()
          // reverse shuttle ends at t=0 — don't yank the playhead to the end
          const endedAt = getEngine().currentTime
          s.setCurrentTime(endedAt <= 0.01 ? 0 : projectDuration(s.project))
        },
      }
    )
    // sync the engine clock with the restored playhead (subscribe below only
    // sees changes that happen AFTER mount — without this the first frame
    // renders at t=0, e.g. a black canvas when clips fade in)
    engine.seekTo(useEditor.getState().currentTime)

    const unsubscribe = useEditor.subscribe((state, prev) => {
      // play / pause
      if (state.isPlaying !== prev.isPlaying) {
        if (state.isPlaying) {
          const engine2 = getEngine()
          const st2 = useEditor.getState()
          engine2.seekTo(st2.currentTime)
          // restarting from the end: the engine rewinds its clock to 0 — keep
          // the store clock in sync too, or the scrub-correction below fires
          // immediately after and yanks the playhead back to the end (play
          // then died instantly — a long-standing bug)
          if (st2.currentTime >= projectDuration(st2.project) - 0.05) {
            useEditor.setState({ currentTime: 0 })
          }
          engine2.play(st2.jklRate === 0 ? 1 : st2.jklRate)
        } else {
          getEngine().pause()
          getEngine().setRate(1)
        }
      }
      // JKL shuttle speed/direction changes mid-playback
      else if (state.jklRate !== prev.jklRate && state.isPlaying) {
        getEngine().setRate(state.jklRate === 0 ? 1 : state.jklRate)
      }
      // external seek while paused
      if (!state.isPlaying && state.currentTime !== prev.currentTime) {
        getEngine().seekTo(state.currentTime)
      }
      // user scrubbed the playhead during playback → re-sync engine clock
      if (state.isPlaying && Math.abs(state.currentTime - getEngine().currentTime) > 0.2) {
        getEngine().seekTo(state.currentTime)
      }
      // master volume
      if (state.masterVolume !== prev.masterVolume || state.masterMuted !== prev.masterMuted) {
        getEngine().setMaster(state.masterVolume, state.masterMuted)
      }
      // project / media changes → re-render (paused) + pool cleanup
      if (state.project !== prev.project || state.mediaVersion !== prev.mediaVersion) {
        getEngine().invalidate()
      }
    })

    return () => {
      unsubscribe()
      getEngine().detach()
      initedRef.current = false
    }
  }, [canvasRef])
}
