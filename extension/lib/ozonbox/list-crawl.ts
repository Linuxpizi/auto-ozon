import { getSettings } from '../utils/storage'
import { analyticsPageForUrl } from './analytics-card'
import type { OzonboxProcessCardProductResponse } from './contract'
import type {
  OzonListCardIdentity,
  OzonListCrawlSnapshot,
  OzonListCrawlStatus,
} from './list-crawl-contract'

export const OZON_LIST_CRAWL_HOST_ID = 'jingzhi-ai-ozon-list-crawl'

const PRODUCT_LINK_SELECTOR = 'a[href*="/product/"]'
const DEFAULT_OZON_ORIGIN = 'https://www.ozon.ru'
const EMPTY_SNAPSHOT: OzonListCrawlSnapshot = {
  status: 'idle', collected: 0, saved: 0, skipped: 0, pending: 0, failed: 0, message: '等待启动',
}

function currentBaseUrl(): string {
  return typeof window === 'undefined' ? DEFAULT_OZON_ORIGIN : window.location.href
}

export function extractOzonListSku(href: string, baseUrl = currentBaseUrl()): string {
  try {
    const url = new URL(href, baseUrl)
    const hostname = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || (hostname !== 'ozon.ru' && !hostname.endsWith('.ozon.ru'))) return ''
    const pathname = url.pathname
    const productPath = pathname.match(/\/product\/([^/]+)/i)?.[1] ?? ''
    return productPath.match(/(?:^|-)([1-9]\d{4,})(?:-|$)/)?.[1] ?? ''
  } catch {
    return ''
  }
}

export function canonicalOzonProductUrl(href: string, baseUrl = currentBaseUrl()): string {
  const url = new URL(href, baseUrl)
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function ozonListCardIdentityFromHref(
  href: string,
  baseUrl = currentBaseUrl(),
): OzonListCardIdentity | null {
  const sku = extractOzonListSku(href, baseUrl)
  if (!sku) return null
  return {
    sku,
    sourceUrl: canonicalOzonProductUrl(href, baseUrl),
  }
}

export function parseOzonListProductAnchor(
  anchor: HTMLAnchorElement,
  baseUrl = currentBaseUrl(),
): OzonListCardIdentity | null {
  return ozonListCardIdentityFromHref(anchor.getAttribute('href') || anchor.href, baseUrl)
}

interface MonitorElements {
  host: HTMLElement
  panel: HTMLElement
  status: HTMLElement
  counts: HTMLElement
  pause: HTMLButtonElement
  stop: HTMLButtonElement
  retry: HTMLButtonElement
  close: HTMLButtonElement
}

function createMonitor(): MonitorElements {
  document.getElementById(OZON_LIST_CRAWL_HOST_ID)?.remove()
  const host = document.createElement('div')
  host.id = OZON_LIST_CRAWL_HOST_ID
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>
    :host{all:initial} [hidden]{display:none!important} button{font:inherit}
    .panel{position:fixed;right:184px;bottom:20px;width:286px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#111827;box-shadow:0 10px 30px #0002;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto}
    h3{margin:0 0 8px;font-size:15px}.status{min-height:40px;color:#374151}.counts{margin:8px 0;padding:8px;border-radius:8px;background:#f3f4f6;white-space:pre-wrap}.actions{display:flex;gap:6px;flex-wrap:wrap}
    button{padding:5px 10px;border:1px solid #d1d5db;border-radius:7px;background:#fff;cursor:pointer}button.primary{border-color:#1677ff;background:#1677ff;color:#fff}button:disabled{cursor:not-allowed;opacity:.5}
  </style><section class="panel" hidden><h3>Ozon 商品列表采集</h3><div class="status"></div><div class="counts"></div><div class="actions"><button class="primary" data-action="pause">暂停</button><button data-action="stop">停止</button><button data-action="retry">重试处理</button><button data-action="close">关闭</button></div></section>`
  document.documentElement.append(host)
  const required = <T extends Element>(selector: string): T => {
    const element = shadow.querySelector<T>(selector)
    if (!element) throw new Error(`采集监控元素缺失: ${selector}`)
    return element
  }
  return {
    host,
    panel: required('.panel'),
    status: required('.status'),
    counts: required('.counts'),
    pause: required('[data-action="pause"]'),
    stop: required('[data-action="stop"]'),
    retry: required('[data-action="retry"]'),
    close: required('[data-action="close"]'),
  }
}

export interface OzonListCrawlController {
  start: () => void
  reconcile: () => void
  snapshot: () => OzonListCrawlSnapshot
  stop: () => void
}

export interface OzonListCrawlOptions {
  processCardProduct: (identity: OzonListCardIdentity) => Promise<OzonboxProcessCardProductResponse>
}

function identityKey(identity: OzonListCardIdentity): string {
  return `${identity.sku}\u0000${identity.sourceUrl}`
}

function skippedReason(result: OzonboxProcessCardProductResponse): string {
  if (result.reason === 'no-enabled-rules') return '未启用选品规则'
  if (result.reason === 'no-rule-match') return '未命中选品规则'
  return '规则已跳过'
}

export function startOzonListCrawlController(options: OzonListCrawlOptions): OzonListCrawlController {
  const monitor = createMonitor()
  const products = new Map<string, OzonListCardIdentity>()
  const pending = new Set<string>()
  const saved = new Set<string>()
  const skipped = new Set<string>()
  const failed = new Set<string>()
  let state = { ...EMPTY_SNAPSHOT }
  let disposed = false
  let stopRequested = false
  let runner: Promise<void> | undefined
  let processing: Promise<boolean> | undefined

  const render = (): void => {
    state = {
      ...state,
      collected: products.size,
      saved: saved.size,
      skipped: skipped.size,
      pending: pending.size,
      failed: failed.size,
    }
    monitor.status.textContent = state.message
    monitor.counts.textContent = `已发现 ${state.collected} · 已保存 ${state.saved}\n已跳过 ${state.skipped} · 待处理 ${state.pending} · 失败 ${state.failed}`
    monitor.pause.textContent = state.status === 'paused' ? '继续' : '暂停'
    monitor.pause.disabled = !['collecting', 'paused'].includes(state.status)
    monitor.stop.disabled = !['collecting', 'paused'].includes(state.status)
    monitor.retry.disabled = pending.size === 0 || processing !== undefined
  }
  const setState = (status: OzonListCrawlStatus, message: string): void => {
    state = { ...state, status, message }
    render()
  }
  const scan = (maxItems: number): number => {
    let added = 0
    const seenAnchors = new Set<HTMLAnchorElement>()
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR)) {
      if (seenAnchors.has(anchor)) continue
      seenAnchors.add(anchor)
      const identity = parseOzonListProductAnchor(anchor)
      if (!identity) continue
      const key = identityKey(identity)
      if (products.has(key) || products.size >= maxItems) continue
      products.set(key, identity)
      pending.add(key)
      saved.delete(key)
      skipped.delete(key)
      failed.delete(key)
      added += 1
    }
    render()
    return added
  }
  const processOnce = async (): Promise<boolean> => {
    if (processing) return processing
    const key = pending.values().next().value as string | undefined
    if (!key) return true
    const identity = products.get(key)
    if (!identity) {
      pending.delete(key)
      render()
      return true
    }
    processing = (async () => {
      try {
        const result = await options.processCardProduct(identity)
        if (result.sku !== identity.sku) throw new Error('处理结果与列表商品 SKU 不一致')
        pending.delete(key)
        failed.delete(key)
        if (result.outcome === 'saved') {
          saved.add(key)
          skipped.delete(key)
          state.message = `SKU ${identity.sku} 已命中规则并保存（新增 ${result.created}，已存在 ${result.skipped}）`
        } else {
          skipped.add(key)
          saved.delete(key)
          state.message = `SKU ${identity.sku} 已跳过：${skippedReason(result)}`
        }
        return true
      } catch (error) {
        pending.delete(key)
        failed.add(key)
        state.message = `SKU ${identity.sku} 处理失败：${error instanceof Error ? error.message : String(error)}`
        return true
      } finally {
        processing = undefined
        render()
      }
    })()
    return processing
  }
  const drainPending = async (): Promise<boolean> => {
    while (!disposed && pending.size > 0) {
      await processOnce()
    }
    return pending.size === 0
  }
  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
  const run = async (): Promise<void> => {
    const config = (await getSettings()).ozon
    let bottomRounds = 0
    while (!disposed && !stopRequested) {
      if (state.status === 'paused' || document.hidden) {
        await sleep(250)
        continue
      }
      const added = scan(config.maxItems)
      if (pending.size > 0) await processOnce()
      if (products.size >= config.maxItems) break
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8
      bottomRounds = atBottom && added === 0 ? bottomRounds + 1 : 0
      if (bottomRounds >= 3) break
      window.scrollBy({ top: Math.max(320, Math.floor(window.innerHeight * .75)), behavior: 'smooth' })
      await sleep(config.scrollDelay)
    }
    if (disposed) return
    setState(stopRequested ? 'stopping' : 'collecting', stopRequested ? '正在停止并完成最后处理…' : '已到达列表底部，正在完成剩余商品…')
    const ok = await drainPending()
    if (disposed) return
    if (!ok) setState('error', state.message)
    else setState(stopRequested ? 'stopped' : 'completed', stopRequested ? '采集已停止，待处理商品已完成' : '采集完成')
  }
  const start = (): void => {
    monitor.panel.hidden = false
    if (runner) {
      if (state.status === 'paused') setState('collecting', '已继续采集')
      return
    }
    if (analyticsPageForUrl(window.location.href).kind !== 'list') {
      setState('error', '请在 Ozon 列表或搜索页使用')
      return
    }
    if (pending.size === 0) {
      products.clear()
      saved.clear()
      skipped.clear()
      failed.clear()
    }
    stopRequested = false
    setState('collecting', pending.size > 0 ? '继续处理未完成任务并扫描可见商品…' : '采集任务已启动，正在扫描可见商品…')
    runner = run().finally(() => { runner = undefined })
  }
  monitor.pause.addEventListener('click', () => {
    if (state.status === 'paused') setState('collecting', '已继续采集')
    else if (state.status === 'collecting') setState('paused', '采集已暂停；进行中的商品处理会安全完成')
  })
  monitor.stop.addEventListener('click', () => { stopRequested = true; setState('stopping', '正在停止…') })
  monitor.retry.addEventListener('click', () => {
    if (runner || processing || pending.size === 0) return
    setState('stopping', '正在重试待处理商品…')
    runner = drainPending().then((ok) => {
      if (disposed) return
      setState(ok ? 'stopped' : 'error', ok ? '重试完成，待处理商品已完成' : state.message)
    }).finally(() => { runner = undefined })
  })
  monitor.close.addEventListener('click', () => { monitor.panel.hidden = true })
  render()
  return {
    start,
    snapshot: () => ({ ...state }),
    reconcile: () => {
      if (analyticsPageForUrl(window.location.href).kind !== 'list' && runner) {
        stopRequested = true
        setState('stopping', '页面已离开商品列表，正在停止并完成最后处理…')
      }
    },
    stop: () => { disposed = true; stopRequested = true; monitor.host.remove() },
  }
}
