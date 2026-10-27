import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Rocket, X } from 'lucide-react'
import { useCapabilities, useVersionCheck } from '../../api/client'
import type { UsageDataStatus } from '../../api/usage-data'
import { updateNoticeVisible } from '../usage-data/UsageDataPrompt'
import { useAnimatedUnmount } from '../../hooks/useAnimatedUnmount'
import { TRANSITION_MENU, overlayExitMs, overlayTransitionStyle } from '../../utils/animation'

export const LAUNCH_URL = 'https://www.producthunt.com/products/radar-7?launch=radar-101'
const DISMISSED_KEY = 'radar-product-hunt-2026-10-dismissed'
const SHOW_DELAY_MS = 10_000

// Product Hunt's day runs midnight to midnight Pacific; PDT is UTC-7 until Nov 1.
const LAUNCH_START = Date.parse('2026-10-29T07:00:00Z')
const LAUNCH_END = Date.parse('2026-10-30T07:00:00Z')

export type LaunchPhase = 'upcoming' | 'live'

export function launchPhase(now: number): LaunchPhase | null {
  if (now >= LAUNCH_END) return null
  return now >= LAUNCH_START ? 'live' : 'upcoming'
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null
  } catch {
    return false
  }
}

export function shouldShowLaunchNotice(opts: {
  phase: LaunchPhase | null
  deploymentMode: string | undefined
  dismissed: boolean
  ready: boolean
  cornerBusy: boolean
}): boolean {
  return opts.phase !== null && opts.deploymentMode === 'local' && !opts.dismissed && opts.ready && !opts.cornerBusy
}

// A one-off, local-only notice for the October 2026 Product Hunt launch. It
// waits its turn in the corner behind the update notice and the first-run
// usage prompt, and a dismissal is final for both phases.
export function ProductHuntNotice({ usageData }: { usageData: UsageDataStatus | undefined }) {
  const { data: capabilities } = useCapabilities()
  const { data: versionInfo } = useVersionCheck()
  const [now, setNow] = useState(() => Date.now())
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(isDismissed)

  useEffect(() => {
    if (launchPhase(Date.now()) === null) return
    const delay = window.setTimeout(() => setReady(true), SHOW_DELAY_MS)
    // Re-reads the clock for the phase change, and the update notice's
    // dismissal, which only touches localStorage.
    const poll = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => {
      window.clearTimeout(delay)
      window.clearInterval(poll)
    }
  }, [])

  const phase = launchPhase(now)
  const show = shouldShowLaunchNotice({
    phase,
    deploymentMode: capabilities ? (capabilities.deployment?.mode ?? 'local') : undefined,
    dismissed,
    ready,
    cornerBusy: updateNoticeVisible(versionInfo?.latestVersion, versionInfo?.updateAvailable) || !!usageData?.firstRunPrompt,
  })
  const { shouldRender, isOpen } = useAnimatedUnmount(show, overlayExitMs('menu'))
  if (!shouldRender) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // localStorage unavailable: dismiss for this session only
    }
    setDismissed(true)
  }

  return (
    <div
      role="dialog"
      aria-label="Radar on Product Hunt"
      inert={!show || undefined}
      className={clsx(
        'fixed bottom-4 right-4 z-40 w-[21rem] max-w-[calc(100vw-2rem)] rounded-xl border border-theme-border bg-theme-surface shadow-theme-lg overflow-hidden origin-bottom-right',
        TRANSITION_MENU,
        isOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-1 scale-[0.97]',
        !show && 'pointer-events-none',
      )}
      style={overlayTransitionStyle(isOpen, 'menu')}
    >
      <div className="relative flex gap-3 p-3.5 pr-9">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-2.5 right-2.5 p-1 rounded text-theme-text-tertiary hover:text-theme-text-primary hover:bg-theme-elevated"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-accent-muted text-accent">
          <Rocket className="w-4 h-4" aria-hidden />
        </span>
        <div className="min-w-0">
          {phase === 'live' ? (
            <>
              <p className="text-sm font-medium text-theme-text-primary">Radar is on Product Hunt today</p>
              <p className="text-xs text-theme-text-secondary mt-1">
                We launched MCP and AI investigations. If Radar has been useful, we'd love to hear what it found for you, or what you'd want next.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-theme-text-primary">Radar launches on Product Hunt Oct 29</p>
              <p className="text-xs text-theme-text-secondary mt-1">
                We're launching MCP and AI investigations. Follow Radar there to hear when it's live.
              </p>
            </>
          )}
          <a
            href={LAUNCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-accent-text hover:underline"
          >
            {phase === 'live' ? 'See the launch →' : 'Open on Product Hunt →'}
          </a>
        </div>
      </div>
    </div>
  )
}
