import { useEffect, useState, type FormEvent } from 'react'
import { EmailNotConfirmedError, useAuth } from '../backend/auth'

type View = 'signin' | 'signup' | 'confirm' | 'reset' | 'newpassword'

const MIN_PASSWORD_LENGTH = 8
// Mirrors require_school_email() in supabase/schema.sql, which is the real gate.
// Students use the ogr. subdomain; staff addresses are accepted too.
const SCHOOL_EMAIL = /@(ogr\.)?halic\.edu\.tr$/
const STUDENT_EMAIL_DOMAIN = '@ogr.halic.edu.tr'

interface Props {
  onClose: () => void
  /** Opens straight to "choose a new password" after a reset-email link. */
  initialView?: View
  /** Shown on open, e.g. when a reset link had expired. */
  initialError?: string
  /** Prefills the email, e.g. when reopening "Confirm your email" for a pending sign-up. */
  initialEmail?: string
}

export function AccountDialog({ onClose, initialView = 'signin', initialError, initialEmail }: Props) {
  const auth = useAuth()
  const [view, setView] = useState<View>(initialView)
  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [studentNo, setStudentNo] = useState('')
  const [classGroup, setClassGroup] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [notice, setNotice] = useState<string | null>(null)
  // After a reset email is sent, the code from it can be typed in instead of
  // following the link (mail scanners can use the one-time link up first).
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  // Sign-up for an address that already has an account: offer the ways back in.
  const [alreadyExists, setAlreadyExists] = useState(false)

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
    setCodeSent(false)
    setCode('')
    setAlreadyExists(false)
  }

  async function handleResendConfirmation() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await auth.resendConfirmation(email.trim())
      setNotice('We sent the email again. Check your spam folder too.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifyCode() {
    setBusy(true)
    setError(null)
    try {
      await auth.verifyRecoveryCode(email.trim(), code.trim())
      setPassword('')
      switchView('newpassword')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (view === 'signin') {
        try {
          await auth.signIn(email.trim(), password)
        } catch (err) {
          // Not an error to read and give up on: the code screen is the way forward.
          if (err instanceof EmailNotConfirmedError) {
            auth.setPendingConfirmation(email.trim())
            switchView('confirm')
            return
          }
          throw err
        }
        onClose()
      } else if (view === 'confirm') {
        await auth.confirmSignupCode(email.trim(), code.trim())
        onClose()
      } else if (view === 'signup') {
        if (!SCHOOL_EMAIL.test(email.trim().toLowerCase())) {
          throw new Error(`Please sign up with your university email (…${STUDENT_EMAIL_DOMAIN}).`)
        }
        const { needsEmailConfirmation, alreadyExists } = await auth.signUp({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          studentNo: studentNo.trim(),
          classGroup: classGroup.trim(),
        })
        if (alreadyExists) {
          setAlreadyExists(true)
          setError('An account with this email already exists. Sign in, reset your password, or confirm your email with the code we sent.')
        } else if (needsEmailConfirmation) {
          auth.setPendingConfirmation(email.trim())
          switchView('confirm')
        } else {
          onClose()
        }
      } else if (view === 'reset') {
        await auth.sendPasswordReset(email.trim())
        setNotice('If that email has an account, a reset link and a 6-digit code are on their way. Check your spam folder too.')
        setCodeSent(true)
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
    confirm: 'Confirm your email',
    reset: 'Reset your password',
    newpassword: 'Choose a new password',
  }
  const needsEmail = view !== 'newpassword' && view !== 'confirm'
  const needsPassword = view !== 'reset' && view !== 'confirm'

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="modal-header">
          <h2 id="account-title">{titles[view]}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="feedback-form" onSubmit={handleSubmit}>
          {view === 'confirm' && (
            <>
              <p className="account-notice">
                We sent a 6-digit code to {email.trim()}. Enter it below, or click the link in the email.
              </p>
              <label>
                Code from the email
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                />
              </label>
            </>
          )}

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
              {view === 'signup' ? 'University email' : 'Email'}
              <input
                type="email"
                placeholder={view === 'signup' ? `name${STUDENT_EMAIL_DOMAIN}` : undefined}
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

          {view === 'reset' && codeSent && (
            <div className="account-code">
              <label>
                Code from the email
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                />
              </label>
              <button type="button" onClick={handleVerifyCode} disabled={busy || !code.trim() || !email.trim()}>
                Verify code
              </button>
            </div>
          )}

          {error && <p className="feedback-error">{error}</p>}
          {notice && <p className="account-notice">{notice}</p>}

          <div className="feedback-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Please wait…' : view === 'reset' ? 'Send reset link' : view === 'confirm' ? 'Confirm email' : titles[view]}
            </button>
          </div>

          {view === 'signin' && (
            <p className="account-switch">
              No account yet? <button type="button" className="link-button" onClick={() => switchView('signup')}>Create one</button>
              {' · '}
              <button type="button" className="link-button" onClick={() => switchView('reset')}>Forgot password?</button>
            </p>
          )}
          {view === 'signup' && alreadyExists && (
            <p className="account-switch">
              <button type="button" className="link-button" onClick={() => switchView('signin')}>Sign in</button>
              {' · '}
              <button type="button" className="link-button" onClick={() => switchView('reset')}>Reset password</button>
              {' · '}
              <button type="button" className="link-button" onClick={() => switchView('confirm')}>Enter the code</button>
            </p>
          )}
          {view === 'confirm' && (
            <p className="account-switch">
              <button type="button" className="link-button" onClick={handleResendConfirmation} disabled={busy}>
                Send the email again
              </button>
              {' · '}
              <button type="button" className="link-button" onClick={() => switchView('signin')}>Back to sign in</button>
            </p>
          )}
          {((view === 'signup' && !alreadyExists) || view === 'reset') && (
            <p className="account-switch">
              <button type="button" className="link-button" onClick={() => switchView('signin')}>Back to sign in</button>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
