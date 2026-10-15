import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../backend/client'
import { useAuth } from '../backend/auth'

// With the Supabase backend configured, feedback is stored in the feedback
// table and read in the admin panel's inbox. Builds without it (forks, local
// dev) fall back to Web3Forms, which forwards the message to the site owner's
// inbox; its access key only lets people send there, so it is meant to be public.
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit'
const WEB3FORMS_ACCESS_KEY = '38a82224-9a0e-4d77-a606-f0cf0dd3b3b9'

const MAX_ATTACHED_CODE_CHARS = 20000
const MAX_MESSAGE_CHARS = 5000

export type FeedbackKind = 'bug' | 'suggestion' | 'question' | 'other'
type Kind = FeedbackKind
export const KIND_LABELS: Record<Kind, string> = {
  bug: 'Bug report',
  suggestion: 'Suggestion',
  question: 'Question',
  other: 'Other',
}

/** Where the student was when they wrote, so the report makes sense on its own. */
export interface FeedbackContext {
  tab: string
  assignment: string | null
  section: string
}

type Status = { state: 'idle' } | { state: 'sending' } | { state: 'sent' } | { state: 'error'; message: string }

interface Props {
  onClose: () => void
  // Source of the editor tab that is open right now, offered as an optional
  // attachment since most bug reports are about a specific program.
  currentSource: string
  context: FeedbackContext
}

export function FeedbackDialog({ onClose, currentSource, context }: Props) {
  const auth = useAuth()
  const userId = auth.session?.user.id ?? null
  const [kind, setKind] = useState<Kind>('bug')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [attachCode, setAttachCode] = useState(false)
  const [botcheck, setBotcheck] = useState(false)
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const messageRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messageRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setStatus({ state: 'sending' })

    const code = attachCode ? currentSource.slice(0, MAX_ATTACHED_CODE_CHARS) : ''

    if (supabase) {
      // Bots that tick the honeypot get a normal "sent" screen and no row.
      if (botcheck) {
        setStatus({ state: 'sent' })
        return
      }
      const { error } = await supabase.from('feedback').insert({
        user_id: userId,
        kind,
        message: message.trim().slice(0, MAX_MESSAGE_CHARS),
        reply_email: userId ? null : email.trim().slice(0, 200) || null,
        code: code || null,
        context: { ...context, page: window.location.pathname },
        user_agent: navigator.userAgent.slice(0, 300),
      })
      setStatus(error ? { state: 'error', message: error.message } : { state: 'sent' })
      return
    }

    const body = {
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: `[x86sim] ${KIND_LABELS[kind]}`,
      from_name: 'x86sim feedback',
      type: KIND_LABELS[kind],
      message: message.trim(),
      // Web3Forms uses "email" as the reply-to address when present.
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(code ? { code } : {}),
      page: window.location.href,
      browser: navigator.userAgent,
      botcheck,
    }

    try {
      const res = await fetch(WEB3FORMS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || `Request failed (${res.status})`)
      }
      setStatus({ state: 'sent' })
    } catch (err) {
      setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className="modal-header">
          <h2 id="feedback-title">Send feedback</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {status.state === 'sent' ? (
          <div className="feedback-sent">
            <p>Thanks! Your feedback was sent{supabase ? ' to the instructor' : ''}.</p>
            <button onClick={onClose}>Close</button>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={handleSubmit}>
            <div className="feedback-kinds" role="radiogroup" aria-label="Feedback type">
              {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  className={kind === k ? 'mode-tab active' : 'mode-tab'}
                  onClick={() => setKind(k)}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>

            <label>
              {kind === 'bug'
                ? 'What went wrong? What did you expect to happen?'
                : kind === 'question' ? 'Your question' : 'Your message'}
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={MAX_MESSAGE_CHARS}
                required
              />
            </label>

            {/* Signed-in students are already known by name and email. */}
            {!userId && (
              <label>
                <span>Your email <span className="feedback-optional">(optional, if you'd like a reply)</span></span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
            )}

            <label className="feedback-checkbox">
              <input type="checkbox" checked={attachCode} onChange={(e) => setAttachCode(e.target.checked)} />
              Attach the code from the current editor tab
            </label>

            {/* Honeypot: hidden from people, bots tend to tick it. */}
            <input
              type="checkbox"
              className="feedback-honeypot"
              tabIndex={-1}
              autoComplete="off"
              checked={botcheck}
              onChange={(e) => setBotcheck(e.target.checked)}
              aria-hidden="true"
            />

            {status.state === 'error' && (
              <p className="feedback-error">Couldn't send your feedback: {status.message}. Please try again.</p>
            )}

            <div className="feedback-actions">
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary" disabled={status.state === 'sending' || !message.trim()}>
                {status.state === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
