import type { CrawlLogEntry, CrawlLogLevel, CrawlProductRecord, CrawlStateSnapshot, CrawlStatus } from './types'

const MAX_LOGS = 28

let visible = false
let status: CrawlStatus = 'idle'
let products: CrawlProductRecord[] = []
const skuIndex = new Map<string, number>()
/** 清空/关闭后需跳过的 SKU（对齐旧版 _skipSkus） */
const skipSkus = new Set<string>()
const logs: CrawlLogEntry[] = []
let exportProgress = 0
let exportTotal = 0
let isExporting = false
let isCookieChecking = false
/** 关闭弹窗/清理数据时递增，使进行中的导出失效 */
let operationSessionId = 0

/** 对齐旧版 _exportCache：字段 + 数据量不变时可跳过 enrich 直接导出 */
export interface CrawlExportCache {
  key: string
  data: string[][]
  exportImageColIndex: number
  rowSkus: string[]
  matchPayloadBySku: Record<string, unknown>
}

let exportCache: CrawlExportCache | null = null

const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

function formatTime(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function subscribeCrawlState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCrawlSnapshot(): CrawlStateSnapshot {
  return {
    visible,
    status,
    count: products.length,
    logs: [...logs],
    exportProgress,
    exportTotal,
    isExporting,
    isCookieChecking,
  }
}

export function getCrawlProducts(): CrawlProductRecord[] {
  return products
}

export function isCrawlCollecting(): boolean {
  return status === 'collecting'
}

export function isCrawlOverlayVisible(): boolean {
  return visible
}

export function setCrawlVisible(value: boolean) {
  visible = value
  notify()
}

export function setCrawlStatus(next: CrawlStatus) {
  status = next
  notify()
}

export function getCrawlStatus(): CrawlStatus {
  return status
}

export function addCrawlLog(message: string, level: CrawlLogLevel = 'info') {
  const entry: CrawlLogEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    time: formatTime(),
    level,
    message,
  }
  logs.push(entry)
  if (logs.length > MAX_LOGS) logs.shift()
  notify()
}

/** 按 SKU 去重写入；已存在时补全空价格 */
export function upsertCrawlProduct(record: CrawlProductRecord): boolean {
  if (skipSkus.has(record.sku)) return false

  const idx = skuIndex.get(record.sku)
  if (idx != null) {
    const existing = products[idx]
    if (!existing.price && record.price) existing.price = record.price
    if (!existing.originalPrice && record.originalPrice) existing.originalPrice = record.originalPrice
    return false
  }

  skuIndex.set(record.sku, products.length)
  products.push({ ...record, imageBase64: record.imageBase64 ?? '' })
  notify()
  return true
}

/** 异步图片下载完成后回填 base64（对齐旧版 newData[2]） */
export function updateCrawlProductImageBase64(sku: string, base64: string) {
  const idx = skuIndex.get(sku)
  if (idx == null) return
  products[idx].imageBase64 = base64
}

export function getCrawlExportCache(): CrawlExportCache | null {
  return exportCache
}

export function setCrawlExportCache(cache: CrawlExportCache) {
  exportCache = cache
}

export function clearCrawlExportCache() {
  exportCache = null
}

export function getOperationSessionId(): number {
  return operationSessionId
}

export function isOperationSessionActive(sessionId: number): boolean {
  return sessionId === operationSessionId
}

/** 使进行中的导出/异步任务失效（关闭弹窗、清理数据时调用） */
export function invalidateOperationSession(): void {
  operationSessionId += 1
}

/** 清理数据：SKU 记入 skipSkus，保留滚动断点（对齐旧版 #bcs-crawl-clear-btn） */
export function clearCrawlProducts(markSkip = true) {
  invalidateOperationSession()
  if (markSkip) {
    products.forEach((p) => skipSkus.add(p.sku))
  }
  products = []
  skuIndex.clear()
  exportProgress = 0
  exportTotal = 0
  isExporting = false
  isCookieChecking = false
  clearCrawlExportCache()
  notify()
}

/**
 * 确认关闭弹窗（对齐旧版 #bcs-crawl-confirm-ok）：
 * - 已采 SKU 写入 skipSkus，防止 DOM 残留商品被重复采集
 * - 保留 skipSkus 与 crawlRunner 内 savedScrollTop / prevMaxScrollHeight
 * - 清空 products、日志、导出进度；不重置 skipSkus
 */
export function closeCrawlOverlaySession() {
  invalidateOperationSession()
  products.forEach((p) => skipSkus.add(p.sku))
  products = []
  skuIndex.clear()
  clearCrawlExportCache()
  logs.length = 0
  exportProgress = 0
  exportTotal = 0
  isExporting = false
  isCookieChecking = false
  status = 'idle'
  visible = false
  notify()
}

export function setExportProgress(done: number, total: number) {
  exportProgress = done
  exportTotal = total
  notify()
}

export function setExporting(value: boolean) {
  isExporting = value
  notify()
}

export function setCookieChecking(value: boolean) {
  isCookieChecking = value
  notify()
}
