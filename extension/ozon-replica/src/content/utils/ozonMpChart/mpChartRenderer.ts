import { resolveAssetUrl } from '../../../utils/runtime'
import fallbackLogo from '../../../assets/img/newlogo.png'
import { getMpChartVisible } from './mpChartPreference'
import type { MpChartItem } from './types'

const logoUrl = resolveAssetUrl('src/assets/img/newlogo.png', fallbackLogo)

const MP_SVG_W = 300
const MP_SVG_H = 176

function escapeHtml(text: unknown): string {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(text: unknown): string {
  return escapeHtml(text).replace(/'/g, '&#39;')
}

function mpYesterdayLocalDate(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - 1)
  return d
}

function mpFormatYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function mpGraphMax(arr: number[]): number {
  let m = 0
  for (let i = 0; i < arr.length; i += 1) {
    if (arr[i] > m) m = arr[i]
  }
  return m
}

function mpTrimCountAfterYesterday(lastDateStr: string): number {
  const yest = mpYesterdayLocalDate()
  const p = (lastDateStr || '').split('-')
  if (p.length !== 3) return 0
  const t = new Date(+p[0], +p[1] - 1, +p[2])
  if (Number.isNaN(t.getTime())) return 0
  const ld0 = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  const diffMs = ld0.getTime() - yest.getTime()
  if (diffMs <= 0) return 0
  return Math.min(60, Math.ceil(diffMs / 86400000))
}

function mpLastDateStrAfterCalendarTrim(lastDateStr: string, trimCount: number): string {
  if (!trimCount || !lastDateStr) return lastDateStr
  const p = lastDateStr.split('-')
  if (p.length !== 3) return lastDateStr
  const d = new Date(+p[0], +p[1] - 1, +p[2])
  if (Number.isNaN(d.getTime())) return lastDateStr
  d.setDate(d.getDate() - trimCount)
  return mpFormatYmdLocal(d)
}

function mpEndDateForLabels(lastDateStr: string): Date {
  const yest = mpYesterdayLocalDate()
  const p = (lastDateStr || '').split('-')
  let endDay: Date
  if (p.length === 3) {
    const t = new Date(+p[0], +p[1] - 1, +p[2])
    endDay = Number.isNaN(t.getTime())
      ? new Date(yest)
      : new Date(t.getFullYear(), t.getMonth(), t.getDate())
  } else {
    endDay = new Date(yest)
  }
  if (endDay.getTime() > yest.getTime()) return yest
  return endDay
}

function mpBuildDateLabels(lastDateStr: string, n: number): string[] {
  const labels: string[] = []
  const end = mpEndDateForLabels(lastDateStr)
  for (let i = 0; i < n; i += 1) {
    const d = new Date(end)
    d.setDate(d.getDate() - (n - 1 - i))
    labels.push(`${d.getMonth() + 1}.${d.getDate()}`)
  }
  return labels
}

function mpBuildDateFullLabels(lastDateStr: string, n: number): string[] {
  const labels: string[] = []
  const end = mpEndDateForLabels(lastDateStr)
  for (let i = 0; i < n; i += 1) {
    const d = new Date(end)
    d.setDate(d.getDate() - (n - 1 - i))
    labels.push(mpFormatYmdLocal(d))
  }
  return labels
}

function mpBuildDualBarLineSvg(
  prices: number[],
  counts: number[],
  dateLabels: string[],
  colorLine: string,
  colorBar: string,
): string {
  const w = MP_SVG_W
  const h = MP_SVG_H
  const padL = 6
  const padR = 6
  const padTop = 4
  const padBot = 24
  const iw = w - padL - padR
  const ih = h - padTop - padBot
  const n = Math.max(prices.length, counts.length, dateLabels.length, 1)
  const maxP = mpGraphMax(prices) || 1
  const maxC = mpGraphMax(counts) || 1
  const baseline = padTop + ih
  const barSlot = iw / n
  const barW = Math.max(2, barSlot * 0.5)

  let rects = ''
  for (let i = 0; i < n; i += 1) {
    const c = counts[i] != null ? counts[i] : 0
    const cx = padL + (i + 0.5) * barSlot
    const bh = (c / maxC) * ih
    const x = cx - barW / 2
    const y = baseline - bh
    rects += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${colorBar}" rx="1"/>`
  }

  let linePts = ''
  for (let i = 0; i < n; i += 1) {
    const pv = prices[i] != null ? prices[i] : 0
    const cx = padL + (i + 0.5) * barSlot
    const y = padTop + ih - (pv / maxP) * ih
    linePts += `${i ? ' ' : ''}${cx},${y}`
  }

  const tickIdx: number[] = []
  const step = Math.max(1, Math.ceil(n / 7))
  for (let i = 0; i < n; i += step) tickIdx.push(i)
  if (tickIdx[tickIdx.length - 1] !== n - 1) tickIdx.push(n - 1)

  let texts = ''
  for (let t = 0; t < tickIdx.length; t += 1) {
    const i = tickIdx[t]
    const lab = dateLabels[i] || ''
    const cx = padL + (i + 0.5) * barSlot
    texts += `<text x="${cx}" y="${h - 5}" text-anchor="middle" font-size="9" fill="#999">${lab}</text>`
  }

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" class="mjgd_ozon_mp_chart_svg" xmlns="http://www.w3.org/2000/svg"><line x1="${padL}" y1="${baseline}" x2="${w - padR}" y2="${baseline}" stroke="#e8e8e8" stroke-width="1"/>${rects}<polyline fill="none" stroke="${colorLine}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${linePts}"/>${texts}</svg>`
}

function mpBuildBarOnlySvg(values: number[], dateLabels: string[], colorBar: string): string {
  const w = MP_SVG_W
  const h = MP_SVG_H
  const padL = 6
  const padR = 6
  const padTop = 4
  const padBot = 24
  const iw = w - padL - padR
  const ih = h - padTop - padBot
  const n = Math.max(values.length, dateLabels.length, 1)
  const maxV = mpGraphMax(values) || 1
  const baseline = padTop + ih
  const barSlot = iw / n
  const barW = Math.max(2, barSlot * 0.55)

  let rects = ''
  for (let i = 0; i < n; i += 1) {
    const v = values[i] != null ? values[i] : 0
    const cx = padL + (i + 0.5) * barSlot
    const bh = (v / maxV) * ih
    const x = cx - barW / 2
    const y = baseline - bh
    rects += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${colorBar}" rx="1"/>`
  }

  const step = Math.max(1, Math.ceil(n / 7))
  const tickIdx: number[] = []
  for (let i = 0; i < n; i += step) tickIdx.push(i)
  if (tickIdx[tickIdx.length - 1] !== n - 1) tickIdx.push(n - 1)

  let texts = ''
  for (let t = 0; t < tickIdx.length; t += 1) {
    const i = tickIdx[t]
    const lab = dateLabels[i] || ''
    const cx = padL + (i + 0.5) * barSlot
    texts += `<text x="${cx}" y="${h - 5}" text-anchor="middle" font-size="9" fill="#999">${lab}</text>`
  }

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" class="mjgd_ozon_mp_chart_svg" xmlns="http://www.w3.org/2000/svg"><line x1="${padL}" y1="${baseline}" x2="${w - padR}" y2="${baseline}" stroke="#e8e8e8" stroke-width="1"/>${rects}${texts}</svg>`
}

function buildToggleButtonHtml(): string {
  const visible = getMpChartVisible()
  const label = visible ? '收起' : '展开'
  const icon = visible ? '▲' : '▼'
  const tip = visible ? '点击收起数据分析图表' : '点击展开数据分析图表'
  return `<button type="button" class="mjgd_ozon_mp_toggle" data-mp-visible="${visible ? 'true' : 'false'}" aria-expanded="${visible ? 'true' : 'false'}" data-tip="${escapeAttr(tip)}"><span class="mjgd_ozon_mp_toggle_label">${label}</span><span class="mjgd_ozon_mp_toggle_icon">${icon}</span></button>`
}

function buildChartHeadHtml(): string {
  return `<div class="mjgd_ozon_mp_chart_head"><img src="${escapeAttr(logoUrl)}" width="30" height="30" alt="" draggable="false" class="mjgd_ozon_mp_chart_logo" /><span class="mjgd_ozon_mp_chart_brand">Auto Ozon</span>${buildToggleButtonHtml()}</div>`
}

/** 收起态：仅 head，保留展开入口 */
export function buildMpChartHeadOnlyHtml(): string {
  return `<div class="mjgd_ozon_mp_chart_wrap" data-mp-collapsed="true">${buildChartHeadHtml()}</div>`
}

export function buildMpChartsRowHtml(item: MpChartItem | null, backendMsg?: string): string {
  if (!item) {
    const emptyTitle =
      backendMsg != null && String(backendMsg).trim() !== ''
        ? escapeHtml(String(backendMsg).trim())
        : '暂无图表数据'
    return `<div class="mjgd_ozon_mp_chart_wrap">${buildChartHeadHtml()}<div class="mjgd_ozon_mp_chart_row mjgd_ozon_mp_chart_row_empty">${emptyTitle}</div></div>`
  }

  let prices = Array.isArray(item.pricesGraph) ? item.pricesGraph : []
  let ordersBar = Array.isArray(item.ordersGraph)
    ? item.ordersGraph
    : Array.isArray(item.Orders)
      ? item.Orders
      : []
  let vis = Array.isArray(item.searchVisibilityGraph) ? item.searchVisibilityGraph : []
  let rub = Array.isArray(item.rubricsGraph) ? item.rubricsGraph : []
  let counts = Array.isArray(item.countGraph) ? item.countGraph : []

  const trimEnd =
    item.LastDate != null && String(item.LastDate).trim() !== ''
      ? mpTrimCountAfterYesterday(item.LastDate)
      : 0

  const applyTailTrim = (arr: number[]) => {
    if (!trimEnd || arr.length <= trimEnd) return arr
    return arr.slice(0, arr.length - trimEnd)
  }

  if (trimEnd > 0) {
    prices = applyTailTrim(prices)
    ordersBar = applyTailTrim(ordersBar)
    vis = applyTailTrim(vis)
    rub = applyTailTrim(rub)
    counts = applyTailTrim(counts)
  }

  const nPts = Math.max(prices.length, ordersBar.length, vis.length, rub.length, counts.length, 1)
  let dateLabels: string[]
  let dateFull: string[]
  const labelLastDateStr =
    item.LastDate != null && String(item.LastDate).trim() !== ''
      ? mpLastDateStrAfterCalendarTrim(item.LastDate, trimEnd)
      : ''

  if (labelLastDateStr) {
    dateLabels = mpBuildDateLabels(labelLastDateStr, nPts)
    dateFull = mpBuildDateFullLabels(labelLastDateStr, nPts)
  } else if (item.firstDate) {
    const ymdYest = mpFormatYmdLocal(mpYesterdayLocalDate())
    dateLabels = mpBuildDateLabels(ymdYest, nPts)
    dateFull = mpBuildDateFullLabels(ymdYest, nPts)
  } else {
    dateLabels = mpBuildDateLabels('', nPts)
    dateFull = mpBuildDateFullLabels('', nPts)
  }

  const linePrice = 'rgba(135, 200, 235, 1)'
  const barSales = 'rgba(123, 204, 177, 0.95)'
  const barVis = 'rgba(224, 144, 197, 0.95)'
  const barCat = 'rgba(255, 152, 80, 0.95)'
  const barStock = 'rgba(71, 167, 215, 0.95)'

  const chart1 = mpBuildDualBarLineSvg(prices, ordersBar, dateLabels, linePrice, barSales)
  const chart2 = mpBuildBarOnlySvg(vis, dateLabels, barVis)
  const chart3 = mpBuildBarOnlySvg(rub, dateLabels, barCat)
  const chart4 = mpBuildBarOnlySvg(counts, dateLabels, barStock)

  const pSales = encodeURIComponent(JSON.stringify({ prices, counts: ordersBar, dateLabels, dateFull }))
  const pVis = encodeURIComponent(JSON.stringify({ values: vis, dateFull, dateLabels, metric: '搜索可见性' }))
  const pRub = encodeURIComponent(JSON.stringify({ values: rub, dateFull, dateLabels, metric: '类目数量' }))
  const pStock = encodeURIComponent(JSON.stringify({ values: counts, dateFull, dateLabels, metric: '剩余件数' }))

  const cell = (title: string, inner: string, kind: string, payload: string) =>
    `<div class="mjgd_ozon_mp_chart_cell"><div class="mjgd_ozon_mp_chart_cell_title">${title}</div><div class="mjgd_ozon_mp_chart_cell_body"><div class="mjgd_ozon_mp_chart" data-mp-kind="${kind}" data-mp-payload="${payload}">${inner}</div></div></div>`

  return `<div class="mjgd_ozon_mp_chart_wrap">${buildChartHeadHtml()}<div class="mjgd_ozon_mp_chart_row">${cell('价格与销量', chart1, 'sales', pSales)}${cell('搜索可见性', chart2, 'bar', pVis)}${cell('类目数量', chart3, 'bar', pRub)}${cell('剩余件数', chart4, 'bar', pStock)}</div></div>`
}

export const MP_CHART_SVG_WIDTH = MP_SVG_W
