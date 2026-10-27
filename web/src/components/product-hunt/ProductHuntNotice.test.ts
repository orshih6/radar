import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', () => ({ useCapabilities: () => ({ data: undefined }), useVersionCheck: () => ({ data: undefined }) }))
vi.mock('../../api/usage-data', () => ({ useSetUsageData: () => ({ mutate: vi.fn(), isPending: false }), useMarkUsagePromptShown: () => vi.fn() }))

import { shouldShowLaunchNotice } from './ProductHuntNotice'
import { isPhaseDismissed, launchNoticeHoldsCorner, launchPhase } from './launchWindow'

describe('launchPhase', () => {
  it('is upcoming before Product Hunt day starts in Pacific time', () => {
    expect(launchPhase(Date.parse('2026-10-28T12:00:00Z'))).toBe('upcoming')
    expect(launchPhase(Date.parse('2026-10-28T23:59:59-07:00'))).toBe('upcoming')
  })

  it('is live for the whole Pacific day of Oct 29', () => {
    expect(launchPhase(Date.parse('2026-10-29T00:00:00-07:00'))).toBe('live')
    expect(launchPhase(Date.parse('2026-10-29T09:01:00+02:00'))).toBe('live')
    expect(launchPhase(Date.parse('2026-10-29T23:59:59-07:00'))).toBe('live')
  })

  it('is over once the Pacific day ends', () => {
    expect(launchPhase(Date.parse('2026-10-30T00:00:00-07:00'))).toBe(null)
    expect(launchPhase(Date.parse('2026-11-15T00:00:00Z'))).toBe(null)
  })
})

describe('shouldShowLaunchNotice', () => {
  const base = { phase: 'live' as const, deploymentMode: 'local', dismissed: false, ready: true, cornerBusy: false }

  it('shows on a local install with the corner free', () => {
    expect(shouldShowLaunchNotice(base)).toBe(true)
    expect(shouldShowLaunchNotice({ ...base, phase: 'upcoming' })).toBe(true)
  })

  it('never shows in-cluster, in Cloud, or before capabilities load', () => {
    expect(shouldShowLaunchNotice({ ...base, deploymentMode: 'in-cluster' })).toBe(false)
    expect(shouldShowLaunchNotice({ ...base, deploymentMode: 'cloud' })).toBe(false)
    expect(shouldShowLaunchNotice({ ...base, deploymentMode: undefined })).toBe(false)
  })

  it('stays away once dismissed, outside the window, before the delay, or while another notice holds the corner', () => {
    expect(shouldShowLaunchNotice({ ...base, dismissed: true })).toBe(false)
    expect(shouldShowLaunchNotice({ ...base, phase: null })).toBe(false)
    expect(shouldShowLaunchNotice({ ...base, ready: false })).toBe(false)
    expect(shouldShowLaunchNotice({ ...base, cornerBusy: true })).toBe(false)
  })
})

describe('isPhaseDismissed', () => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  afterEach(() => store.clear())

  it('keeps the launch-day card for someone who closed the one before it', () => {
    store.set('radar-product-hunt-2026-10-dismissed-upcoming', '1')
    expect(isPhaseDismissed('upcoming')).toBe(true)
    expect(isPhaseDismissed('live')).toBe(false)
  })

  it('holds the corner on launch day until the launch-day card is dismissed', () => {
    const before = Date.parse('2026-10-28T12:00:00Z')
    const during = Date.parse('2026-10-29T10:00:00-07:00')
    const after = Date.parse('2026-10-30T01:00:00-07:00')
    expect(launchNoticeHoldsCorner(before)).toBe(false)
    expect(launchNoticeHoldsCorner(during)).toBe(true)
    expect(launchNoticeHoldsCorner(after)).toBe(false)
    store.set('radar-product-hunt-2026-10-dismissed-live', '1')
    expect(launchNoticeHoldsCorner(during)).toBe(false)
  })
})
