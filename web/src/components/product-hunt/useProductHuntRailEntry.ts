import { useEffect, useState } from 'react'
import { useCapabilities, useVersionCheck } from '../../api/client'
import { LAUNCH_NOTICE_REOPEN_EVENT, LAUNCH_RAIL_ITEM_ID, launchPhase, launchShownIn, resolveLaunch } from './launchWindow'

// The sidebar's Product Hunt item: where the launch card opens from and closes
// into, there for the launch window to whoever the card is for.
export function useProductHuntRailEntry(): { onOpen: () => void; id: string } | undefined {
  const { data: capabilities } = useCapabilities()
  const { data: versionInfo } = useVersionCheck()
  const [now, setNow] = useState(() => Date.now())
  const launch = resolveLaunch(versionInfo?.productHuntLaunch)
  const phase = launchPhase(launch, now)
  const ended = phase === null

  useEffect(() => {
    if (ended) return
    const poll = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(poll)
  }, [ended])

  const mode = capabilities ? (capabilities.deployment?.mode ?? 'local') : undefined
  if (phase === null || !launchShownIn(mode, phase)) return undefined
  return { id: LAUNCH_RAIL_ITEM_ID, onOpen: () => window.dispatchEvent(new Event(LAUNCH_NOTICE_REOPEN_EVENT)) }
}
