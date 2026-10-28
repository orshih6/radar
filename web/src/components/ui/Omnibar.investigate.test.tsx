// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Omnibar } from './Omnibar'
import type { SearchHit } from '../../api/client'

vi.mock('../../api/usage-data', () => ({ recordUsageEvent: vi.fn() }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root
let host: HTMLDivElement

beforeEach(() => {
  vi.useFakeTimers()
  Element.prototype.scrollIntoView = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

function render(onInvestigateQuery: ((text: string) => void) | undefined, hits: SearchHit[] = []) {
  act(() => {
    root.render(<Omnibar onOpenResource={vi.fn()} commandItems={[]} searchData={{ hits }} onInvestigateQuery={onInvestigateQuery} />)
  })
}

function typeQuery(text: string) {
  const input = host.querySelector('input')!
  act(() => input.focus())
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => { vi.advanceTimersByTime(200) })
}

const investigateButton = () =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Investigate “'))

describe('Omnibar investigate row', () => {
  it('hands the typed words to the host as a question', () => {
    const onInvestigate = vi.fn()
    render(onInvestigate)
    typeQuery('checkout returns 502s')
    const row = investigateButton()
    expect(row?.textContent).toContain('Investigate “checkout returns 502s”')
    act(() => { row!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(onInvestigate).toHaveBeenCalledWith('checkout returns 502s')
  })

  it('comes after a resource match', () => {
    render(vi.fn(), [{ score: 1, kind: 'Deployment', group: 'apps', namespace: 'shop', name: 'checkout' }])
    typeQuery('checkout')
    const rows = [...document.body.querySelectorAll('[data-selected]')]
    expect(rows.at(-1)?.textContent).toContain('Investigate “checkout”')
    expect(rows[0]?.textContent).not.toContain('Investigate')
  })

  it('is absent when the host has no question entry', () => {
    render(undefined)
    typeQuery('checkout returns 502s')
    expect(investigateButton()).toBeUndefined()
  })
})
