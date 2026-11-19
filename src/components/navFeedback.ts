import { useCallback, useEffect, useRef, useState } from 'react'

// Feedback for "next" buttons (#102, feedback #39 / #46): the page that
// opened is scrolled to and briefly highlighted, so a click visibly did
// something, and the button is locked for a moment so a double click can't
// open two tabs or move two steps.

const LOCK_MS = 800

/** Scrolls the page area that just changed into view and flashes it. */
export function flashTarget(selector = '.editor-col') {
  // After React has rendered the new page.
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.remove('flash-target')
    void el.offsetWidth // restart the animation if it is still running
    el.classList.add('flash-target')
    window.setTimeout(() => el.classList.remove('flash-target'), 1200)
  })
}

/**
 * [locked, run]: run(fn) calls fn unless a call is still within LOCK_MS;
 * `locked` disables the buttons meanwhile. The ref catches a second click
 * that arrives before the re-render.
 */
export function useClickLock(): [boolean, (fn: () => void) => void] {
  const [locked, setLocked] = useState(false)
  const busy = useRef(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])
  const run = useCallback((fn: () => void) => {
    if (busy.current) return
    busy.current = true
    setLocked(true)
    timer.current = window.setTimeout(() => {
      busy.current = false
      setLocked(false)
    }, LOCK_MS)
    fn()
  }, [])
  return [locked, run]
}
