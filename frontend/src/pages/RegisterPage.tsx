import logo from '../assets/mascot/logo.svg'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api'
import {
  ANSWER_MAX,
  ANSWER_RULE,
  QUESTION_MAX,
  QUESTION_RULE,
  answerLength,
  PASSWORD_MAX,
  PASSWORD_MIN,
  PASSWORD_RULE,
  USERNAME_PATTERN,
  USERNAME_RULE,
  register,
} from '../features/auth/authApi'
import '../features/auth/auth.css'

// 회원가입 (공용, D-082, D-085, D-090, D-092, D-099). 사이드바 없이 보여준다.
// 규칙 안내는 서버와 같은 값(authApi.ts)이지만 안내용이다. 아이디 중복(409)·규칙 위반(422)은 서버 응답을 따른다.
// 가입 성공 뒤에는 자동 로그인하지 않고 로그인 화면으로 보낸다 (D-090).
function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // 입력을 시작한 뒤에만 규칙 위반을 빨갛게 안내한다 (서버와 같은 기준: 아이디는 앞뒤 공백을 뺀 값)
  const usernameViolated = username !== '' && !USERNAME_PATTERN.test(username.trim())
  const passwordViolated = password !== '' && (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
  const questionViolated = question !== '' && [...question.trim()].length > QUESTION_MAX
  const answerViolated = answer !== '' && answerLength(answer) > ANSWER_MAX

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    // 보안 질문·답 규칙은 서버도 검사한다 (D-116). 여기서는 가입 전에 안내만 먼저 한다.
    if (question.trim() === '' || questionViolated) {
      setError(`보안 질문은 ${QUESTION_RULE}`)
      return
    }
    if (answerLength(answer) < 1 || answerViolated) {
      setError(`보안 답변은 ${ANSWER_RULE}`)
      return
    }
    // 비밀번호 확인은 서버가 모르는 화면 전용 검사다
    if (password !== confirm) {
      setError('비밀번호가 서로 달라요.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await register(username, password, question, answer)
      // 로그인 화면으로 보낸다. 로그인하기 전에 가려던 주소(state.from)는 그대로 이어서 넘긴다.
      const from = (location.state as { from?: string } | null)?.from
      navigate('/login', { replace: true, state: { registered: true, from } })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '가입하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
      setPassword('')
      setConfirm('')
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-brand brand-logo">
          <img src={logo} alt="" aria-hidden="true" width={24} height={24} />
          에러 일기
        </div>
        <h1 className="page-title">회원가입</h1>
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="field-label" htmlFor="register-username">
              아이디
            </label>
            <input
              id="register-username"
              className="auth-input"
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
            <p className={usernameViolated ? 'auth-rule violated' : 'auth-rule'}>{USERNAME_RULE}</p>
          </div>
          <div className="auth-field">
            <label className="field-label" htmlFor="register-password">
              비밀번호
            </label>
            <input
              id="register-password"
              className="auth-input"
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className={passwordViolated ? 'auth-rule violated' : 'auth-rule'}>{PASSWORD_RULE}</p>
          </div>
          <div className="auth-field">
            <label className="field-label" htmlFor="register-confirm">
              비밀번호 확인
            </label>
            <input
              id="register-confirm"
              className="auth-input"
              type="password"
              name="password-confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label className="field-label" htmlFor="register-question">
              보안 질문
            </label>
            <input
              id="register-question"
              className="auth-input"
              type="text"
              name="security-question"
              autoComplete="off"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <p className={questionViolated ? 'auth-rule violated' : 'auth-rule'}>{QUESTION_RULE}</p>
          </div>
          <div className="auth-field">
            <label className="field-label" htmlFor="register-answer">
              보안 답변
            </label>
            <input
              id="register-answer"
              className="auth-input"
              type="text"
              name="security-answer"
              autoComplete="off"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <p className={answerViolated ? 'auth-rule violated' : 'auth-rule'}>{ANSWER_RULE}</p>
          </div>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary auth-submit" disabled={submitting}>
            회원가입
          </button>
        </form>
        <p className="auth-switch">
          이미 계정이 있어요? <Link to="/login" state={location.state}>로그인</Link>
        </p>
      </div>
    </main>
  )
}

export default RegisterPage
