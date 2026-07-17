/** 卡片展示格式化（对齐旧版 handlers.js / utils.js） */

import { exchangeRateState } from '../ozonQuickShelve/exchangeRateStore'

export function dashIfEmpty(v: unknown): string {
  if (v === undefined || v === null || v === '') return '--'
  return String(v)
}

export function commissionValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '--'
  const n = parseFloat(String(v))
  if (!Number.isFinite(n)) return '--'
  const truncated = Math.floor(n * 100) / 100
  return `${truncated.toFixed(2)}%`
}

function parseGmvRubNumber(gmvSum: unknown): number {
  return parseFloat(String(gmvSum ?? '').replace(/[\s,]/g, '')) || 0
}

/** 人民币数值 → ≈￥ 展示（≥1万走"万"档） */
function formatCnyApproxMark(cny: number): string {
  if (!Number.isFinite(cny)) return '≈￥0'
  if (Math.abs(cny) >= 10000) {
    const wan = Math.round((cny / 10000) * 100) / 100
    const s = wan.toFixed(2).replace(/\.?0+$/, '')
    return `≈￥${s}万`
  }
  return `≈￥${(Math.round(cny * 100) / 100).toFixed(2)}`
}

/** 卢布换算约人民币（读汇率配置 lbRMB） */
export function formatGmvCnyApproxMark(gmvSum: unknown): string {
  const rub = parseGmvRubNumber(gmvSum)
  return formatCnyApproxMark(rub * (exchangeRateState.rates.lbRMB || 0.08))
}

/** 原值主体展示（带币种符号，≥1万走"万"档） */
function formatFollowMainPart(num: number, sym: string): string {
  if (num >= 10000) {
    const wan = Math.round((num / 10000) * 100) / 100
    const s = wan.toFixed(2).replace(/\.?0+$/, '')
    return `${sym}${s}万`
  }
  return `${sym}${(Math.round(num * 100) / 100).toFixed(2)}`
}

/**
 * 跟卖最低/最高价展示：按真实币种符号显示原值 + 人民币近似。
 * 价格由商城显示币种本地化（₽/$/¥），unit 即从原文案识别出的符号：
 *   - unit 为空或 ₽ → 卢布，≈￥ 按 lbRMB（保持旧行为）
 *   - $ → 美元，≈￥ 按 myRMB
 *   - ¥/￥ → 人民币，本身即￥，不再二次近似
 */
export function formatFollowPriceWithCnyApprox(priceVal: unknown, unit = '₽'): string {
  if (priceVal === undefined || priceVal === null || priceVal === '') return '--'
  if (typeof priceVal === 'string' && priceVal.trim() === '') return '--'
  const cleaned = String(priceVal)
    .replace(/[\s,₽рубRUB$¥￥]/gi, '')
    .replace(/万/g, '')
    .replace(/,/g, '')
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num)) return '--'
  const sym = unit === '$' ? '$' : unit === '¥' || unit === '￥' ? '¥' : '₽'
  if (num === 0) return `${sym}0.00`
  const mainPart = formatFollowMainPart(num, sym)
  if (sym === '¥') return mainPart // 人民币本身即￥，无需再近似
  const cnyRate = sym === '$'
    ? exchangeRateState.rates.myRMB || 7.2
    : exchangeRateState.rates.lbRMB || 0.08
  return `${mainPart} ${formatCnyApproxMark(num * cnyRate)}`
}

export function formatMonthlySalesRubLine(gmvSum: unknown, monthsales: unknown): string {
  const rubNum = parseGmvRubNumber(gmvSum)
  const rubRaw = gmvSum ?? '0'
  const rubPart = rubNum >= 10000 ? `₽${(rubNum / 10000).toFixed(2)}万` : `₽${rubRaw}`
  if (rubNum === 0) return rubPart
  if (
    monthsales !== undefined &&
    monthsales !== null &&
    monthsales !== '' &&
    Number(monthsales) === 0
  ) {
    return rubPart
  }
  return `${rubPart} ${formatGmvCnyApproxMark(gmvSum)}`
}

export function formatPercent(v: unknown): string {
  if (v === undefined || v === null || v === '') return '--'
  const n = parseFloat(String(v))
  if (!Number.isFinite(n)) return '--'
  return `${(Math.floor(n * 100) / 100).toFixed(2)}%`
}

export function formatPercentOneDecimal(v: unknown): string {
  if (v === undefined || v === null || v === '') return '--'
  const n = parseFloat(String(v).replace(/%/g, '').trim())
  if (!Number.isFinite(n)) return '--'
  const truncated = Math.floor(n * 100) / 100
  return `${truncated.toFixed(2)}%`
}

export function formatPercentTwoDecimalsFromRaw(v: unknown): string {
  if (v === undefined || v === null || v === '') return '0.00%'
  const n = parseFloat(String(v).replace(/%/g, '').trim())
  if (!Number.isFinite(n)) return '0.00%'
  const truncated = Math.floor(n * 100) / 100
  return `${truncated.toFixed(2)}%`
}

export function formatFollowPriceRub(v: unknown): string {
  if (v === undefined || v === null || v === '') return '--'
  const n = parseFloat(String(v))
  if (!Number.isFinite(n)) return String(v)
  return `${n} ₽`
}

export function formatCardCountWithCommas(v: unknown): string {
  if (v === undefined || v === null || v === '') return '0'
  const n = Number(
    String(v)
      .replace(/,/g, '')
      .replace(/\s/g, '')
      .trim(),
  )
  if (!Number.isFinite(n)) return '0'
  return Math.trunc(n).toLocaleString('en-US')
}

export function formatCardVolumeLiters(v: unknown): string {
  if (v === undefined || v === null || v === '') return '--'
  if (typeof v === 'string' && v.trim() === '') return '--'
  const n = parseFloat(
    String(v)
      .replace(/,/g, '.')
      .replace(/\s/g, '')
      .trim(),
  )
  if (!Number.isFinite(n)) return dashIfEmpty(v)
  const truncated = Math.floor(n * 100) / 100
  return truncated.toFixed(2)
}

export function formatSalesDynamicsHtml(salesDynamics: unknown): string {
  if (salesDynamics === undefined || salesDynamics === null || String(salesDynamics).trim() === '') {
    return '<span style="color:#333">--</span>'
  }
  const m = String(salesDynamics).trim().match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return '<span style="color:#333">--</span>'
  const n = parseFloat(m[0].replace(',', '.'))
  if (!Number.isFinite(n)) return '<span style="color:#333">--</span>'
  const absVal = Math.abs(n)
  const truncated = Math.floor(absVal * 100) / 100
  const absStr = truncated.toFixed(2)
  if (n > 0) return `<span style="color:#52c41a;font-weight:600">+${absStr}%</span>`
  if (n < 0) return `<span style="color:#cf1322;font-weight:600">-${absStr}%</span>`
  return '<span style="color:#333">0.00%</span>'
}

function formatDate(isoString: string): string {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return '--'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 急速上架 / SKU 表"时间"列格式化：对齐旧版 crawler.js:9034 formatDate + 5143 正则短路。
 *   - 已经是 YYYY.MM.DD 或 YYYY/MM/DD → 原样返回
 *   - 其他可解析格式（ISO 8601 / `YYYY-MM-DD HH:mm:ss` / 时间戳数字字符串 等）→ UTC `YYYY.MM.DD`
 *   - 解析失败 → 空串（调用方再决定显示 `--`）
 * 旧版用 UTC 保证不会因为不同时区让"2024-01-15T23:00:00Z"在 UTC 显 01.15、本地显 01.16。
 */
export function formatSkuRowCreateDate(raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  if (/^\d{4}[./]\d{2}[./]\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

export function calculateDaysDifferenceAndFormat(isoString: unknown): string {
  if (isoString == null || isoString === '') return '--'
  const startDate = new Date(String(isoString))
  if (Number.isNaN(startDate.getTime())) return '--'
  const today = new Date()
  const msDifference = today.getTime() - startDate.getTime()
  const daysDifference = Math.abs(Math.floor(msDifference / (1000 * 60 * 60 * 24)))
  return `${formatDate(String(isoString))}（${daysDifference}天）`
}

/**
 * 上架时间是否在最近 maxDays 天内（含第 maxDays 天），且上架日不晚于当前时刻。
 * 与 calculateDaysDifferenceAndFormat 使用相同的日期解析方式。
 */
export function isListingWithinPastDays(isoString: unknown, maxDays: number): boolean {
  if (isoString == null || isoString === '') return false
  const listing = new Date(String(isoString))
  if (Number.isNaN(listing.getTime())) return false
  const diffMs = Date.now() - listing.getTime()
  if (diffMs < 0) return false
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return days <= maxDays
}

export function commissionTipTitleFromValues(v1: unknown, v2: unknown, v3: unknown): string {
  return (
    `售价≤1500卢布：${commissionValue(v1)}；1500卢布<售价≤5000卢布：${commissionValue(v2)}；售价>5000卢布：${commissionValue(v3)}`
  )
}

export function formatCommissionBoxDisplay(text: string, isHighlighted: boolean): string {
  const s = String(text ?? '')
  if (!isHighlighted || !/%$/.test(s)) return s
  const icon =
    '<span class="bcs-commission-tier-ok" aria-hidden="true" title="当前售价对应档">' +
    '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="6" cy="6" r="6" fill="#52c41a"/>' +
    '<path d="M3.2 6.1L5.1 8l3.7-4" stroke="#fff" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg></span>'
  return s.replace(/%$/, `%${icon}`)
}

/** 解析 Ozon 页面上展示的卢布文案 */
export function parseOzonRubPriceText(raw: unknown): number {
  if (raw == null) return NaN
  let s = String(raw)
    .trim()
    .replace(/[\u2009\u202f\u00a0\u2007\u2060]/g, '')
    .replace(/\s+/g, '')
    .replace(/₽/g, '')
  s = s.replace(/[^\d.,-]/g, '')
  if (!s) return NaN
  if (/^\d{1,3}(?:,\d{3})+$/.test(s) || /^\d{1,3}(?:,\d{3})+\.\d+$/.test(s)) {
    s = s.replace(/,/g, '')
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

function packagingParseNum(v: unknown): number {
  if (v === undefined || v === null || v === '') return NaN
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export function formatPackagingDimsMm(cd: unknown, kd: unknown, gd: unknown): string {
  const l = packagingParseNum(cd)
  const w = packagingParseNum(kd)
  const h = packagingParseNum(gd)
  if (!Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(h)) return '--'
  if (l === 0 && w === 0 && h === 0) return '--'
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10))
  return `${fmt(l)}x${fmt(w)}*${fmt(h)}mm`
}

/** 卡片长宽高显示（对齐旧版：长度: 359mm 宽度：271mm 高度：48mm） */
export function formatPackagingDimsLong(cd: unknown, kd: unknown, gd: unknown): string {
  const l = packagingParseNum(cd)
  const w = packagingParseNum(kd)
  const h = packagingParseNum(gd)
  if (!Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(h)) return '--'
  if (l === 0 && w === 0 && h === 0) return '--'
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10))
  return `长度: ${fmt(l)}mm 宽度：${fmt(w)}mm 高度：${fmt(h)}mm`
}

export function formatPackagingWeightG(zl: unknown): string {
  if (zl === undefined || zl === null || String(zl).trim() === '') return '--'
  const stripped = String(zl).trim().replace(/^重量\s*[:：]?\s*/i, '')
  const n = packagingParseNum(stripped)
  if (!Number.isFinite(n)) return '--'
  if (n === 0) return '0'
  if (Number.isInteger(n)) return `${n}g`
  const r = Math.round(n * 10) / 10
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1)
  return `${s}g`
}

/** 复制用：规范化数字价格为字符串 */
export function formatNumericPriceForCopy(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (Number.isInteger(n)) return String(n)
  return (Math.round(n * 100) / 100).toFixed(2)
}
