"""에러 메시지 글자 처리 (D-117, D-122).

- key_line(): 에러 메시지의 "핵심 줄" 찾기 (D-117). 제목 표시와 비슷한 기록 유사도 보정(D-118)에 함께 쓴다.
- mask_variable_parts(): 비슷한 기록을 비교할 때만 경로·줄 번호·메모리 주소를 자리표시자로 바꾼다 (D-122).
  서버 비교 전용이다. 저장·화면 표시·핵심 줄 찾기에는 쓰지 않는다.
둘 다 저장하지 않고 필요할 때 계산한다.
"""
import re

# key_line 규칙을 바꾸면 반대쪽 구현(frontend/src/errorText.ts)과 D-117의 테스트 사례를 함께 고친다(D-117).
# 이 주석은 key_line에만 해당한다. mask_variable_parts(D-122)는 프론트에 대응 구현이 없다.
# 화면(JS)과 똑같이 동작하도록 \w를 ASCII로 제한한다(re.ASCII).
_NAME = r"[\w$]+"
_ERROR_SHAPED = [
    # a) 점이 들어갈 수 있는 이름 + Error / Exception / Exit / Interrupt 로 끝나는 단어
    re.compile(r"^(?:" + _NAME + r"\.)*[\w$]*(?:Error|Exception|Exit|Interrupt)\b", re.ASCII),
    # b) 점이 하나 이상 들어간 이름 + 콜론
    re.compile(r"^" + _NAME + r"(?:\." + _NAME + r")+:", re.ASCII),
    # c) Exception in thread … (Java)
    re.compile(r"^Exception in thread", re.ASCII),
    # d) error / fatal / ERROR / FATAL / Error 다음에 : 또는 [ 또는 공백
    re.compile(r"^(?:error|fatal|ERROR|FATAL|Error)[:\[ \t]", re.ASCII),
]
_STACK_LINE = re.compile(r"^at\s", re.ASCII)
_GUIDE_LINE = [
    re.compile(r"^(?:hint|note|help|tip):", re.IGNORECASE | re.ASCII),
    _STACK_LINE,
    re.compile(r'^File "', re.ASCII),
    re.compile(r"^[\^~]+$", re.ASCII),
]
_NEWLINE = re.compile(r"\r\n|\r|\n")


def key_line(message: str) -> tuple[str, int]:
    """(핵심 줄, 원래 줄 번호(0부터))를 돌려준다. 비어 있지 않은 줄이 없으면 ("", -1)."""
    candidates = [
        (line.strip(), index)
        for index, line in enumerate(_NEWLINE.split(message))
        if line.strip()
    ]
    if not candidates:
        return "", -1
    for text, index in reversed(candidates):
        if _STACK_LINE.match(text):
            continue
        if any(p.match(text) for p in _ERROR_SHAPED):
            return text, index
    for text, index in reversed(candidates):
        if not any(p.match(text) for p in _GUIDE_LINE):
            return text, index
    return candidates[-1]


# --- 비교용 마스킹 (D-122) ---
# 바꾸는 것: 메모리 주소, 파일 경로(뒤의 위치 표기 포함), "line N". 이 순서로 적용한다.
# 바꾸지 않는 것: 따옴표 안 내용, 에러 코드·일반 숫자, URL·시간·날짜·UUID.
_ADDR = re.compile(r"\b0x[0-9a-fA-F]{4,}\b", re.ASCII)
# 공백 없는 토큰 + 바로 뒤의 위치 표기(:12, :12:5, (12,5)). 앞이 ':' 인 토큰은 건너뛰어 URL(//host/..)을 지킨다.
_PATH_TOKEN = re.compile(
    r"(?<![\w.\-~/\\:])((?:[A-Za-z]:)?[\w.\-~@+$/\\]+)"
    r"(?::\d+(?::\d+)?|\(\d+,\d+\))?",
    re.ASCII,
)
_SEPARATOR = re.compile(r"[/\\]")
_EXTENSION_END = re.compile(r"\.[A-Za-z0-9]+$", re.ASCII)
_LETTER = re.compile(r"[A-Za-z]", re.ASCII)
_DIGITS = re.compile(r"\d+", re.ASCII)
_LINE_WORD = re.compile(r"\bline \d+", re.ASCII | re.IGNORECASE)


def _mask_path(match: re.Match[str]) -> str:
    token = match.group(1)
    separators = len(_SEPARATOR.findall(token))
    # 구분자가 있고 영문자가 있어야 하며(날짜·1/2 제외), 구분자 2개 이상 또는 .확장자로 끝나야 경로다.
    if separators == 0 or not _LETTER.search(token):
        return match.group(0)
    if separators < 2 and not _EXTENSION_END.search(token):
        return match.group(0)
    return "<PATH>" + _DIGITS.sub("<LINE>", match.group(0)[len(token):])


def mask_variable_parts(text: str) -> str:
    """매번 달라지는 값(주소·경로·줄 번호)을 같은 자리표시자로 바꾼다. 비교 전용 (D-122)."""
    text = _ADDR.sub("<ADDR>", text)
    text = _PATH_TOKEN.sub(_mask_path, text)
    return _LINE_WORD.sub("line <LINE>", text)
