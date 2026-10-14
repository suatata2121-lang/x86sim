import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../backend/auth'

type View = 'signin' | 'signup' | 'reset' | 'newpassword'

const MIN_PASSWORD_LENGTH = 8

interface Props {
  onClose: () => void
  /** Opens straight to "choose a new password" after a reset-email link. */
  initialView?: View
}

export function AccountDialog({ onClose, initialView = 'signin' }: Props) {
  const auth = useAuth()
  const [view, setView] = useState<View>(initialView)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [studentNo, setStudentNo] = useState('')
  const [classGroup, setClassGroup] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function switchView(next: View) {
    setView(next)
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (view === 'signin') {
        await auth.signIn(email.trim(), password)
        onClose()
      } else if (view === 'signup') {
        const { needsEmailConfirmation } = await auth.signUp({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          studentNo: studentNo.trim(),
          classGroup: classGroup.trim(),
        })
        if (needsEmailConfirmation) {
          setNotice('Account created. Check your inbox and click the confirmation link, then sign in.')
          setView('signin')
        } else {
          onClose()
        }
      } else if (view === 'reset') {
        await auth.sendPasswordReset(email.trim())
        setNotice('If that email has an account, a reset link is on its way.')
      } else {
        await auth.updatePassword(password)
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<View, string> = {
    signin: 'Sign in',
    signup: 'Create an account',
    reset: 'Reset your password',
    newpassword: 'Choose a new password',
  }
  const needsEmail = view !== 'newpassword'
  const needsPassword = view !== 'reset'

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="modal-header">
          <h2 id="account-title">{titles[view]}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="feedback-form" onSubmit={handleSubmit}>
          {view === 'signup' && (
            <>
              <label>
                Full name
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
              </label>
              <label>
                Student number
                <input value={studentNo} onChange={(e) => setStudentNo(e.target.value)} required />
              </label>
              <label>
                <span>Class / lab group <span className="feedback-optional">(optional)</span></span>
                <input value={classGroup} onChange={(e) => setClassGroup(e.target.value)} />
              </label>
            </>
          )}

          {needsEmail && (
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus={view !== 'signup'}
                autoComplete="email"
              />
            </label>
          )}

          {needsPassword && (
            <label>
              {view === 'newpassword' ? 'New password' : 'Password'}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={view === 'signin' ? undefined : MIN_PASSWORD_LENGTH}
                autoFocus={view === 'newpassword'}
                autoComplete={view === 'signin' ? 'current-password' : 'new-password'}
              />
            </label>
          )}

          {error && <p className="feedback-error">{error}</p>}
          {notice && <p className="account-notice">{notice}</p>}

          <div className="feedback-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Please wait…' : view === 'reset' ? 'Send reset link' : titles[view]}
            </button>
          </div>

          {view === 'signin' && (
            <p className="account-switch">
              No account yet? <button type="button" className="link-button" onClick={() => switchView('signup')}>Create one</button>
              {' · '}
              <button type="button" className="link-button" onClick={() => switchView('reset')}>Forgot password?</button>
            </p>
          )}
          {(view === 'signup' || view === 'reset') && (
            <p className="account-switch">
              <button type="button" className="link-button" onClick={() => switchView('signin')}>Back to sign in</button>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
