// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  launch: undefined as undefined | { enabled: boolean; url: string; start: string; end: string },
  mode: 'local',
}))
vi.mock('../../api/client', () => ({
  useCapabilities: () => ({ data: { deployment: { mode: state.mode } } }),
  useVersionCheck: () => ({ data: { currentVersion: '1.18.3', updateAvailable: false, installMethod: 'direct', productHuntLaunch: state.launch }, isPending: false }),
}))
vi.mock('../../api/usage-data', () => ({ useSetUsageData: () => ({ mutate: vi.fn(), isPending: false }), useMarkUsagePromptShown: () => vi.fn() }))

import { ProductHuntNotice } from './ProductHuntNotice'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root
let element: HTMLDivElement

const ON = { enabled: true, url: 'https://www.producthunt.com/products/radar-7?launch=radar-101', start: '2026-10-29T07:00:00Z', end: '2026-10-30T07:00:00Z' }
const OFF = { enabled: false, url: '', start: '0001-01-01T00:00:00Z', end: '0001-01-01T00:00:00Z' }

function render() {
  act(() => root.render(<ProductHuntNotice usageData={undefined} usageDataPending={false} />))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-29T17:00:00Z'))
  localStorage.clear()
  state.launch = ON
  state.mode = 'local'
  element = document.createElement('div')
  document.body.appendChild(element)
  root = createRoot(element)
})

afterEach(() => {
  act(() => root.unmount())
  element.remove()
  vi.useRealTimers()
})

describe('ProductHuntNotice', () => {
  it('shows the launch-day card after the delay', () => {
    render()
    expect(element.textContent).toBe('')
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(element.textContent).toContain('Live on Product Hunt today')
    expect(element.querySelector('a')?.href).toContain('utm_source=radar-oss')
  })

  it('fades out without breaking when the launch is called off on screen', () => {
    render()
    act(() => { vi.advanceTimersByTime(10_000) })
    state.launch = OFF
    render()
    expect(element.textContent).toContain('Live on Product Hunt today')
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(element.textContent).toBe('')
  })

  it('keeps the launch-day wording while it fades at the end of the day', () => {
    render()
    act(() => { vi.advanceTimersByTime(10_000) })
    vi.setSystemTime(new Date('2026-10-30T07:00:30Z'))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(element.textContent).not.toContain('Launching on Product Hunt')
  })

  it('shows in-cluster only on the day', () => {
    state.mode = 'in-cluster'
    vi.setSystemTime(new Date('2026-10-28T17:00:00Z'))
    render()
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(element.textContent).toBe('')
  })
})
