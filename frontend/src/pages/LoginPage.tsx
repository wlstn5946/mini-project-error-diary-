import logo from '../assets/mascot/logo.svg'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { ApiError } from '../api'
import { useAuth } from '../features/auth/useAuth'
import '../features/auth/auth.css'

// 로그인 (공용, D-082, D-090). 사이드바 없이 보여준다.
// 성공하면 사용자 상태가 바뀌고, 로그인 전용 경로 가드(App.tsx의 GuestOnly)가 원래 주소 또는 첫 화면으로 보낸다 (D-103).
function LoginPage() {
  const { login } = useAuth()
  const location = useLocation()
  // 회원가입을 마치고 넘어온 경우의 안내 (D-090)
  const registered = (location.state as { registered?: boolean } | null)?.registered === true

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  // 서버가 내려준 보안 질문. 실패 5회 이상 계정에만 오고, 화면은 5회를 세지 않는다 (D-116)
  const [question, setQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      // 답은 서버가 질문을 내려준 뒤에만 보낸다
      await login(username, password, question === null ? undefined : answer)
    } catch (e) {
      // 서버 문구를 그대로 보여주고 아이디는 유지, 비밀번호·답 칸은 비운다
      setError(e instanceof ApiError ? e.message : '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
      if (e instanceof ApiError && e.securityQuestion !== null) setQuestion(e.securityQuestion)
      setPassword('')
      setAnswer('')
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page auth-page--login">
      <div className="auth-card">
        <div className="auth-brand brand-logo">
          <img src={logo} alt="" aria-hidden="true" width={24} height={24} />
          에러 일기
        </div>
        <h1 className="page-title">로그인</h1>
        <form onSubmit={handleSubmit}>
          {registered && !error && (
            <p className="auth-notice" role="status">
              가입했어요. 로그인해 주세요.
            </p>
          )}
          <div className="auth-field">
            <label className="field-label" htmlFor="login-username">
              아이디
            </label>
            <input
              id="login-username"
              className="auth-input"
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="auth-field">
            <label className="field-label" htmlFor="login-password">
              비밀번호
            </label>
            <input
              id="login-password"
              className="auth-input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {question !== null && (
            <div className="auth-field">
              <label className="field-label" htmlFor="login-answer">
                보안 질문: {question}
              </label>
              <input
                id="login-answer"
                className="auth-input"
                type="text"
                name="security-answer"
                autoComplete="off"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary auth-submit" disabled={submitting}>
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <p className="auth-switch">
          계정이 없어요? <Link to="/register" state={location.state}>회원가입</Link>
        </p>
      </div>
    </main>
  )
}

export default LoginPage
