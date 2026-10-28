import { useEffect, useReducer, useState } from 'react'
import { useCapabilities, useVersionCheck } from '../../api/client'
import {
  LAUNCH_NOTICE_DISMISSED_EVENT,
  LAUNCH_NOTICE_REOPEN_EVENT,
  isPhaseDismissed,
  launchPhase,
  launchShownIn,
  resolveLaunch,
} from './launchWindow'

// The sidebar's Product Hunt item: there for the launch window to whoever the
// card is for, once they've closed it, so they can bring it back.
export function useProductHuntRailEntry(): { onOpen: () => void } | undefined {
  const { data: capabilities } = useCapabilities()
  const { data: versionInfo } = useVersionCheck()
  const [now, setNow] = useState(() => Date.now())
  // A dismissal lives outside React state, so re-render when one happens.
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const launch = resolveLaunch(versionInfo?.productHuntLaunch)
  const phase = launchPhase(launch, now)
  const ended = phase === null

  useEffect(() => {
    if (ended) return
    const poll = window.setInterval(() => setNow(Date.now()), 60_000)
    window.addEventListener(LAUNCH_NOTICE_DISMISSED_EVENT, rerender)
    return () => {
      window.removeEventListener(LAUNCH_NOTICE_DISMISSED_EVENT, rerender)
      window.clearInterval(poll)
    }
  }, [ended])

  const mode = capabilities ? (capabilities.deployment?.mode ?? 'local') : undefined
  if (phase === null || !launchShownIn(mode, phase) || !isPhaseDismissed(launch, phase)) return undefined
  return { onOpen: () => window.dispatchEvent(new Event(LAUNCH_NOTICE_REOPEN_EVENT)) }
}
