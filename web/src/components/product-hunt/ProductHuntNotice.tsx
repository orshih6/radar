import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Heart, Rocket, X } from 'lucide-react'
import { useCapabilities, useVersionCheck } from '../../api/client'
import type { UsageDataStatus } from '../../api/usage-data'
import { USAGE_PROMPT_VISIBILITY_EVENT, updateNoticeVisible, usagePromptOnScreen } from '../usage-data/UsageDataPrompt'
import { useAnimatedUnmount } from '../../hooks/useAnimatedUnmount'
import { TRANSITION_MENU, overlayExitMs, overlayTransitionStyle } from '../../utils/animation'
import { isPhaseDismissed, launchDayLabel, launchPhase, markPhaseDismissed, resolveLaunch, type LaunchPhase, type ProductHuntLaunch } from './launchWindow'

// The same tag for every install: it says the click came from inside Radar,
// nothing about who clicked.
const UTM = { utm_source: 'radar-oss', utm_medium: 'app', utm_campaign: 'ph-launch-2026-10' }
const FEATURE_URL = `https://radarhq.io/product/ai-investigations?${new URLSearchParams(UTM)}`
const SHOW_DELAY_MS = 10_000

export function shouldShowLaunchNotice(opts: {
  phase: LaunchPhase | null
  deploymentMode: string | undefined
  dismissed: boolean
  ready: boolean
  cornerBusy: boolean
}): boolean {
  // In-cluster Radar is often shared by people who didn't install it, so they
  // get only the launch-day card.
  const mode = opts.deploymentMode === 'local' || (opts.deploymentMode === 'in-cluster' && opts.phase === 'live')
  return opts.phase !== null && mode && !opts.dismissed && opts.ready && !opts.cornerBusy
}

export function launchLink(launch: ProductHuntLaunch): string {
  const url = new URL(launch.url)
  for (const [key, value] of Object.entries(UTM)) url.searchParams.set(key, value)
  return url.toString()
}

// A one-off notice for the October 2026 Product Hunt launch, whose date and
// link come from the update check. Before the day it waits its turn behind the
// update notice and the first-run usage prompt; on the day they wait for it.
// Each phase is dismissed on its own, so the launch-day card still shows to
// someone who closed the one before.
export function ProductHuntNotice({ usageData, usageDataPending }: { usageData: UsageDataStatus | undefined; usageDataPending: boolean }) {
  const { data: capabilities } = useCapabilities()
  const { data: versionInfo, isPending: versionPending } = useVersionCheck()
  const [now, setNow] = useState(() => Date.now())
  const [ready, setReady] = useState(false)
  // Covers a dismissal when localStorage is unavailable.
  const [dismissedHere, setDismissedHere] = useState<LaunchPhase[]>([])

  const [usagePromptShowing, setUsagePromptShowing] = useState(usagePromptOnScreen)
  const launch = resolveLaunch(versionInfo?.productHuntLaunch)
  const phase = launchPhase(launch, now)
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
    dismissed: phase !== null && (dismissedHere.includes(phase) || isPhaseDismissed(launch, phase)),
    // Waits for the version check, which says whether the launch is still on.
    ready: ready && !versionPending,
    // A card already on screen keeps the corner, whatever the day.
    cornerBusy: usagePromptShowing || (phase === 'upcoming' && (
      updateNoticeVisible(versionInfo?.latestVersion, versionInfo?.updateAvailable) || usageDataPending || !!usageData?.firstRunPrompt
    )),
  })
  const { shouldRender, isOpen } = useAnimatedUnmount(show, overlayExitMs('menu'))
  if (!shouldRender) return null

  const dismiss = () => {
    if (phase === null) return
    markPhaseDismissed(launch, phase)
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
            {phase === 'live' ? 'Live on Product Hunt today' : `Launching on Product Hunt ${launchDayLabel(launch)}`}
          </p>
          <p className="text-xs text-theme-text-secondary mt-1.5">
            {phase === 'live'
              ? "We're on Product Hunt today with Radar's newly upgraded MCP server and AI investigations. If Radar has made Kubernetes a little easier for you, a comment on the launch would mean a lot. It helps other engineers find Radar."
              : "We're launching Radar's newly upgraded MCP server and AI investigations on Product Hunt. We'd love to see you there."}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <a
              href={launchLink(launch)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={dismiss}
              className="text-xs font-semibold text-accent-text hover:underline whitespace-nowrap"
            >
              {phase === 'live' ? 'Comment on Product Hunt →' : 'Follow on Product Hunt →'}
            </a>
            <a
              href={FEATURE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-theme-text-tertiary hover:text-theme-text-secondary hover:underline whitespace-nowrap"
            >
              How it works
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
