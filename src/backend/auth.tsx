import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { arrivedFromRecoveryLink, emailLinkError, supabase } from './client'

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
  /** Throws EmailNotConfirmedError for an account whose email is not confirmed yet. */
  signIn(email: string, password: string): Promise<void>
  signUp(fields: SignUpFields): Promise<{ needsEmailConfirmation: boolean; alreadyExists: boolean }>
  /** The 6-digit code from the sign-up email; signs the student in. */
  confirmSignupCode(email: string, code: string): Promise<void>
  resendConfirmation(email: string): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  /** The 6-digit code from the reset email: a fallback when the link is broken. */
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

const INVALID_CODE = 'That code is not valid or has expired.'

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

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })
    return () => sub.subscription.unsubscribe()
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
      if (error) throw new Error(INVALID_CODE)
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
      if (error) throw new Error(INVALID_CODE)
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
      await requireClient().auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
