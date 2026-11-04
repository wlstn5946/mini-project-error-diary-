import { useEffect, useState, type KeyboardEvent } from 'react'
import { fetchTags, TAG_NAME_MAX, TAG_NAME_TOO_LONG, type Tag } from './tagsApi'
import { normalizeTag, recommendTags, tagKey } from './tagRecommend'
import './TagInput.css'

// 에러 입력 시 태그 지정 (R-001, D-006). 시안 에러해결창_예시.png ①의 "태그 (최대 5개)" 부분.
// 새 태그는 여기서 저장하지 않고 이름만 부모에게 넘긴다. 에러를 저장할 때 함께 만든다. (D-020)
// 추천 태그: 비슷한 기록의 태그(D-081)와, 에러 메시지에서 규칙으로 찾은 내 태그(D-120)를 추천 칩으로 보여준다.
// 새 태그 이름은 만들어 추천하지 않고, 누르기 전에는 태그가 붙지 않는다. 계산은 tagRecommend.ts.

// 에러 저장(A-002) 요청에 그대로 쓸 모양: 기존 태그는 ID, 새 태그는 이름
export type TagsValue = {
  existingIds: number[]
  newNames: string[]
}

type Props = {
  onChange: (value: TagsValue) => void
  // 에러가 저장된 뒤에는 고칠 수 없게 잠근다 (D-034)
  disabled?: boolean
  // 기록 수정(A-010)에서 현재 태그를 처음부터 채워 두는 용도. 없으면 빈 상태로 시작한다.
  initialTags?: { id: number; name: string }[]
  // 비슷한 기록의 태그. 추천 칩으로만 보여주고 이미 고른 태그는 뺀다 (D-081)
  suggestedTags?: { id: number; name: string }[]
  // 추천에 쓸 에러 메시지(입력이 멈춘 뒤의 값). 없으면 비슷한 기록의 태그만 추천한다 (D-120)
  errorText?: string
}

type Status = 'loading' | 'ready' | 'error'
// id가 null이면 아직 DB에 없는 새 태그
type Chip = { id: number | null; name: string }
type Notice = { text: string; error: boolean }
// 자동 완성 제안: 태그와, 별칭으로 찾았다면 맞은 별칭 (D-114)
type Suggestion = { tag: Tag; alias: string | null }

const MAX_TAGS = 5 // D-022
const MAX_SUGGESTIONS = 8
const MAX_RECOMMENDED = 5 // D-120


function TagInput({ onChange, disabled = false, initialTags, suggestedTags = [], errorText = '' }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [chips, setChips] = useState<Chip[]>(() => (initialTags ?? []).map((t) => ({ id: t.id, name: t.name })))
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  // 자동 완성 목록에서 ↑↓로 고른 위치. -1이면 고르지 않음
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const controller = new AbortController()
    fetchTags(controller.signal)
      .then((list) => {
        setAllTags(list)
        setStatus('ready')
      })
      .catch(() => {
        // 화면을 떠나 요청을 취소한 경우는 무시한다. 실패해도 직접 입력은 그대로 할 수 있다.
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [reloadKey])

  const key = tagKey(text)
  const chosenKeys = new Set(chips.map((c) => tagKey(c.name)))
  const chosenIds = new Set(chips.flatMap((c) => (c.id === null ? [] : [c.id])))
  // 태그 이름뿐 아니라 별칭에서도 "포함" 검색한다. 별칭으로 찾은 제안은 맞은 별칭을 괄호로 보여준다. (D-114)
  // 고르면 별칭이 아니라 원래 태그(name)가 붙는다. 이미 붙은 태그는 뺀다.
  const suggestions: Suggestion[] =
    key && !disabled
      ? allTags
          .filter((t) => !chosenIds.has(t.id) && !chosenKeys.has(tagKey(t.name)))
          .flatMap((t): Suggestion[] => {
            if (tagKey(t.name).includes(key)) return [{ tag: t, alias: null }]
            const hit = t.aliases.find((a) => tagKey(a.name).includes(key))
            return hit ? [{ tag: t, alias: hit.name }] : []
          })
          .slice(0, MAX_SUGGESTIONS)
      : []

  // 같은 태그는 한 번만, 이미 고른 태그는 뺀다. 최대 개수에 이미 찼으면 보여주지 않는다.
  // 태그 목록을 못 불러왔으면 비슷한 기록의 태그만 쓴다. (D-120)
  const recommended =
    disabled || chips.length >= MAX_TAGS
      ? []
      : recommendTags({
          message: errorText,
          allTags: status === 'error' ? [] : allTags,
          similarTags: suggestedTags,
          chosenKeys,
          max: MAX_RECOMMENDED,
        })

  function update(next: Chip[]) {
    setChips(next)
    onChange({
      existingIds: next.flatMap((c) => (c.id === null ? [] : [c.id])),
      newNames: next.flatMap((c) => (c.id === null ? [c.name] : [])),
    })
  }

  function addTag(raw: string) {
    const name = normalizeTag(raw)
    if (!name) return
    const nameKey = name.toLowerCase()
    // 기존 태그와 대소문자만 다르면 기존 표기로 합치고(python → Python), 별칭과 같으면 원래 태그로 바꾼다(파이썬 → Python).
    // 서버(A-002·A-010)도 같은 규칙으로 한 번 더 바꾸므로 여기는 편의용이다. (D-114)
    const existing =
      allTags.find((t) => tagKey(t.name) === nameKey) ??
      allTags.find((t) => t.aliases.some((a) => tagKey(a.name) === nameKey))
    // 원래 태그 기준으로 이미 붙은 태그인지 본다
    if ((existing && chosenIds.has(existing.id)) || chosenKeys.has(existing ? tagKey(existing.name) : nameKey)) {
      setText('')
      setActive(-1)
      setNotice({ text: '이미 추가한 태그예요.', error: false })
      return
    }
    if (chips.length >= MAX_TAGS) {
      setNotice({ text: `태그는 최대 ${MAX_TAGS}개까지 넣을 수 있어요.`, error: true })
      return
    }
    // 새 태그는 20자까지 (D-115). 이미 있는 태그·별칭을 고르는 것은 길이와 상관없다. 입력값은 그대로 둔다.
    if (!existing && name.length > TAG_NAME_MAX) {
      setNotice({ text: TAG_NAME_TOO_LONG, error: true })
      return
    }
    update([...chips, existing ? { id: existing.id, name: existing.name } : { id: null, name }])
    setText('')
    setActive(-1)
    setNotice(null)
  }

  function removeAt(index: number) {
    update(chips.filter((_, i) => i !== index))
    setNotice(null)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 중의 Enter는 무시한다. 받아들이면 같은 태그가 두 번 들어가거나 마지막 글자가 떨어진다.
    if (e.nativeEvent.isComposing) return

    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      addTag(active >= 0 && suggestions[active] ? suggestions[active].tag.name : text)
    } else if (e.key === 'Backspace' && text === '' && chips.length > 0) {
      removeAt(chips.length - 1)
    }
  }

  function reload() {
    setStatus('loading')
    setReloadKey((k) => k + 1)
  }

  const showSuggestions = suggestions.length > 0

  return (
    <div className="tag-input">
      <label className="field-label" htmlFor="tag-input">
        태그 (최대 {MAX_TAGS}개)
      </label>

      <div className="tag-box">
        {chips.map((chip, i) => (
          <span key={tagKey(chip.name)} className="tag-chip">
            {chip.name}
            {!disabled && (
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={`${chip.name} 태그 삭제`}
                onClick={() => removeAt(i)}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          id="tag-input"
          className="tag-field"
          placeholder="태그 입력 · 기존 태그 자동 완성"
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls="tag-suggestions"
          aria-activedescendant={active >= 0 ? `tag-suggestion-${active}` : undefined}
          aria-describedby="tag-message"
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value)
            setActive(-1)
            if (notice && !notice.error) setNotice(null)
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      {recommended.length > 0 && (
        <div className="tag-recommend" role="group" aria-label="추천 태그">
          <span className="hint">추천 태그</span>
          {recommended.map(({ tag: t, reason }) => (
            <button
              key={t.id}
              type="button"
              className="tag-recommend-chip"
              title={reason}
              onClick={() => addTag(t.name)}
            >
              + {t.name}
            </button>
          ))}
        </div>
      )}

      {showSuggestions && (
        <ul id="tag-suggestions" className="tag-suggestions" role="listbox">
          {suggestions.map(({ tag: t, alias }, i) => (
            <li
              key={t.id}
              id={`tag-suggestion-${i}`}
              className="tag-suggestion"
              role="option"
              aria-selected={i === active}
              // mousedown에서 막아야 입력칸 포커스가 유지된다
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(t.name)}
            >
              {alias ? `${t.name} (${alias})` : t.name}
            </li>
          ))}
        </ul>
      )}

      {/* 잠긴 뒤에는 입력 안내가 필요 없다 */}
      <div id="tag-message" aria-live="polite" hidden={disabled}>
        {notice && <p className={notice.error ? 'tag-error' : 'hint'}>{notice.text}</p>}
        {!notice && status === 'error' && (
          <p className="tag-error">
            기존 태그를 불러오지 못해 자동 완성을 쓸 수 없어요. 직접 입력은 할 수 있어요.
            <button type="button" className="btn-secondary tag-retry" onClick={reload}>
              다시 시도
            </button>
          </p>
        )}
        {!notice && status !== 'error' && <p className="hint">Enter로 태그를 추가해요. 기존 태그는 자동 완성돼요.</p>}
      </div>
    </div>
  )
}

export default TagInput
