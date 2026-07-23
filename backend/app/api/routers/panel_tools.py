from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.core.db import get_db
from app.models.panel_selection_rule import PanelSelectionRule as SelectionRuleModel
from app.schemas.panel_tools import (
    PanelDeleted,
    PanelListingDraftResult,
    PanelListingPrepareRequest,
    PanelPricingInput,
    PanelPricingResult,
    PanelSelectionConditions,
    PanelSelectionRule,
    PanelSelectionRuleInput,
    PanelSelectionToggle,
)
from app.services.panel_tools_service import calculate_panel_pricing, prepare_listing_draft

router = APIRouter()


def _owned_rule(db: Session, user_id: int, rule_id: int) -> SelectionRuleModel:
    rule = (
        db.query(SelectionRuleModel)
        .filter(SelectionRuleModel.id == rule_id, SelectionRuleModel.user_id == user_id)
        .first()
    )
    if not rule:
        raise HTTPException(404, "选品规则不存在")
    return rule


def _sanitize_rule_conditions(value: object) -> dict:
    if not isinstance(value, dict):
        return {}
    allowed_keys = set(PanelSelectionConditions.model_fields)
    allowed_keys.update(
        field.alias
        for field in PanelSelectionConditions.model_fields.values()
        if field.alias is not None
    )
    return {key: field_value for key, field_value in value.items() if key in allowed_keys}


def _rule_response(rule: SelectionRuleModel) -> PanelSelectionRule:
    return PanelSelectionRule(
        id=rule.id,
        name=rule.name,
        tag=rule.tag,
        color=rule.color,
        autoFavorite=rule.auto_favorite,
        sort=rule.sort,
        enabled=rule.enabled,
        conditions=_sanitize_rule_conditions(rule.conditions),
        updatedAt=(rule.updated_at or rule.created_at).isoformat(),
    )


def _apply_rule_input(rule: SelectionRuleModel, body: PanelSelectionRuleInput) -> None:
    rule.name = body.name
    rule.tag = body.tag
    rule.color = body.color
    rule.auto_favorite = body.auto_favorite
    rule.sort = body.sort
    rule.enabled = body.enabled
    rule.conditions = body.conditions.model_dump(by_alias=True, exclude_none=True)


@router.post("/pricing", response_model=PanelPricingResult)
def pricing(body: PanelPricingInput):
    return calculate_panel_pricing(body)


@router.get(
    "/selection-rules",
    response_model=list[PanelSelectionRule],
    response_model_exclude_none=True,
)
def list_rules(current_user: CurrentUser, db: Session = Depends(get_db)):
    rows = (
        db.query(SelectionRuleModel)
        .filter(SelectionRuleModel.user_id == current_user.id)
        .order_by(SelectionRuleModel.sort.asc(), SelectionRuleModel.id.asc())
        .all()
    )
    return [_rule_response(row) for row in rows]


@router.post(
    "/selection-rules",
    response_model=PanelSelectionRule,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def create_rule(
    body: PanelSelectionRuleInput,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    rule = SelectionRuleModel(user_id=current_user.id)
    _apply_rule_input(rule, body)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_response(rule)


@router.put(
    "/selection-rules/{rule_id}",
    response_model=PanelSelectionRule,
    response_model_exclude_none=True,
)
def update_rule(
    rule_id: int,
    body: PanelSelectionRuleInput,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    rule = _owned_rule(db, current_user.id, rule_id)
    _apply_rule_input(rule, body)
    db.commit()
    db.refresh(rule)
    return _rule_response(rule)


@router.patch(
    "/selection-rules/{rule_id}/enabled",
    response_model=PanelSelectionRule,
    response_model_exclude_none=True,
)
def toggle_rule(
    rule_id: int,
    body: PanelSelectionToggle,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    rule = _owned_rule(db, current_user.id, rule_id)
    rule.enabled = body.enabled
    db.commit()
    db.refresh(rule)
    return _rule_response(rule)


@router.delete("/selection-rules/{rule_id}", response_model=PanelDeleted)
def delete_rule(
    rule_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    rule = _owned_rule(db, current_user.id, rule_id)
    db.delete(rule)
    db.commit()
    return PanelDeleted()


@router.post("/listing/prepare", response_model=PanelListingDraftResult)
def prepare_listing(body: PanelListingPrepareRequest, db: Session = Depends(get_db)):
    return prepare_listing_draft(db, body)