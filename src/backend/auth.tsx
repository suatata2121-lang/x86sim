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
  signIn(email: string, password: string): Promise<void>
  signUp(fields: SignUpFields): Promise<{ needsEmailConfirmation: boolean }>
  sendPasswordReset(email: string): Promise<void>
  /** The 6-digit code from the reset email: a fallback when the link is broken. */
  verifyRecoveryCode(email: string, code: string): Promise<void>
  updatePassword(password: string): Promise<void>
  dismissPasswordRecovery(): void
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

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
      .select('id, email, full_name, student_no, class_group, role')
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
      if (error) throw error
      return { needsEmailConfirmation: !data.session }
    },
    async sendPasswordReset(email) {
      const { error } = await requireClient().auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) throw error
    },
    async verifyRecoveryCode(email, code) {
      const { error } = await requireClient().auth.verifyOtp({ email, token: code, type: 'recovery' })
      if (error) throw new Error('That code is not valid or has expired.')
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
