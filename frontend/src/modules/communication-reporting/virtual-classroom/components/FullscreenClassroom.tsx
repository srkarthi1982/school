import { VideoConference } from '@livekit/components-react'
import { AskForHelpButton, HostMenu } from './Breakout'
import { HandRaiseButton, RaisedHandsList } from './HandRaise'
import { RecordingActiveBanner } from './Recording'
import ScreenShareBanner from './ScreenShareBanner'

// Wrapper around the prebuilt <VideoConference> for the 'fullscreen' mode.
// Kept as a separate component so that P4/P5 can swap in DockedClassroom or
// PiPHost without touching ClassroomMount. Note: HandRaiseSync and
// BreakoutSync live in ClassroomMount, not here — they need to keep
// running while the user is in docked / pip / hidden mode too.
//
// Host controls are consolidated into <HostMenu> (a single hamburger
// trigger) so the visible footprint stays minimal and never collides
// with LiveKit's chat panel sliding in from the right.
export default function FullscreenClassroom() {
  return (
    <>
      <ScreenShareBanner />
      <RecordingActiveBanner />
      <RaisedHandsList />
      <div className="absolute top-3 end-3 z-30 flex justify-end gap-2 items-center">
        <HandRaiseButton />
        <HostMenu />
      </div>
      <AskForHelpButton />
      <VideoConference />
    </>
  )
}
