import type { OzonCharacteristic } from './ozonMetricCollector'

export interface PackagingInfo {
  length: string
  width: string
  height: string
  weight: string
  subjectTags: string
}

const PACKAGING_NAMES = {
  length: [
    /длина.*упаков/i,
    /глубина.*упаков/i,
    /длина.*транспортн/i,
    /package.*(?:length|depth)/i,
  ],
  width: [/ширина.*упаков/i, /ширина.*транспортн/i, /package.*width/i],
  height: [/высота.*упаков/i, /высота.*транспортн/i, /package.*height/i],
  weight: [
    /вес.*упаков/i,
    /масса.*упаков/i,
    /вес.*транспортн/i,
    /package.*weight/i,
  ],
  subjectTags: [/тематик/i, /предметн.*тег/i, /subject.*tag/i],
} as const

export function normalizeOzonMeasure(raw: string, kind: 'length' | 'weight'): string {
  const match = raw.trim().replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  if (!match) return ''
  const value = Number(match[0])
  if (!Number.isFinite(value)) return ''
  const lower = raw.toLocaleLowerCase('ru')
  let normalized = value
  if (kind === 'length') {
    if (/(?:^|\s)(?:мм|mm)(?:\s|$)/i.test(lower)) normalized = value
    else if (/(?:^|\s)(?:см|cm)(?:\s|$)/i.test(lower)) normalized = value * 10
    else if (/(?:^|\s)(?:м|m)(?:\s|$)/i.test(lower)) normalized = value * 1000
    else return ''
  } else {
    if (/(?:^|\s)(?:кг|kg)(?:\s|$)/i.test(lower)) normalized = value * 1000
    else if (/(?:^|\s)(?:г|гр|g)(?:\s|$)/i.test(lower)) normalized = value
    else return ''
  }
  return Number.isInteger(normalized) ? String(normalized) : String(Math.round(normalized * 10) / 10)
}

export function parsePackagingAttrs(attrs: OzonCharacteristic[] | null): PackagingInfo {
  const info: PackagingInfo = { length: '', width: '', height: '', weight: '', subjectTags: '' }
  if (!attrs?.length) return info

  for (const attribute of attrs) {
    const value = attribute.values.join(', ').trim()
    if (!value) continue
    if (PACKAGING_NAMES.length.some((pattern) => pattern.test(attribute.name))) {
      info.length = normalizeOzonMeasure(value, 'length')
    } else if (PACKAGING_NAMES.width.some((pattern) => pattern.test(attribute.name))) {
      info.width = normalizeOzonMeasure(value, 'length')
    } else if (PACKAGING_NAMES.height.some((pattern) => pattern.test(attribute.name))) {
      info.height = normalizeOzonMeasure(value, 'length')
    } else if (PACKAGING_NAMES.weight.some((pattern) => pattern.test(attribute.name))) {
      info.weight = normalizeOzonMeasure(value, 'weight')
    } else if (PACKAGING_NAMES.subjectTags.some((pattern) => pattern.test(attribute.name))) {
      info.subjectTags = value
    }
  }
  return info
}