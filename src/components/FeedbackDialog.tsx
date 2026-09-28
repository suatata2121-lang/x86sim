import { useEffect, useRef, useState, type FormEvent } from 'react'

// The site is static (GitHub Pages), so submissions go through Web3Forms,
// which forwards them to the site owner's inbox. The access key only lets
// people send to that inbox -- it is meant to be public.
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit'
const WEB3FORMS_ACCESS_KEY = '38a82224-9a0e-4d77-a606-f0cf0dd3b3b9'

const MAX_ATTACHED_CODE_CHARS = 20000

type Kind = 'bug' | 'suggestion' | 'other'
const KIND_LABELS: Record<Kind, string> = {
  bug: 'Bug report',
  suggestion: 'Suggestion',
  other: 'Other',
}

type Status = { state: 'idle' } | { state: 'sending' } | { state: 'sent' } | { state: 'error'; message: string }

interface Props {
  onClose: () => void
  // Source of the editor tab that is open right now, offered as an optional
  // attachment since most bug reports are about a specific program.
  currentSource: string
}

export function FeedbackDialog({ onClose, currentSource }: Props) {
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
            <p>Thanks! Your feedback was sent.</p>
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
              {kind === 'bug' ? 'What went wrong? What did you expect to happen?' : 'Your message'}
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                required
              />
            </label>

            <label>
              <span>Your email <span className="feedback-optional">(optional, if you'd like a reply)</span></span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>

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
