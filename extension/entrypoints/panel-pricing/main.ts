import type { PanelPricingRoute, PanelToolMode, PanelToolSettings } from '@/lib/ozonbox/panel-tools-contract'
import { requirePanelToolData } from '@/lib/ozonbox/panel-tools-contract'
import './style.css'

interface PricingPageContext {
  route: PanelPricingRoute
  sellPrice?: number
  packageWeight?: number
  packageLength?: number
  packageWidth?: number
  packageHeight?: number
  rfbsRate: number[]
  categoryIds: number[]
}

function parseFinite(value: string | null): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function parseNumberArray(value: string | null): number[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item >= 0)
      : []
  } catch {
    return []
  }
}

function readContext(): PricingPageContext {
  const match = location.hash.match(/^#\/(calculate2|calculate)(?:\?(.*))?$/)
  const route: PanelPricingRoute = match?.[1] === 'calculate2' ? 'calculate2' : 'calculate'
  const params = new URLSearchParams(match?.[2] ?? '')
  return {
    route,
    sellPrice: parseFinite(params.get('sell_price')),
    packageWeight: parseFinite(params.get('package_weight')),
    packageLength: parseFinite(params.get('package_length')),
    packageWidth: parseFinite(params.get('package_width')),
    packageHeight: parseFinite(params.get('package_height')),
    rfbsRate: parseNumberArray(params.get('rfbs_rate')),
    categoryIds: parseNumberArray(params.get('category_ids')).filter(Number.isInteger),
  }
}

function factual(value: number | undefined, unit = ''): string {
  return value != null && value > 0 ? `${value}${unit}` : '未获取'
}

function escaped(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function inputNumber(form: FormData, field: string, required = true): number {
  const raw = String(form.get(field) ?? '').trim()
  if (!raw && !required) return 0
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error('请填写有效的非负数值')
  return value
}

function resultCard(items: Array<{ label: string; value: string; tone?: 'positive' | 'negative' }>): string {
  return `<section class="result" aria-live="polite">
    ${items.map(item => `<div class="result-item"><span>${escaped(item.label)}</span><strong class="${item.tone ?? ''}">${escaped(item.value)}</strong></div>`).join('')}
  </section>`
}

function calculator(context: PricingPageContext): string {
  const commission = context.rfbsRate[0]
  if (context.route === 'calculate2') {
    return `<form class="calculator" data-calculator="profit">
      <h2>利润计算器</h2>
      <p class="description">基于当前商品事实和你填写的成本计算。空缺事实不会自动推断。</p>
      <label><span>销售价（RUB）</span><input name="salePrice" type="number" min="0" step="0.01" value="${context.sellPrice && context.sellPrice > 0 ? context.sellPrice : ''}" placeholder="请输入销售价" required></label>
      <label><span>商品及采购成本（RUB）</span><input name="productCost" type="number" min="0" step="0.01" placeholder="请输入真实成本" required></label>
      <label><span>物流及其他成本（RUB）</span><input name="otherCost" type="number" min="0" step="0.01" placeholder="未填写按 0 计算"></label>
      <label><span>rFBS 佣金率（%）</span><input name="commissionRate" type="number" min="0" max="100" step="0.01" value="${commission != null ? commission : ''}" placeholder="未获取，请手动填写" required></label>
      <button type="submit">计算利润</button><div data-result></div>
    </form>`
  }
  return `<form class="calculator" data-calculator="pricing">
    <h2>定价工具</h2>
    <p class="description">根据你填写的真实成本与目标利润率计算建议售价，不调用任何原插件远端服务。</p>
    <label><span>商品及采购成本（RUB）</span><input name="productCost" type="number" min="0" step="0.01" placeholder="请输入真实成本" required></label>
    <label><span>物流及其他成本（RUB）</span><input name="otherCost" type="number" min="0" step="0.01" placeholder="未填写按 0 计算"></label>
    <label><span>rFBS 佣金率（%）</span><input name="commissionRate" type="number" min="0" max="100" step="0.01" value="${commission != null ? commission : ''}" placeholder="未获取，请手动填写" required></label>
    <label><span>目标利润率（%）</span><input name="marginRate" type="number" min="0" max="99.99" step="0.01" placeholder="请输入目标利润率" required></label>
    <button type="submit">计算建议售价</button><div data-result></div>
  </form>`
}

function render(context: PricingPageContext, mode: PanelToolMode): void {
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) throw new Error('定价页挂载节点不存在')
  const categoryText = context.categoryIds.length ? context.categoryIds.join('、') : '未获取'
  const rateText = context.rfbsRate.length ? context.rfbsRate.map(value => `${value}%`).join('、') : '未获取'
  app.innerHTML = `<main>
    <header class="brand-header">
      <div class="brand"><img src="/brand-logo.png" alt="鲸智 AI"><div><strong>鲸智 AI</strong><span>定价工具&利润计算器</span></div></div>
      <span class="mode ${mode}">${mode === 'mock' ? 'MOCK · 未调用后端/Ozon' : 'REAL · 事实采集'}</span>
    </header>
    <section class="facts" aria-label="当前商品事实">
      <div class="section-heading"><div><h1>当前商品事实</h1><p>数据来自当前 Ozon 商品页；“未获取”表示没有可验证事实。</p></div><span>${context.route === 'calculate2' ? '计算利润' : '定价工具'}</span></div>
      <div class="fact-grid">
        <div><span>当前售价</span><strong>${escaped(factual(context.sellPrice, ' RUB'))}</strong></div>
        <div><span>包装重量</span><strong>${escaped(factual(context.packageWeight, ' g'))}</strong></div>
        <div><span>包装尺寸</span><strong>${context.packageLength && context.packageWidth && context.packageHeight ? `${context.packageLength} × ${context.packageWidth} × ${context.packageHeight} mm` : '未获取'}</strong></div>
        <div><span>rFBS 佣金率</span><strong>${escaped(rateText)}</strong></div>
        <div class="wide"><span>类目 ID</span><strong>${escaped(categoryText)}</strong></div>
      </div>
    </section>
    ${calculator(context)}
    <p class="boundary">本页为鲸智 AI 扩展自有页面，不加载、不调用 ozon-plugin-3.1.0 的品牌、主机或服务。</p>
  </main>`

  app.querySelector<HTMLFormElement>('[data-calculator]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!(form instanceof HTMLFormElement)) return
    const output = form.querySelector<HTMLElement>('[data-result]')
    if (!output) return
    try {
      const data = new FormData(form)
      const productCost = inputNumber(data, 'productCost')
      const otherCost = inputNumber(data, 'otherCost', false)
      const commissionRate = inputNumber(data, 'commissionRate')
      if (commissionRate >= 100) throw new Error('佣金率必须小于 100%')
      if (form.dataset.calculator === 'profit') {
        const salePrice = inputNumber(data, 'salePrice')
        const commission = salePrice * commissionRate / 100
        const profit = salePrice - productCost - otherCost - commission
        const margin = salePrice > 0 ? profit / salePrice * 100 : 0
        output.innerHTML = resultCard([
          { label: '预计利润', value: `${profit.toFixed(2)} RUB`, tone: profit >= 0 ? 'positive' : 'negative' },
          { label: '销售利润率', value: `${margin.toFixed(2)}%`, tone: margin >= 0 ? 'positive' : 'negative' },
          { label: '佣金金额', value: `${commission.toFixed(2)} RUB` },
          { label: '总成本', value: `${(productCost + otherCost + commission).toFixed(2)} RUB` },
        ])
      } else {
        const marginRate = inputNumber(data, 'marginRate')
        const denominator = 1 - commissionRate / 100 - marginRate / 100
        if (denominator <= 0) throw new Error('佣金率与目标利润率之和必须小于 100%')
        const totalBaseCost = productCost + otherCost
        const suggestedPrice = totalBaseCost / denominator
        output.innerHTML = resultCard([
          { label: '建议售价', value: `${suggestedPrice.toFixed(2)} RUB`, tone: 'positive' },
          { label: '预计佣金', value: `${(suggestedPrice * commissionRate / 100).toFixed(2)} RUB` },
          { label: '目标利润', value: `${(suggestedPrice * marginRate / 100).toFixed(2)} RUB` },
          { label: '基础成本', value: `${totalBaseCost.toFixed(2)} RUB` },
        ])
      }
    } catch (error: unknown) {
      output.innerHTML = `<div class="error" role="alert">${escaped(error instanceof Error ? error.message : '计算失败')}</div>`
    }
  })
}

async function start(): Promise<void> {
  const context = readContext()
  let mode: PanelToolMode = 'mock'
  try {
    const response = requirePanelToolData<PanelToolSettings>(await browser.runtime.sendMessage({ type: 'PANEL_SETTINGS_GET' }))
    mode = response.mode
  } catch (error: unknown) {
    console.error('读取面板运行模式失败', error)
  }
  render(context, mode)
}

window.addEventListener('hashchange', () => void start())
void start()