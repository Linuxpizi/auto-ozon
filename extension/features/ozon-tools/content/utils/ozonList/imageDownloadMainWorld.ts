/**
 * 商品图下载 — MAIN 世界桥接（对齐 quickShelveMainWorld.ts）
 *
 * ISOLATED 侧 dispatch `quick-shelve-req`，MAIN 世界 ozon-main.js 的
 * `getVariantGalleries` action 读 `_productResponses` 的 webGallery 并回传。
 * 阶段1（加载变体）进度沿用 MAIN 的 `quick-shelve-progress` 事件，并带 imgDlScope
 * 以便取消/新会话时不串台。取消时 dispatch `cancelImageDownload` 作废对应 scope。
 */

export interface VariantGallery {
  cover: string
  images: string[]
}

export type VariantGalleriesMap = Record<string, VariantGallery>

export const IMG_DL_CANCELLED = 'IMG_DL_CANCELLED'

function dispatchMainWorld<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const timeout = window.setTimeout(() => {
      document.removeEventListener('quick-shelve-res', onRes as EventListener)
      reject(new Error('MAIN 世界响应超时'))
    }, 120000)

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

/** 通知 MAIN 世界作废指定 scope 的 prefetch（fire-and-forget） */
export function cancelImageDownloadPrefetch(progressScopeId: string): void {
  const scope = String(progressScopeId || '').trim()
  if (!scope) return
  document.dispatchEvent(
    new CustomEvent('quick-shelve-req', {
      detail: {
        requestId: `img_cancel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action: 'cancelImageDownload',
        progressScopeId: scope,
      },
    }),
  )
}

/**
 * 采集变体图库（仅 gallery）。
 * @param mode 'variant' 仅当前变体单 SKU；'all' 主商品全部变体
 */
export async function getVariantGalleriesFromMainWorld(options: {
  mainSku: string
  variantSkus?: string[]
  mode: 'variant' | 'all'
  prefetchIfMissing?: boolean
  /** 与 session token 一致，用于进度隔离与取消 */
  progressScopeId?: string
}): Promise<VariantGalleriesMap> {
  const res = await dispatchMainWorld<{ galleries?: VariantGalleriesMap }>('getVariantGalleries', {
    mainSku: options.mainSku || '',
    variantSkus: options.variantSkus || [],
    mode: options.mode,
    prefetchIfMissing: options.prefetchIfMissing !== false,
    progressScopeId: options.progressScopeId || '',
  })
  return res.galleries || {}
}

export function isImageDownloadCancelledError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || '')
  return msg.includes(IMG_DL_CANCELLED)
}

/**
 * 订阅 MAIN 世界 `quick-shelve-progress`（阶段1 变体加载进度）。
 * @param scopeId 仅接收 imgDlScope 匹配的事件（忽略急速上架等其它来源）
 */
export function onVariantLoadProgress(
  handler: (info: { current: number; total: number; pending: number }) => void,
  scopeId?: string,
): () => void {
  const expectedScope = scopeId != null ? String(scopeId) : ''
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail
    if (!detail) return
    const eventScope = detail.imgDlScope != null ? String(detail.imgDlScope) : ''
    if (expectedScope) {
      if (!eventScope || eventScope !== expectedScope) return
    }
    handler({
      current: Number(detail.current) || 0,
      total: Number(detail.total) || 0,
      pending: Number(detail.pending) || 0,
    })
  }
  document.addEventListener('quick-shelve-progress', listener as EventListener)
  return () => document.removeEventListener('quick-shelve-progress', listener as EventListener)
}
