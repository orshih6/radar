import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Heart, Rocket, X } from 'lucide-react'
import { useCapabilities, useVersionCheck } from '../../api/client'
import type { UsageDataStatus } from '../../api/usage-data'
import { USAGE_PROMPT_VISIBILITY_EVENT, updateNoticeVisible, usagePromptOnScreen } from '../usage-data/UsageDataPrompt'
import { useAnimatedUnmount } from '../../hooks/useAnimatedUnmount'
import { TRANSITION_MENU, overlayExitMs, overlayTransitionStyle } from '../../utils/animation'
import { isPhaseDismissed, launchPhase, markPhaseDismissed, type LaunchPhase } from './launchWindow'

export const LAUNCH_URL = 'https://www.producthunt.com/products/radar-7?launch=radar-101'
const FEATURE_URL = 'https://radarhq.io/product/ai-investigations'
const SHOW_DELAY_MS = 10_000

export function shouldShowLaunchNotice(opts: {
  phase: LaunchPhase | null
  deploymentMode: string | undefined
  dismissed: boolean
  ready: boolean
  cornerBusy: boolean
}): boolean {
  return opts.phase !== null && opts.deploymentMode === 'local' && !opts.dismissed && opts.ready && !opts.cornerBusy
}

// A one-off, local-only notice for the October 2026 Product Hunt launch.
// Before the day it waits its turn behind the update notice and the first-run
// usage prompt; on the day they wait for it. Each phase is dismissed on its
// own, so the launch-day card still shows to someone who closed the one before.
export function ProductHuntNotice({ usageData, usageDataPending }: { usageData: UsageDataStatus | undefined; usageDataPending: boolean }) {
  const { data: capabilities } = useCapabilities()
  const { data: versionInfo } = useVersionCheck()
  const [now, setNow] = useState(() => Date.now())
  const [ready, setReady] = useState(false)
  // Covers a dismissal when localStorage is unavailable.
  const [dismissedHere, setDismissedHere] = useState<LaunchPhase[]>([])

  const [usagePromptShowing, setUsagePromptShowing] = useState(usagePromptOnScreen)
  const phase = launchPhase(now)
  const ended = phase === null

  useEffect(() => {
    if (ended) return
    const delay = window.setTimeout(() => setReady(true), SHOW_DELAY_MS)
    // Re-reads the clock for the phase change, and the update notice's
    // dismissal, which only touches localStorage.
    const poll = window.setInterval(() => setNow(Date.now()), 60_000)
    const onUsagePrompt = () => setUsagePromptShowing(usagePromptOnScreen())
    window.addEventListener(USAGE_PROMPT_VISIBILITY_EVENT, onUsagePrompt)
    return () => {
      window.clearTimeout(delay)
      window.clearInterval(poll)
      window.removeEventListener(USAGE_PROMPT_VISIBILITY_EVENT, onUsagePrompt)
    }
  }, [ended])

  const show = shouldShowLaunchNotice({
    phase,
    deploymentMode: capabilities ? (capabilities.deployment?.mode ?? 'local') : undefined,
    dismissed: phase !== null && (dismissedHere.includes(phase) || isPhaseDismissed(phase)),
    ready,
    // A card already on screen keeps the corner, whatever the day.
    cornerBusy: usagePromptShowing || (phase === 'upcoming' && (
      updateNoticeVisible(versionInfo?.latestVersion, versionInfo?.updateAvailable) || usageDataPending || !!usageData?.firstRunPrompt
    )),
  })
  const { shouldRender, isOpen } = useAnimatedUnmount(show, overlayExitMs('menu'))
  if (!shouldRender) return null

  const dismiss = () => {
    if (phase === null) return
    markPhaseDismissed(phase)
    setDismissedHere((d) => [...d, phase])
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
          <p className="flex items-center gap-1.5 text-sm font-medium text-theme-text-primary">
            Radar <Heart className="w-3.5 h-3.5 fill-current text-red-500 dark:text-red-400" aria-label="loves" /> Agents
          </p>
          <p className="text-xs font-medium text-accent-text mt-0.5">
            {phase === 'live' ? 'Live on Product Hunt today' : 'Launching on Product Hunt Oct 29'}
          </p>
          <p className="text-xs text-theme-text-secondary mt-1.5">
            {phase === 'live'
              ? "We're on Product Hunt today to showcase Radar's MCP server and AI investigations. Built with this community's feedback, so it's yours too: come say hi."
              : "We're launching on Product Hunt to showcase Radar's MCP server and AI investigations. Built with this community's feedback, so it's yours too."}
            {' '}Haven't tried them yet? We put a ton of work into making your agents feel as at home in Radar as you do.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <a
              href={LAUNCH_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={dismiss}
              className="text-xs font-semibold text-accent-text hover:underline"
            >
              {phase === 'live' ? 'See the launch →' : 'Follow on Product Hunt →'}
            </a>
            <a
              href={FEATURE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-theme-text-tertiary hover:text-theme-text-secondary hover:underline"
            >
              How it works
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
