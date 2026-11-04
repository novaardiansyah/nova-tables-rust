import React, { useState, FormEvent } from 'react'
import { api, AuthUser } from '@/api'
import Icon, { BrandMark, Spinner } from '@/components/common/Icon'

export interface AuthScreenProps {
  appVersion?: string
  onLoginSuccess: (user: AuthUser) => void
}

export default function AuthScreen({ appVersion, onLoginSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [forgotSuccess, setForgotSuccess] = useState(false)

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
    setGeneralError(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setGeneralError(null)

    if (mode === 'forgot') {
      const nextErrors: Record<string, string | undefined> = {}
      if (!email.trim()) {
        nextErrors.email = 'Please enter your email.'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        nextErrors.email = 'Please enter a valid email address.'
      }
      if (!password) {
        nextErrors.password = 'Please enter a new password.'
      } else if (password.length < 6) {
        nextErrors.password = 'Password must be at least 6 characters.'
      }
      if (!confirmPassword) {
        nextErrors.confirmPassword = 'Please confirm your new password.'
      } else if (password !== confirmPassword) {
        nextErrors.confirmPassword = 'Passwords do not match.'
      }

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors)
        return
      }

      setFieldErrors({})
      setForgotSuccess(true)
      return
    }

    const nextErrors: Record<string, string | undefined> = {}
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedEmail) {
      nextErrors.email = 'Please enter an email.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Please enter a valid email address.'
    }

    if (!password) {
      nextErrors.password = 'Please enter a password.'
    } else if (password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters.'
    }

    if (mode === 'register') {
      if (!confirmPassword) {
        nextErrors.confirmPassword = 'Please confirm your password.'
      } else if (password !== confirmPassword) {
        nextErrors.confirmPassword = 'Passwords do not match.'
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    setBusy(true)

    try {
      if (mode === 'login') {
        const user = await api.loginUser(trimmedEmail, password)
        onLoginSuccess(user)
      } else {
        const user = await api.registerUser(trimmedEmail, password, name.trim() || undefined)
        onLoginSuccess(user)
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string }
      const msg = errorObj?.message || 'Authentication failed. Please check your credentials.'

      if (/email.*taken|already exists/i.test(msg)) {
        setFieldErrors({ email: 'Email is already taken.' })
      } else if (/invalid email or password|invalid credentials/i.test(msg)) {
        setFieldErrors({
          email: ' ',
          password: 'Invalid email or password.',
        })
      } else {
        setGeneralError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setGeneralError(null)
    setFieldErrors({})
    setBusy(true)

    try {
      const user = await api.signInWithGoogle()
      onLoginSuccess(user)
    } catch (err: unknown) {
      const errorObj = err as { message?: string }
      const msg = errorObj?.message || 'Google sign-in failed. Please try again.'
      setGeneralError(msg)
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (nextMode: 'login' | 'register' | 'forgot') => {
    setMode(nextMode)
    setFieldErrors({})
    setGeneralError(null)
    setForgotSuccess(false)
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="flex h-full w-full flex-col justify-between bg-base text-text selection:bg-accent/20">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <BrandMark size={42} />
            <h1 className="mt-3 text-[length:var(--app-text-18)] font-bold tracking-tight text-text-strong">
              {mode === 'forgot' ? 'Reset Password' : 'Nova Tables'}
            </h1>
            <p className="mt-1 text-[length:var(--app-text-12)] text-text-muted">
              {mode === 'login'
                ? 'Sign in to access your database workspaces'
                : mode === 'register'
                  ? 'Create a local account to manage your connections'
                  : 'Enter your credentials to reset your account password'}
            </p>
          </div>

          {mode === 'forgot' && forgotSuccess ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/10 p-3.5 text-[length:var(--app-text-12)] text-success">
                <Icon name="check-circle" size={16} className="mt-0.5 shrink-0" />
                <div className="flex-1 leading-snug">
                  Password reset request received. You may now return to sign in.
                </div>
              </div>

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="btn-primary flex h-9 w-full items-center justify-center rounded-lg font-medium"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {generalError ? (
                <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-[length:var(--app-text-12)] text-danger">
                  <Icon name="alert-triangle" size={14} className="mt-0.5 shrink-0" />
                  <span className="flex-1 leading-snug">{generalError}</span>
                </div>
              ) : null}

              {mode === 'register' ? (
                <div>
                  <label className="block text-[length:var(--app-text-11)] font-medium text-text-muted">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                    placeholder="Enter your name"
                    className="field mt-1"
                  />
                </div>
              ) : null}

              <div>
                <label className="block text-[length:var(--app-text-11)] font-medium text-text-muted">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    clearFieldError('email')
                  }}
                  disabled={busy}
                  autoFocus
                  autoComplete="email"
                  placeholder="name@example.com"
                  className={`field mt-1 ${fieldErrors.email ? 'border-danger focus:border-danger focus:ring-danger/20' : ''}`}
                />
                <FieldError message={fieldErrors.email} />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-[length:var(--app-text-11)] font-medium text-text-muted">
                    {mode === 'forgot' ? 'New Password' : 'Password'}
                  </label>
                  {mode === 'login' ? (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-[length:var(--app-text-11)] font-medium text-accent hover:underline"
                    >
                      Forgot password?
                    </button>
                  ) : null}
                </div>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      clearFieldError('password')
                    }}
                    disabled={busy}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'forgot' ? 'Enter new password' : 'Enter password'}
                    className={`field pr-9 ${fieldErrors.password ? 'border-danger focus:border-danger focus:ring-danger/20' : ''}`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text"
                  >
                    <Icon name={showPassword ? 'eye-off' : 'eye'} size={14} />
                  </button>
                </div>
                <FieldError message={fieldErrors.password} />
              </div>

              {mode === 'register' || mode === 'forgot' ? (
                <div>
                  <label className="block text-[length:var(--app-text-11)] font-medium text-text-muted">
                    {mode === 'forgot' ? 'Confirm New Password' : 'Confirm Password'}
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      clearFieldError('confirmPassword')
                    }}
                    disabled={busy}
                    autoComplete="new-password"
                    placeholder={mode === 'forgot' ? 'Confirm new password' : 'Confirm password'}
                    className={`field mt-1 ${fieldErrors.confirmPassword ? 'border-danger focus:border-danger focus:ring-danger/20' : ''}`}
                  />
                  <FieldError message={fieldErrors.confirmPassword} />
                </div>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="btn-primary mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg font-medium"
              >
                {busy ? <Spinner size={14} /> : null}
                <span>
                  {mode === 'login'
                    ? 'Sign In'
                    : mode === 'register'
                      ? 'Create Account'
                      : 'Reset Password'}
                </span>
              </button>

              {mode === 'login' ? (
                <>
                  <div className="relative my-3 flex items-center justify-center">
                    <div className="w-full border-t border-line/60" />
                    <span className="absolute bg-panel px-2 text-[length:var(--app-text-10)] text-text-muted">
                      or
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={busy}
                    className="btn-soft flex h-9 w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong font-medium transition-colors hover:bg-tint/[0.05] disabled:pointer-events-none disabled:opacity-60"
                  >
                    <GoogleIcon className="h-4 w-4 shrink-0" />
                    <span>Sign in with Google</span>
                  </button>
                </>
              ) : null}
            </form>
          )}

          <div className="mt-6 border-t border-line/60 pt-4 text-center">
            {mode === 'login' ? (
              <p className="text-[length:var(--app-text-12)] text-text-muted">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-medium text-accent hover:underline"
                >
                  Register
                </button>
              </p>
            ) : mode === 'register' ? (
              <p className="text-[length:var(--app-text-12)] text-text-muted">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-medium text-accent hover:underline"
                >
                  Sign in
                </button>
              </p>
            ) : (
              <p className="text-[length:var(--app-text-12)] text-text-muted">
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-medium text-accent hover:underline"
                >
                  Back to sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>

      <footer className="flex h-9 shrink-0 items-center justify-between border-t border-line px-6 text-[length:var(--app-text-10)] text-text-faint">
        <a
          href="https://novaardiansyah.id"
          onClick={(e) => {
            e.preventDefault()
            void api.openExternal('https://novaardiansyah.id')
          }}
          className="transition-colors hover:text-text hover:underline"
        >
          by Nova Ardiansyah
        </a>
        {appVersion ? (
          <a
            href="https://nova-tables.novaardiansyah.id"
            onClick={(e) => {
              e.preventDefault()
              void api.openExternal('https://nova-tables.novaardiansyah.id')
            }}
            className="transition-colors hover:text-text hover:underline"
          >
            v{appVersion}
          </a>
        ) : null}
      </footer>
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message || !message.trim()) return null
  return <p className="mt-1 text-[length:var(--app-text-11)] text-danger leading-tight">{message}</p>
}

function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.36 7.32 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.17 0 9.97 0 12s.46 3.83 1.26 5.42l4.02-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.32 0 3.25 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  )
}

