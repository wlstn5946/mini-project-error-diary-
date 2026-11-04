"""팀원 1 (찾기·정리): tags 테이블 조회·생성·이름 변경·삭제. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)

계정별 분리 (D-086, D-105): 모든 함수가 user_id를 받는다. 같은 태그 판단(name_key)은 같은 사용자 안에서만 한다.
"""

import re

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models import ErrorTag, Tag
from app.repositories import errors as errors_repo
from app.repositories import tag_aliases as aliases_repo


def normalize_tag_name(raw: str) -> str:
    """앞뒤 공백 → 앞의 # → 다시 앞뒤 공백 순서로 지운다. 화면(TagInput)과 같은 규칙이다. (D-019)"""
    return re.sub(r"^#+", "", raw.strip()).strip()


def tag_key(name: str) -> str:
    """같은 태그 판단용 값(name_key). (D-019)"""
    return normalize_tag_name(name).lower()


def list_tags(db: Session, *, user_id: int) -> list[Tag]:
    """이름순(대소문자 무시). name_key는 겹치지 않지만 정렬을 고정하려고 id를 덧붙인다. (D-021)"""
    query = select(Tag).where(Tag.user_id == user_id).order_by(Tag.name_key, Tag.id)
    return list(db.scalars(query))


def get_tags_by_ids(db: Session, tag_ids: list[int], *, user_id: int) -> list[Tag]:
    """내 태그만 돌려준다. 남의 태그 ID는 결과에 없다(호출하는 쪽이 없는 ID와 같게 처리한다)."""
    if not tag_ids:
        return []
    return list(db.scalars(select(Tag).where(Tag.user_id == user_id, Tag.id.in_(tag_ids))))


def get_tags_by_keys(db: Session, keys: list[str], *, user_id: int) -> dict[str, Tag]:
    if not keys:
        return {}
    query = select(Tag).where(Tag.user_id == user_id, Tag.name_key.in_(keys))
    return {tag.name_key: tag for tag in db.scalars(query)}


def create_tag(db: Session, name: str, *, user_id: int) -> Tag:
    """name은 정규화된 값이어야 한다. 커밋은 호출하는 쪽에서 한다. (D-020)"""
    tag = Tag(user_id=user_id, name=name, name_key=name.lower())
    db.add(tag)
    db.flush()
    return tag


def get_owned_tag(db: Session, *, user_id: int, tag_id: int) -> Tag | None:
    """소유 확인 함수. 내 태그면 돌려주고, 없거나 남의 것이면 None이다. (D-105)"""
    return db.scalars(select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id)).first()


def find_other_tag_by_key(db: Session, key: str, exclude_id: int, *, user_id: int) -> Tag | None:
    """이름을 바꿀 때 같은 name_key를 가진 내 **다른** 태그가 있는지 찾는다. (D-049)"""
    query = select(Tag).where(Tag.user_id == user_id, Tag.name_key == key, Tag.id != exclude_id).limit(1)
    return db.scalars(query).first()


def rename_tag(db: Session, tag: Tag, name: str, *, user_id: int) -> None:
    """name은 정규화된 값이어야 한다. name과 name_key를 함께 바꾼다. (D-019) 커밋은 호출하는 쪽에서 한다."""
    errors_repo.assert_owner(tag, user_id)
    tag.name = name
    tag.name_key = name.lower()
    db.flush()


def merge_tags(db: Session, source: Tag, target: Tag, *, user_id: int) -> None:
    """source(합쳐질 태그)를 지우고 target(남을 태그)에 모은다. (D-113) 커밋은 호출하는 쪽에서 한다.

    ① target이 이미 붙은 기록의 source 연결은 지우고 ② 나머지 source 연결은 target으로 바꾼다
    (error_tags 복합 PK 중복을 피한다). ③ source의 별칭을 target으로 옮기고 ④ source의 이름을 target의 별칭으로
    추가한 뒤 ⑤ source를 지운다. 호출하는 쪽이 한 트랜잭션으로 묶고, 실패하면 롤백한다.
    """
    errors_repo.assert_owner(source, user_id)
    errors_repo.assert_owner(target, user_id)
    if source.id == target.id:
        raise ValueError("같은 태그끼리는 합칠 수 없어요.")

    target_errors = select(ErrorTag.error_id).where(ErrorTag.tag_id == target.id)
    db.execute(delete(ErrorTag).where(ErrorTag.tag_id == source.id, ErrorTag.error_id.in_(target_errors)))
    db.execute(update(ErrorTag).where(ErrorTag.tag_id == source.id).values(tag_id=target.id))

    source_name = source.name
    aliases_repo.move_aliases(db, source, target, user_id=user_id)
    db.delete(source)
    db.flush()  # source의 name_key 자리를 비운 뒤 별칭으로 넣는다
    aliases_repo.create_alias(db, target, source_name, user_id=user_id)


def delete_tag(db: Session, tag: Tag, *, user_id: int) -> None:
    """에러 연결(error_tags)과 별칭(tag_aliases)을 먼저 지우고 태그를 지운다. 쓰이는 태그도 지울 수 있고 에러는 남는다. (D-044, D-050)"""
    errors_repo.assert_owner(tag, user_id)
    errors_repo.remove_tag_links(db, tag.id, user_id=user_id)
    aliases_repo.delete_aliases_of_tag(db, tag, user_id=user_id)  # D-114
    db.delete(tag)
    db.flush()
