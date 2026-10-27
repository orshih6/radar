// Product Hunt's day runs midnight to midnight Pacific; PDT is UTC-7 until Nov 1.
// internal/launchday holds the same window for the server's star prompt.
const LAUNCH_START = Date.parse('2026-10-29T07:00:00Z')
const LAUNCH_END = Date.parse('2026-10-30T07:00:00Z')
const DISMISSED_KEY_PREFIX = 'radar-product-hunt-2026-10-dismissed-'

export const LAUNCH_NOTICE_DISMISSED_EVENT = 'radar:product-hunt-notice-dismissed'

export type LaunchPhase = 'upcoming' | 'live'

export function launchPhase(now: number): LaunchPhase | null {
  if (now >= LAUNCH_END) return null
  return now >= LAUNCH_START ? 'live' : 'upcoming'
}

export function isPhaseDismissed(phase: LaunchPhase): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY_PREFIX + phase) !== null
  } catch {
    return false
  }
}

export function markPhaseDismissed(phase: LaunchPhase): void {
  try {
    localStorage.setItem(DISMISSED_KEY_PREFIX + phase, '1')
  } catch {
    // localStorage unavailable: the notice keeps this dismissal in memory
  }
  window.dispatchEvent(new Event(LAUNCH_NOTICE_DISMISSED_EVENT))
}

// On launch day the Product Hunt card goes first: the update notice and the
// first-run usage prompt wait until it is dismissed or the day is over.
export function launchNoticeHoldsCorner(now: number): boolean {
  return launchPhase(now) === 'live' && !isPhaseDismissed('live')
}
