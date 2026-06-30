from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.prompt_template import PromptTemplate
from app.schemas.prompt_template import PromptTemplateCreate, PromptTemplateUpdate


def get_templates(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    platform: Optional[str] = None,
    language: Optional[str] = None,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> List[PromptTemplate]:
    q = db.query(PromptTemplate)
    if platform:
        q = q.filter(PromptTemplate.platform == platform)
    if language:
        q = q.filter(PromptTemplate.language == language)
    if category:
        q = q.filter(PromptTemplate.category == category)
    if is_active is not None:
        q = q.filter(PromptTemplate.is_active == is_active)
    return q.order_by(PromptTemplate.id.desc()).offset(skip).limit(limit).all()


def count_templates(
    db: Session,
    platform: Optional[str] = None,
    language: Optional[str] = None,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> int:
    q = db.query(PromptTemplate)
    if platform:
        q = q.filter(PromptTemplate.platform == platform)
    if language:
        q = q.filter(PromptTemplate.language == language)
    if category:
        q = q.filter(PromptTemplate.category == category)
    if is_active is not None:
        q = q.filter(PromptTemplate.is_active == is_active)
    return q.count()


def get_template(db: Session, template_id: int) -> Optional[PromptTemplate]:
    return db.query(PromptTemplate).filter(PromptTemplate.id == template_id).first()


def get_template_by_name(db: Session, name: str) -> Optional[PromptTemplate]:
    return db.query(PromptTemplate).filter(PromptTemplate.name == name).first()


def get_active_template(
    db: Session,
    platform: str,
    language: str = "zh",
    category: Optional[str] = None,
) -> Optional[PromptTemplate]:
    """Get the best matching active template by platform > language > category."""
    q = db.query(PromptTemplate).filter(PromptTemplate.is_active == True)
    q = q.filter(PromptTemplate.platform == platform)
    q = q.filter(PromptTemplate.language == language)
    if category:
        q = q.filter(PromptTemplate.category == category)
    return q.order_by(PromptTemplate.version.desc()).first()


def create_template(db: Session, data: PromptTemplateCreate) -> PromptTemplate:
    obj = PromptTemplate(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_template(db: Session, template_id: int, data: PromptTemplateUpdate) -> Optional[PromptTemplate]:
    obj = get_template(db, template_id)
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_template(db: Session, template_id: int) -> bool:
    obj = get_template(db, template_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True
