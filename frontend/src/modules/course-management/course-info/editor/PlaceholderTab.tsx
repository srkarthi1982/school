import type { TabProps } from './tabs/types'

export default function PlaceholderTab(_props: TabProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-10">
      <div className="text-[48px] mb-4">🚧</div>
      <h3 className="text-[18px] font-bold text-primary mb-2">Coming Soon</h3>
      <p className="text-[13px] text-muted max-w-[360px]">
        This tab is part of the Course Information module but has not been built yet.
        General Information must reach 100% before E-forms unlocks; the remaining tabs
        will be enabled in a future iteration.
      </p>
    </div>
  )
}
