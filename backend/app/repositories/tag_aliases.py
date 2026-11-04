"""팀원 1 (찾기·정리): tag_aliases 테이블 조회·생성·이동·삭제. SQL은 이 파일에만 둔다. (D-016)

계정별 분리 (D-086, D-105): 모든 함수가 user_id를 받는다.
별칭 이름은 호출하는 쪽이 정규화(tags.normalize_tag_name)해서 넘긴다. 이 파일은 tags.py를 가져오지 않는다
(tags.merge_tags()가 이 파일을 쓰므로 서로 가져오면 순환된다).
"""

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models import Tag, TagAlias
from app.repositories import errors as errors_repo


def list_aliases_by_tag_ids(db: Session, tag_ids: list[int], *, user_id: int) -> dict[int, list[TagAlias]]:
    """태그마다 별칭을 한 번의 쿼리로 모은다. 별칭 이름순(대소문자 무시, 같으면 id). 별칭이 없는 태그는 키가 없다."""
    if not tag_ids:
        return {}
    query = (
        select(TagAlias)
        .where(TagAlias.user_id == user_id, TagAlias.tag_id.in_(tag_ids))
        .order_by(TagAlias.alias_key, TagAlias.id)
    )
    result: dict[int, list[TagAlias]] = {}
    for alias in db.scalars(query):
        result.setdefault(alias.tag_id, []).append(alias)
    return result


def get_aliases_by_keys(db: Session, keys: list[str], *, user_id: int) -> dict[str, TagAlias]:
    """alias_key로 내 별칭을 한 번의 쿼리로 찾는다. (D-114 ②)"""
    if not keys:
        return {}
    query = select(TagAlias).where(TagAlias.user_id == user_id, TagAlias.alias_key.in_(keys))
    return {alias.alias_key: alias for alias in db.scalars(query)}


def get_owned_alias(db: Session, *, user_id: int, tag_id: int, alias_id: int) -> TagAlias | None:
    """내 별칭이고 그 태그에 딸린 것이면 돌려준다. 아니면 None이다. (D-105)"""
    query = select(TagAlias).where(TagAlias.id == alias_id, TagAlias.tag_id == tag_id, TagAlias.user_id == user_id)
    return db.scalars(query).first()


def create_alias(db: Session, tag: Tag, name: str, *, user_id: int) -> TagAlias:
    """name은 정규화된 값이어야 한다. 겹침 확인은 호출하는 쪽이 한다. 커밋은 호출하는 쪽에서 한다."""
    errors_repo.assert_owner(tag, user_id)
    alias = TagAlias(user_id=user_id, tag_id=tag.id, alias=name, alias_key=name.lower())
    db.add(alias)
    db.flush()
    return alias


def delete_alias(db: Session, alias: TagAlias, *, user_id: int) -> None:
    errors_repo.assert_owner(alias, user_id)
    db.delete(alias)
    db.flush()


def move_aliases(db: Session, from_tag: Tag, to_tag: Tag, *, user_id: int) -> None:
    """from_tag의 별칭을 모두 to_tag로 옮긴다. 합치기에서 쓴다. (D-113) 커밋은 호출하는 쪽에서 한다."""
    errors_repo.assert_owner(from_tag, user_id)
    errors_repo.assert_owner(to_tag, user_id)
    db.execute(
        update(TagAlias)
        .where(TagAlias.tag_id == from_tag.id, TagAlias.user_id == user_id)
        .values(tag_id=to_tag.id)
    )
    db.flush()


def delete_aliases_of_tag(db: Session, tag: Tag, *, user_id: int) -> None:
    """태그를 지우기 전에 그 태그의 별칭을 모두 지운다. (D-114)"""
    errors_repo.assert_owner(tag, user_id)
    db.execute(delete(TagAlias).where(TagAlias.tag_id == tag.id, TagAlias.user_id == user_id))
    db.flush()
