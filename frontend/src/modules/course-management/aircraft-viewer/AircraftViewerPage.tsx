import { useEffect, useState } from 'react'
import useFullBleedStore from '../../../infra/shared/store/useFullBleedStore'

const AIRCRAFT_VIEWER_URL =
  '/api/v1/aircraft-viewer/?name=aircraft_viewer'

export default function AircraftViewerPage() {
  const [failed, setFailed] = useState(false)
  const setFullBleed = useFullBleedStore((state) => state.setFullBleed)

  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      aria-labelledby="aircraft-viewer-title"
    >
      <h1 id="aircraft-viewer-title" className="sr-only">
        Interactive 3D Aircraft Viewer
      </h1>

      {failed ? (
        <div
          className="grid min-h-0 flex-1 place-items-center bg-[var(--surface)] p-6 text-center"
          role="alert"
        >
          <p className="max-w-lg text-[var(--text-muted)]">
            The aircraft viewer could not be loaded. Confirm that the backend
            viewer feature is enabled and available.
          </p>
        </div>
      ) : (
        <iframe
          src={AIRCRAFT_VIEWER_URL}
          title="Interactive 3D aircraft viewer"
          className="block h-full min-h-0 w-full flex-1 border-0 bg-[var(--surface)]"
          allow="fullscreen"
          loading="eager"
          onError={() => setFailed(true)}
        />
      )}
    </section>
  )
}
