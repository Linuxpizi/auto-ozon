import {
  isAttrValueFilled,
  normalizeFeatureName,
} from '../ozonAiFillAndSubmit'
import type { ProductSession } from './types'

const FEATURE_ATTR_ID_BRAND_TYPE = 85
const FEATURE_ATTR_ID_MANUFACTURER = 23487
const FEATURE_ATTR_ID_ORIGIN_COUNTRY = 4389
const FEATURE_ATTR_ID_SHELF_LIFE_DAYS = 8205
const FEATURE_ATTR_IDS_AUTO_RANDOM_MODEL = new Set([9048, 8292])

const NO_BRAND_OPTION = { id: 126745801, value: '无品牌' }
const CHINA_ORIGIN_OPTION = { id: 90296, value: 'Китай' }

// 型号名称 / 合并至一张卡片：无值时生成 9 位大写字母+数字(1-9，不含0)
function generateRandomModelCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'
  const parts: string[] = []
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(9)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < 9; i++) {
      parts.push(chars[bytes[i]! % chars.length]!)
    }
  } else {
    for (let i = 0; i < 9; i++) {
      parts.push(chars[Math.floor(Math.random() * chars.length)]!)
    }
  }
  return parts.join('')
}

export function getSessionFeatureAttrExistingValue(
  session: ProductSession,
  attr: Record<string, unknown>,
): string | number | string[] | undefined {
  const key = String(attr?.id ?? '')
  const fromWorkbench = session.workbenchFeatureAttrValues[key]
  if (fromWorkbench !== undefined) return fromWorkbench as string | number | string[]
  const fromPrefill = session.prefilledFeatureAttrValues[key]
  if (fromPrefill !== undefined) return fromPrefill
  return attr?.value as string | number | string[] | undefined
}

export function setSessionWorkbenchFeatureAttrValue(
  session: ProductSession,
  attrId: number,
  value: string | number | string[],
): void {
  session.workbenchFeatureAttrValues = {
    ...session.workbenchFeatureAttrValues,
    [String(attrId)]: value,
  }
}

export function ensureRandomModelNameFeatureAttrsOnSession(session: ProductSession): void {
  const list = session.featureAttrs
  if (!Array.isArray(list) || list.length === 0) return
  for (const attr of list) {
    const row = attr as Record<string, unknown>
    if (!row || row.is_aspect) continue
    const id = Number(row.id)
    if (!FEATURE_ATTR_IDS_AUTO_RANDOM_MODEL.has(id)) continue
    const raw = getSessionFeatureAttrExistingValue(session, row)
    if (isAttrValueFilled(row, raw)) continue
    setSessionWorkbenchFeatureAttrValue(session, id, generateRandomModelCode())
  }
}

export function ensureDefaultFeatureAttrSelectionsOnSession(session: ProductSession): void {
  const list = session.featureAttrs
  if (!Array.isArray(list) || list.length === 0) return

  type DefaultFeatureRule =
    | { attrId: number; option: typeof NO_BRAND_OPTION | typeof CHINA_ORIGIN_OPTION }
    | { attrId: number; textValue: string }

  const rules: DefaultFeatureRule[] = [
    { attrId: FEATURE_ATTR_ID_BRAND_TYPE, option: NO_BRAND_OPTION },
    { attrId: FEATURE_ATTR_ID_ORIGIN_COUNTRY, option: CHINA_ORIGIN_OPTION },
    { attrId: FEATURE_ATTR_ID_MANUFACTURER, textValue: CHINA_ORIGIN_OPTION.value },
    { attrId: FEATURE_ATTR_ID_SHELF_LIFE_DAYS, textValue: '1095' },
  ]

  for (const rule of rules) {
    const attr = list.find(
      (item) => Number((item as Record<string, unknown>)?.id) === rule.attrId
        && !(item as Record<string, unknown>)?.is_aspect,
    ) as Record<string, unknown> | undefined
    if (!attr) continue

    const raw = getSessionFeatureAttrExistingValue(session, attr)
    if (isAttrValueFilled(attr, raw)) continue

    if ('textValue' in rule) {
      setSessionWorkbenchFeatureAttrValue(session, rule.attrId, rule.textValue)
      continue
    }

    const options = Array.isArray(attr.dictionary_values) ? attr.dictionary_values : []
    const matched = options.find((item: Record<string, unknown>) => {
      return Number(item?.id) === rule.option.id
        || normalizeFeatureName(String(item?.value ?? '')) === normalizeFeatureName(rule.option.value)
    })

    if ((attr?.dictionary_id ?? 0) !== 0) {
      if (!matched) continue
      if (attr?.is_collection) {
        setSessionWorkbenchFeatureAttrValue(session, rule.attrId, [String((matched as Record<string, unknown>).id)])
      } else {
        setSessionWorkbenchFeatureAttrValue(session, rule.attrId, String((matched as Record<string, unknown>).id))
      }
      continue
    }

    setSessionWorkbenchFeatureAttrValue(session, rule.attrId, rule.option.value)
  }
}
