import type { QuickShelveSkuRow } from './types'

type MainWorldSkuRow = {
  sku: string
  title: string
  image: string
  price: string
  originalPrice: string
  blackPrice?: string
  sales?: string
  createdAt?: string
  pricePairSource?: 'api' | 'aspect' | 'dom'
}

function dispatchMainWorld<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = `qs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const timeout = window.setTimeout(() => {
      document.removeEventListener('quick-shelve-res', onRes as EventListener)
      reject(new Error('MAIN 世界响应超时'))
    }, 60000)

    function onRes(event: Event) {
      const detail = (event as CustomEvent).detail
      if (!detail || detail.requestId !== requestId) return
      window.clearTimeout(timeout)
      document.removeEventListener('quick-shelve-res', onRes as EventListener)
      if (detail.success) {
        resolve(detail as T)
      } else {
        reject(new Error(detail.error || 'MAIN 世界执行失败'))
      }
    }

    document.addEventListener('quick-shelve-res', onRes as EventListener)
    document.dispatchEvent(
      new CustomEvent('quick-shelve-req', {
        detail: { requestId, action, ...payload },
      }),
    )
  })
}

function mapRows(rows: MainWorldSkuRow[]): QuickShelveSkuRow[] {
  return (rows || []).map((r) => ({
    sku: r.sku,
    title: r.title || r.sku,
    image: r.image || '',
    price: r.price || '',
    originalPrice: r.originalPrice || '',
    blackPrice: r.blackPrice || '',
    salePrice: '',
    goodsNo: '',
    sales: r.sales || '',
    createdAt: r.createdAt || '',
    pricePairSource: r.pricePairSource,
  }))
}

export interface QuickShelveSkuRowsResult {
  rows: QuickShelveSkuRow[]
  /** 命中验证码/整页受限，已停止加载 */
  blocked: boolean
  /** 因 429 重试超限被放弃的变体数 */
  dropped: number
  /** 变体总数（用于"已加载 X/Y"提示） */
  total: number
}

/** 详情页或指定 SKU：经 MAIN 世界预拉取变体 */
export async function loadQuickShelveSkuRowsFromMainWorld(options: {
  targetSku?: string
  prefetchPageSku?: boolean
  reset?: boolean
}): Promise<QuickShelveSkuRowsResult> {
  const res = await dispatchMainWorld<{
    rows: MainWorldSkuRow[]
    qsBlocked?: boolean
    qsDropped?: number
    qsTotal?: number
  }>('loadSkuRows', {
    targetSku: options.targetSku || '',
    prefetchPageSku: !!options.prefetchPageSku,
    reset: options.reset !== false,
    skipVariants: false,
  })
  return {
    rows: mapRows(res.rows),
    blocked: !!res.qsBlocked,
    dropped: Number(res.qsDropped) || 0,
    total: Number(res.qsTotal) || 0,
  }
}

export async function fetchSkuDetailFromMainWorld(sku: string) {
  const res = await dispatchMainWorld<{ data: Record<string, unknown> }>('fetchSkuDetail', { sku })
  return res.data
}

/** 直上模式：解析单个 SKU 的颜色样本图（详情页每变体独立；列表页可传 listDetail.color_image） */
export async function resolveColorImageFromMainWorld(
  sku: string,
  listDetail?: Record<string, unknown> | null,
): Promise<string> {
  const res = await dispatchMainWorld<{ colorImage: string }>('resolveColorImage', {
    sku,
    listDetail: listDetail || null,
  })
  return String(res.colorImage || '')
}

/** 详情页：按 SKU 解析 description/hashtags/richAnnotationJson/video（对齐旧版 resolveDetailSkuCommon） */
export async function resolveDetailSkuCommonFromMainWorld(sku: string, mainSkuId: string) {
  const res = await dispatchMainWorld<{ data: Record<string, unknown> }>('resolveDetailSkuCommon', {
    sku,
    mainSkuId,
  })
  return res.data
}

/**
 * 编辑模式 V2 / 编辑上架：MAIN 世界 buildEditUploadDataBySku。
 * @param skipVariants 默认 true（急速上架编辑模式仅当前 SKU）；编辑上架「全部变体」传 false。
 */
export async function buildEditUploadDataFromMainWorld(
  sku: string,
  prefetch = false,
  skipVariants = true,
  forceReset = false,
): Promise<Record<string, unknown>> {
  const res = await dispatchMainWorld<{ data: Record<string, unknown> }>('buildEditUploadData', {
    sku,
    prefetch,
    skipVariants,
    forceReset,
    progress: true,
  })
  return res.data
}

/** 对缺图变体行并行补拉 Ozon 图库（编辑上架提交前二次兜底） */
export async function fetchGalleryForRowsFromMainWorld(
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  await dispatchMainWorld<{ success: boolean }>('fetchGalleryForRows', { rows })
}

/** 对缺标题或误带当前页标题的变体行，按 SKU 补拉 webProductHeading */
export async function fetchTitlesForRowsFromMainWorld(
  rows: Array<Record<string, unknown>>,
  pageSku: string,
): Promise<void> {
  await dispatchMainWorld<{ success: boolean }>('fetchTitlesForRows', { rows, pageSku })
}

/** 监听 MAIN 世界 `quick-shelve-progress` 事件（对齐旧版 bcsUpdateSkuVariantProgressUI） */
let progressHandler:
  | ((info: { current: number; total: number; pending: number }) => void)
  | null = null

export function setQuickShelveProgressHandler(h: typeof progressHandler) {
  progressHandler = h
}

if (typeof document !== 'undefined') {
  document.addEventListener('quick-shelve-progress', (e: Event) => {
    const detail = (e as CustomEvent).detail
    if (!detail || !progressHandler) return
    const current = Number(detail.current) || 0
    const total = Number(detail.total) || 0
    const pending = Number(detail.pending) || 0
    progressHandler({ current, total, pending })
  })
}
