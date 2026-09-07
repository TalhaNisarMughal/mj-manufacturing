import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { apiError } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={user.role === 'admin' ? '/dashboard' : '/customers'} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const u = await login(email.trim(), password)
      navigate(u.role === 'admin' ? '/dashboard' : '/customers')
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-brand">
          <div className="brand-mark brand-mark--lg">MJ</div>
          <h1>MJ Manufacturing</h1>
          <p>Customers · Store · Bills &amp; Ledger</p>
        </div>

        <form className="login-card" onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="login-hint">Use your admin or staff account to continue.</p>

          {error && <div className="form-error-banner">{error}</div>}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mjmanufacturing.com"
              autoComplete="username"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
