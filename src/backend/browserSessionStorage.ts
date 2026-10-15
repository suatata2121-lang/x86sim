import type { SupportedStorage } from '@supabase/supabase-js'

// Where Supabase keeps the signed-in session. Lab computers are shared, so a
// student who closes the browser without signing out must not leave the
// next student in their account (and their lab time and attempts in the
// wrong report). sessionStorage is wiped when the browser closes, but it is
// per tab, so open tabs of the site share the session over a
// BroadcastChannel: a new tab asks the others for it, and every change is
// copied to all of them so a refreshed token never goes stale in one tab.

const CHANNEL = 'x86sim-auth'
// How long a new tab waits for an already open one to hand over the session.
const ASK_TIMEOUT_MS = 300

type Message =
  | { type: 'ask'; key: string }
  | { type: 'answer'; key: string; value: string }
  | { type: 'set'; key: string; value: string }
  | { type: 'remove'; key: string }

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null

channel?.addEventListener('message', (e: MessageEvent<Message>) => {
  const m = e.data
  if (m.type === 'ask') {
    const value = sessionStorage.getItem(m.key)
    if (value !== null) channel.postMessage({ type: 'answer', key: m.key, value } satisfies Message)
  } else if (m.type === 'set') {
    sessionStorage.setItem(m.key, m.value)
  } else if (m.type === 'remove') {
    sessionStorage.removeItem(m.key)
  }
})

export const browserSessionStorage: SupportedStorage = {
  getItem(key) {
    const own = sessionStorage.getItem(key)
    if (own !== null || !channel) return own
    return new Promise<string | null>((resolve) => {
      const onMessage = (e: MessageEvent<Message>) => {
        if (e.data.type === 'answer' && e.data.key === key) done(e.data.value)
      }
      const done = (value: string | null) => {
        window.clearTimeout(timer)
        channel.removeEventListener('message', onMessage)
        if (value !== null) sessionStorage.setItem(key, value)
        resolve(value)
      }
      const timer = window.setTimeout(() => done(null), ASK_TIMEOUT_MS)
      channel.addEventListener('message', onMessage)
      channel.postMessage({ type: 'ask', key } satisfies Message)
    })
  },
  setItem(key, value) {
    sessionStorage.setItem(key, value)
    channel?.postMessage({ type: 'set', key, value } satisfies Message)
  },
  removeItem(key) {
    sessionStorage.removeItem(key)
    channel?.postMessage({ type: 'remove', key } satisfies Message)
  },
}

/**
 * Sessions saved before this storage existed sit in localStorage and would
 * survive a browser restart forever; drop them so everyone signs in afresh once.
 */
export function forgetPersistentSessions() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.includes('-auth-token')) localStorage.removeItem(key)
    }
  } catch {
    // ignore (storage disabled)
  }
}
