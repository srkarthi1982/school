import { useEffect, useRef, useState } from 'react'
import { runSilent } from '../../../../api/client'
import useEditorStore from './editor-store'

const AUTOSAVE_INTERVAL = Number(import.meta.env.COURSE_INFO_AUTOSAVE_INTERVAL_MS) || 60000

export default function useAutoSave(saveDraft: () => Promise<void>) {
  const saveDraftRef = useRef(saveDraft)
  const savingRef = useRef(false)
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    saveDraftRef.current = saveDraft
  }, [saveDraft])

  useEffect(() => {
    const id = setInterval(async () => {
      const { dirty } = useEditorStore.getState()
      if (!dirty || savingRef.current) return
      savingRef.current = true
      try {
        // Background autosave — suppress the top loading bar (manual save still shows it).
        await runSilent(() => saveDraftRef.current())
        setLastAutoSavedAt(new Date())
      } catch {
        // silent — manual save remains available
      } finally {
        savingRef.current = false
      }
    }, AUTOSAVE_INTERVAL)
    return () => clearInterval(id)
  }, [])

  return { lastAutoSavedAt }
}