/** 从卡片 DOM 解析包装尺寸/重量，供选品规则匹配使用 */

function parseDimNumber(s: string | null | undefined): number | null {
  if (s == null) return null
  const n = parseFloat(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export interface PackagingDims {
  length: number | null
  width: number | null
  height: number | null
}

/** 解析卡片上的包装尺寸文本（501x404*36mm 或「长度: …mm」格式） */
export function parsePackagingDimsFromCard(card: HTMLElement | null): PackagingDims {
  const empty: PackagingDims = { length: null, width: null, height: null }
  if (!card) return empty

  const el = card.querySelector('.mjgd_ozon_field_packaging')
  const text = (el?.textContent || '').trim()
  if (!text || text === '--' || /加载|暂无/.test(text)) return empty

  const compact = text.replace(/\s+/g, '')
  const m = compact.match(/^(\d+(?:[.,]\d+)?)[x×X*＊](\d+(?:[.,]\d+)?)[x×X*＊](\d+(?:[.,]\d+)?)/i)
  if (m) {
    return {
      length: parseDimNumber(m[1]),
      width: parseDimNumber(m[2]),
      height: parseDimNumber(m[3]),
    }
  }

  const lenM = text.match(/长\s*度?\s*[:：]?\s*(\d+(?:[.,]\d+)?)/i)
  const widM = text.match(/宽\s*度?\s*[:：]?\s*(\d+(?:[.,]\d+)?)/i)
  const heiM = text.match(/高\s*度?\s*[:：]?\s*(\d+(?:[.,]\d+)?)/i)
  if (lenM || widM || heiM) {
    return {
      length: lenM ? parseDimNumber(lenM[1]) : null,
      width: widM ? parseDimNumber(widM[1]) : null,
      height: heiM ? parseDimNumber(heiM[1]) : null,
    }
  }

  return empty
}

/** 解析卡片上的重量文本（123g） */
export function parsePackagingWeightFromCard(card: HTMLElement | null): number | null {
  if (!card) return null
  const el = card.querySelector('.mjgd_ozon_field_packaging_weight')
  const text = (el?.textContent || '').trim()
  if (!text || text === '--' || /加载|暂无/.test(text)) return null
  const m = text.match(/(\d+(?:[.,]\d+)?)/)
  return m ? parseDimNumber(m[1]) : null
}
