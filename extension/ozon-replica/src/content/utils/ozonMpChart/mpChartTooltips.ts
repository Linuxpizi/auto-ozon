import { MP_CHART_SVG_WIDTH } from './mpChartRenderer'

let tipBound = false

function fmtTipDateFromIso(iso: string): string {
  if (!iso) return '—'
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}.${m[2]}.${m[3]}`
  return String(iso)
}

function fmtRub(n: number): string {
  return `${String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`
}

/** 全局绑定 MP 图表 hover tooltip（单例） */
export function initMpChartTooltipsOnce(): void {
  if (tipBound) return
  tipBound = true

  const tip = document.createElement('div')
  tip.id = 'mjgd_ozon_mp_chart_tip'
  tip.className = 'mjgd_ozon_mp_chart_tip'
  document.body.appendChild(tip)

  const svgW = MP_CHART_SVG_WIDTH
  const padL = 6
  const iw = svgW - padL - 6

  document.addEventListener('mousemove', (e) => {
    const target = (e.target as HTMLElement).closest?.('.mjgd_ozon_mp_chart') as HTMLElement | null
    if (!target) return

    const kind = target.getAttribute('data-mp-kind')
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(decodeURIComponent(target.getAttribute('data-mp-payload') || ''))
    } catch {
      return
    }

    const rect = target.getBoundingClientRect()
    if (!rect.width) return
    const scale = svgW / rect.width
    const svgX = (e.clientX - rect.left) * scale

    let n = 0
    if (kind === 'sales') {
      n = ((payload.prices as number[]) || []).length
    } else if (kind === 'bar') {
      n = ((payload.values as number[]) || []).length
    }
    if (!n) return

    const barSlot = iw / n
    let idx = Math.floor((svgX - padL) / barSlot)
    if (idx < 0) idx = 0
    if (idx >= n) idx = n - 1

    const dateFull = (payload.dateFull as string[]) || []
    const dateLabels = (payload.dateLabels as string[]) || []
    const dateDot = fmtTipDateFromIso(dateFull[idx] || dateLabels[idx] || '') || '—'

    let html = ''
    if (kind === 'sales') {
      const prices = (payload.prices as number[]) || []
      const counts = (payload.counts as number[]) || []
      const p = prices[idx] != null ? prices[idx] : 0
      const c = counts[idx] != null ? counts[idx] : 0
      const rev = p * c
      html = `<div class="mjgd_ozon_mp_tip_date">${dateDot}</div><div>销售额：<span class="mjgd_ozon_mp_tip_val">${rev > 0 ? fmtRub(rev) : '—'}</span></div><div>销售件数：<span class="mjgd_ozon_mp_tip_val">${c}</span> 件</div><div>单价：<span class="mjgd_ozon_mp_tip_val">${fmtRub(p)}</span></div>`
    } else if (kind === 'bar') {
      const metric = String(payload.metric || '数值')
      const values = (payload.values as Array<number | string>) || []
      const v = values[idx]
      const vStr = v != null && v !== '' && !Number.isNaN(Number(v)) ? v : '—'
      html = `<div class="mjgd_ozon_mp_tip_date">${dateDot}</div><div>${metric}：<span class="mjgd_ozon_mp_tip_val">${vStr}</span></div>`
    }

    tip.innerHTML = html
    tip.style.display = 'block'
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    const gap = 10
    let left = e.clientX - tw / 2
    let top = e.clientY - th - gap
    if (left < 4) left = 4
    if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4
    if (top < 4) top = e.clientY + gap
    if (top + th > window.innerHeight - 4) top = window.innerHeight - th - 4
    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
  })

  document.addEventListener(
    'mouseout',
    (e) => {
      const chart = (e.target as HTMLElement).closest?.('.mjgd_ozon_mp_chart')
      if (!chart) return
      const related = e.relatedTarget as Node | null
      if (related && chart.contains(related)) return
      tip.style.display = 'none'
    },
    true,
  )
}
