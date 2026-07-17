import { getSelectionRulesLocal } from './storage'
import { pickMatchingRulesSorted } from './match'
import type { SelectionRule } from './types'
import { hexToRgb, normalizeTagBg } from './matchUtils'
import { getCardGoodsData, getCardListPriceText, getSkuFromCard } from './cardData'
import { isOzonListLikePage, resolveOzonPageType } from '../ozonList/ozonPageContext'

const TAG_ROW_CLASS = 'mjgd_selection_tag_row'

/** 选品标签图标（对齐旧版 bcs-selection-tag-icon，fill=currentColor 跟随 pill 文字色） */
const TAG_ICON_SVG =
  '<svg class="mjgd_selection_tag_icon" width="12" height="12" fill="currentColor" aria-hidden="true" viewBox="64 64 896 896">' +
  '<path d="M483.2 790.3L861.4 412c1.7-1.7 2.5-4 2.3-6.3l-25.5-301.4c-.7-7.8-6.8-13.9-14.6-14.6L522.2 64.3c-2.3-.2-4.7.6-6.3 2.3L137.7 444.8a8.03 8.03 0 000 11.3l334.2 334.2c3.1 3.2 8.2 3.2 11.3 0zm62.6-651.7l224.6 19 19 224.6L477.5 694 233.9 450.5l311.9-311.9zm60.16 186.23a48 48 0 1067.88-67.89 48 48 0 10-67.88 67.89zM889.7 539.8l-39.6-39.5a8.03 8.03 0 00-11.3 0l-362 361.3-237.6-237a8.03 8.03 0 00-11.3 0l-39.6 39.5a8.03 8.03 0 000 11.3l292.8 292.8 39.6 39.5c3.1 3.1 8.2 3.1 11.3 0l407.3-406.6c3.1-3.1 3.1-8.2 0-11.3z"></path>' +
  '</svg>'

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildTagPillHtml(rule: SelectionRule): string {
  const tagBg = normalizeTagBg(rule.tagBg)
  const useTint = !!(tagBg && hexToRgb(tagBg))
  const pillCls = useTint ? 'mjgd_selection_tag_pill mjgd_selection_tag_pill_tint' : 'mjgd_selection_tag_pill'
  const pillStyle = useTint ? ` style="background-color:${tagBg}"` : ''
  return `<span class="${pillCls}"${pillStyle}>${TAG_ICON_SVG}<span class="mjgd_selection_tag_text">${escapeHtml(rule.tagName)}</span></span>`
}

function applyCardBackground(card: HTMLElement, rule: SelectionRule) {
  const tagBg = normalizeTagBg(rule.tagBg)
  const rgb = tagBg ? hexToRgb(tagBg) : null
  if (!rgb || !tagBg) return
  card.classList.add('mjgd_has_selection_tag')
  card.style.background = `linear-gradient(rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.082) 0%, rgb(255, 255, 255) 70%, rgb(255, 255, 255) 100%)`
}

export function clearSelectionTagOnCard(card: HTMLElement) {
  card.classList.remove('mjgd_has_selection_tag')
  card.style.background = ''
  card.querySelectorAll(`.${TAG_ROW_CLASS}`).forEach((el) => el.remove())
}

export function renderSelectionTagsOnCard(card: HTMLElement, rules: SelectionRule[]) {
  const list = (Array.isArray(rules) ? rules : []).filter((r) => r && String(r.tagName || '').trim())
  if (!list.length) return

  clearSelectionTagOnCard(card)
  applyCardBackground(card, list[0])

  const pillsHtml = list.map(buildTagPillHtml).join('')
  const row = document.createElement('div')
  row.className = TAG_ROW_CLASS
  row.innerHTML = `<span class="mjgd_selection_tag_label">选品标签：</span>${pillsHtml}`

  const head = card.querySelector('.mjgd_ozon_card_head')
  if (head) {
    head.insertAdjacentElement('afterend', row)
  } else {
    card.prepend(row)
  }
}

/** 对单张卡片应用选品标签 */
export function applySelectionTagForCard(card: HTMLElement) {
  if (!isOzonListLikePage(resolveOzonPageType())) return

  const rules = getSelectionRulesLocal()
  if (!rules.some((r) => r.enabled)) {
    clearSelectionTagOnCard(card)
    return
  }

  const data = getCardGoodsData(card)
  if (!data) {
    clearSelectionTagOnCard(card)
    return
  }

  const ctx = {
    data,
    card,
    priceText: getCardListPriceText(card),
  }
  const matched = pickMatchingRulesSorted(rules, ctx)
  if (matched.length) renderSelectionTagsOnCard(card, matched)
  else clearSelectionTagOnCard(card)
}

/** 扫描页面所有列表卡片打标 */
export function applySelectionTagsAll(root: ParentNode = document) {
  if (!isOzonListLikePage(resolveOzonPageType())) return
  root.querySelectorAll<HTMLElement>('.mjgd_ozon_sku_card').forEach((card) => {
    applySelectionTagForCard(card)
  })
}

/** 登出或规则清空时移除页面所有选品标签 */
export function clearAllSelectionTags(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.mjgd_ozon_sku_card').forEach((card) => {
    clearSelectionTagOnCard(card)
  })
}

export function findListCardBySku(sku: string): HTMLElement | null {
  const target = String(sku || '').trim()
  if (!target) return null
  let found: HTMLElement | null = null
  document.querySelectorAll<HTMLElement>('.mjgd_ozon_sku_card').forEach((card) => {
    if (!found && getSkuFromCard(card) === target) found = card
  })
  return found
}
