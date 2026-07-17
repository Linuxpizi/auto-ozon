import { reactive } from 'vue'
import { buildDefaultCardFieldConfig, type CardFieldConfig } from './cardFields'

export const cardFieldStore = reactive<{ config: CardFieldConfig }>({
  config: buildDefaultCardFieldConfig(),
})

/** 远程卡片偏好是否已加载（未加载前不做按需跳过，避免贴卡竞态丢数据） */
let cardFieldPreferenceLoaded = false

export function markCardFieldPreferenceLoaded(loaded = true): void {
  cardFieldPreferenceLoaded = loaded
}

export function isCardFieldPreferenceLoaded(): boolean {
  return cardFieldPreferenceLoaded
}

export function resetCardFieldPreferenceState(): void {
  cardFieldPreferenceLoaded = false
  cardFieldStore.config = buildDefaultCardFieldConfig()
}

export function setCardFieldConfig(config: CardFieldConfig) {
  cardFieldStore.config = config
}

export function getCardFieldConfig(): CardFieldConfig {
  return cardFieldStore.config
}

/** 卡片字段是否开启（未配置时默认开启，与 applyCardFieldVisibility 一致） */
export function isCardFieldEnabled(key: string): boolean {
  const item = cardFieldStore.config.fields.find((f) => f.key === key)
  return item ? item.visible !== false : true
}

/** 跟卖三字段任一开启才需请求 Ozon otherOffersFromSellers */
export function needsCardFollowApi(): boolean {
  if (!cardFieldPreferenceLoaded) return true
  return isCardFieldEnabled('followSellers')
    || isCardFieldEnabled('followMinPrice')
    || isCardFieldEnabled('followMaxPrice')
}

/** 按偏好配置顺序重排卡片数据行（head / 选品标签 / actions 位置不变） */
export function applyCardFieldOrder(card: HTMLElement) {
  const actions = card.querySelector('.mjgd_ozon_card_actions')
  const rowsByKey = new Map<string, HTMLElement>()
  card.querySelectorAll<HTMLElement>('.mjgd_ozon_card_row[data-field-key]').forEach((row) => {
    const key = row.getAttribute('data-field-key')
    if (key) rowsByKey.set(key, row)
  })

  const rowParent = actions?.parentElement || card
  cardFieldStore.config.fields.forEach(({ key }) => {
    const row = rowsByKey.get(key)
    if (!row) return
    if (actions) rowParent.insertBefore(row, actions)
    else rowParent.appendChild(row)
  })
}

/** 排序 + 显隐一并应用 */
export function applyCardFieldLayout(card: HTMLElement) {
  applyCardFieldOrder(card)
  applyCardFieldVisibility(card)
}

/** 按偏好配置隐藏卡片行 */
export function applyCardFieldVisibility(card: HTMLElement) {
  const visibility = new Map<string, boolean>()
  cardFieldStore.config.fields.forEach((f) => {
    visibility.set(f.key, f.visible !== false)
  })

  card.querySelectorAll<HTMLElement>('[data-field-key]').forEach((el) => {
    const key = el.getAttribute('data-field-key')
    if (!key) return
    const row = el.classList.contains('mjgd_ozon_card_row') ? el : el.closest('.mjgd_ozon_card_row')
    if (!row) return
    const visible = visibility.get(key)
    ;(row as HTMLElement).style.display = visible === false ? 'none' : ''
  })
}

export function applyCardFieldVisibilityAll(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.mjgd_ozon_sku_card').forEach((card) => {
    applyCardFieldLayout(card)
  })
}

export function applyCardFieldLayoutAll(root: ParentNode = document) {
  applyCardFieldVisibilityAll(root)
}
