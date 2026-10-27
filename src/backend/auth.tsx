import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { arrivedFromRecoveryLink, emailLinkError, supabase } from './client'
import { onRemoteSignOut } from './browserSessionStorage'

export interface Profile {
  id: string
  email: string
  full_name: string
  student_no: string
  class_group: string
  role: 'student' | 'admin'
  /**
   * First sign-in (#14). Undefined until schema.sql adds the columns; null
   * means the tour and placement test haven't been done.
   */
  onboarded_at?: string | null
  placement_score?: number | null
  placement_credit?: boolean
}

export interface SignUpFields {
  email: string
  password: string
  fullName: string
  studentNo: string
  classGroup: string
}

interface AuthState {
  /** False until the stored session (if any) has been restored. */
  ready: boolean
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  /** True after arriving from a password-reset email, until a new password is set. */
  passwordRecovery: boolean
  /** The page was opened from an email link that had expired or was already used. */
  linkExpired: boolean
  /**
   * Email of a sign-up still waiting for its code, for the rest of this
   * browser session; null once confirmed. Drives the "not active yet" note.
   */
  pendingConfirmation: string | null
  setPendingConfirmation(email: string | null): void
  /** A session for an unconfirmed email was refused; open "Confirm your email". */
  confirmationRequested: boolean
  dismissConfirmationRequest(): void
  /**
   * The session ended without the student pressing Sign out (expired or
   * unrefreshable token, sign-out in another tab), so nothing is being saved.
   */
  signedOutUnexpectedly: boolean
  dismissSignedOutWarning(): void
  /** Throws EmailNotConfirmedError for an account whose email is not confirmed yet. */
  signIn(email: string, password: string): Promise<void>
  signUp(fields: SignUpFields): Promise<{ needsEmailConfirmation: boolean; alreadyExists: boolean }>
  /** The code from the sign-up email; signs the student in. Throws CodeRejectedError. */
  confirmSignupCode(email: string, code: string): Promise<void>
  resendConfirmation(email: string): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  /** The code from the reset email: a fallback when the link is broken. Throws CodeRejectedError. */
  verifyRecoveryCode(email: string, code: string): Promise<void>
  updatePassword(password: string): Promise<void>
  dismissPasswordRecovery(): void
  /** Ends the first-sign-in tour; a placement score of 6+ with credit counts Module 0 as done. */
  completeOnboarding(score: number | null, credit: boolean): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Sign-in refused because the email has not been confirmed yet. */
export class EmailNotConfirmedError extends Error {}

// Usually the code was already used: school Outlook (Safe Links) opens the
// email's link before the student does, which confirms the account and
// spends the code (#68). So the way forward is signing in, not a new code.
export class CodeRejectedError extends Error {
  constructor() {
    super('This code was already used or has expired. Your email may already be confirmed: try signing in.')
  }
}

const PENDING_KEY = 'x86sim:pending-confirmation'

// sessionStorage can throw (blocked site data); the note is only a convenience.
function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}

function writePending(email: string | null) {
  try {
    if (email) sessionStorage.setItem(PENDING_KEY, email)
    else sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // ignore
  }
}

function requireClient() {
  if (!supabase) throw new Error('Accounts are not configured on this site.')
  return supabase
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  // Taken from the URL too, so a PASSWORD_RECOVERY event that fired before
  // the subscription below still opens "choose a new password".
  const [passwordRecovery, setPasswordRecovery] = useState(arrivedFromRecoveryLink)
  const [linkExpired, setLinkExpired] = useState(emailLinkError !== null)
  const [pendingConfirmation, setPending] = useState(readPending)
  const [confirmationRequested, setConfirmationRequested] = useState(false)
  const [signedOutUnexpectedly, setSignedOutUnexpectedly] = useState(false)
  // Whether this tab had a session, and whether the student is signing out
  // on purpose: only losing a session nobody asked to end warns (#65).
  const hadSession = useRef(false)
  const signingOut = useRef(false)

  function setPendingConfirmation(email: string | null) {
    writePending(email)
    setPending(email)
  }

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    // With "Confirm email" on Supabase never hands out such a session; this is
    // the safety net if the setting is ever off, so an unconfirmed account
    // can't use the site as a registered student (#62).
    function accept(next: Session | null) {
      if (next && !next.user.email_confirmed_at) {
        setPendingConfirmation(next.user.email ?? null)
        setConfirmationRequested(true)
        // Deferred: calling auth methods inside onAuthStateChange can deadlock.
        setTimeout(() => void client.auth.signOut({ scope: 'local' }), 0)
        hadSession.current = false
        setSession(null)
        return
      }
      if (next) {
        setPendingConfirmation(null)
        setSignedOutUnexpectedly(false)
      } else if (hadSession.current && !signingOut.current) {
        setSignedOutUnexpectedly(true)
      }
      hadSession.current = next !== null
      setSession(next)
    }
    client.auth.getSession().then(({ data }) => {
      accept(data.session)
      setReady(true)
    })
    const { data: sub } = client.auth.onAuthStateChange((event, next) => {
      accept(next)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })
    // Another tab signed out: drop this tab's in-memory copy too, which
    // fires SIGNED_OUT above and shows the warning.
    const stopRemote = onRemoteSignOut(() => {
      if (hadSession.current) void client.auth.signOut({ scope: 'local' })
    })
    return () => {
      sub.subscription.unsubscribe()
      stopRemote()
    }
  }, [])

  const userId = session?.user.id ?? null
  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null)
      return
    }
    let cancelled = false
    supabase
      .from('profiles')
      // '*' so the onboarding columns come along once schema.sql adds them,
      // without failing (and losing the admin role) before that.
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setProfile((data as Profile | null) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const value: AuthState = {
    ready,
    session,
    profile,
    isAdmin: profile?.role === 'admin',
    passwordRecovery,
    linkExpired,
    pendingConfirmation,
    setPendingConfirmation,
    confirmationRequested,
    dismissConfirmationRequest() {
      setConfirmationRequested(false)
    },
    signedOutUnexpectedly,
    dismissSignedOutWarning() {
      setSignedOutUnexpectedly(false)
    },
    async signIn(email, password) {
      const { error } = await requireClient().auth.signInWithPassword({ email, password })
      if (error?.code === 'email_not_confirmed') throw new EmailNotConfirmedError(error.message)
      if (error) throw error
    },
    async signUp({ email, password, fullName, studentNo, classGroup }) {
      const { data, error } = await requireClient().auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, student_no: studentNo, class_group: classGroup },
          emailRedirectTo: window.location.origin,
        },
      })
      // With email confirmation on, Supabase answers a sign-up for an address
      // that already has a confirmed account with a user that has no
      // identities instead of an error, so the address can't be probed.
      if (error?.code === 'user_already_exists') return { needsEmailConfirmation: false, alreadyExists: true }
      if (error) throw error
      if (data.user && data.user.identities?.length === 0) return { needsEmailConfirmation: false, alreadyExists: true }
      return { needsEmailConfirmation: !data.session, alreadyExists: false }
    },
    async confirmSignupCode(email, code) {
      const { error } = await requireClient().auth.verifyOtp({ email, token: code, type: 'signup' })
      if (error) throw new CodeRejectedError()
    },
    async resendConfirmation(email) {
      const { error } = await requireClient().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) {
        throw new Error('Please wait a minute before asking for another email.')
      }
      if (error) throw error
    },
    async sendPasswordReset(email) {
      const { error } = await requireClient().auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) throw error
    },
    async verifyRecoveryCode(email, code) {
      const { error } = await requireClient().auth.verifyOtp({ email, token: code, type: 'recovery' })
      if (error) throw new CodeRejectedError()
      setPasswordRecovery(true)
    },
    async updatePassword(password) {
      const { error } = await requireClient().auth.updateUser({ password })
      if (error) throw error
      setPasswordRecovery(false)
    },
    dismissPasswordRecovery() {
      setPasswordRecovery(false)
      setLinkExpired(false)
    },
    async completeOnboarding(score, credit) {
      if (!supabase || !userId) return
      const values = { onboarded_at: new Date().toISOString(), placement_score: score, placement_credit: credit && (score ?? 0) >= 6 }
      setProfile((p) => (p ? { ...p, ...values } : p))
      await supabase.from('profiles').update(values).eq('id', userId)
    },
    async signOut() {
      signingOut.current = true
      try {
        await requireClient().auth.signOut()
      } finally {
        signingOut.current = false
      }
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
