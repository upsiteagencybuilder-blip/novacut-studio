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
          s.setCurrentTime(projectDuration(s.project))
        },
      }
    )

    const unsubscribe = useEditor.subscribe((state, prev) => {
      // play / pause
      if (state.isPlaying !== prev.isPlaying) {
        if (state.isPlaying) {
          const engine2 = getEngine()
          engine2.seekTo(useEditor.getState().currentTime)
          engine2.play()
        } else {
          getEngine().pause()
        }
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
