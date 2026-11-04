"""에러 메시지의 "핵심 줄" 찾기 (D-117).

제목 표시와 비슷한 기록 유사도 보정(D-118)에 함께 쓴다. 저장하지 않고 필요할 때 계산한다.
"""
import re

# 규칙을 바꾸면 반대쪽 구현(frontend/src/errorText.ts)과 D-117의 테스트 사례를 함께 고친다(D-117).
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
