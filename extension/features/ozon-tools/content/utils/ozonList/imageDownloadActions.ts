/**
 * 商品图下载 — 菜单三项入口（编排层）
 *
 * 1. 当前图片：纯前端，用点击时的主图 src 原样下载，不调接口、不显遮罩
 * 2. 当前变体（zip）：走 MAIN gallery 接口/缓存，轮播升 wc1000，轻量遮罩
 * 3. 全部图片（zip）：主商品全部变体，时间戳文件名 + {时间戳}/{sku}/ 子目录，全屏遮罩
 */
import { showToast } from '../../../utils/toast'
import {
  collectGalleryUrls,
  extensionFromOzonUrl,
  formatTimestampZipName,
  imageFileNameFromOzonUrl,
  toCarouselDownloadUrl,
} from './imageDownloadUtils'
import {
  buildImageZip,
  downloadSingleImage,
  triggerBlobDownload,
  type ZipImageEntry,
} from './imageDownloadService'
import {
  cancelImageDownloadPrefetch,
  getVariantGalleriesFromMainWorld,
  isImageDownloadCancelledError,
  onVariantLoadProgress,
  type VariantGalleriesMap,
} from './imageDownloadMainWorld'
import {
  bindImageDownloadProgressScope,
  enterDownloadingImages,
  enterPacking,
  failImageDownloadSession,
  finishImageDownloadSession,
  isActiveSession,
  isCancelled,
  registerImageDownloadCleanup,
  setImageProgress,
  setVariantProgress,
  startImageDownloadSession,
} from './imageDownloadController'

export interface ImageDownloadContext {
  scene: 'list' | 'detail'
  /** 当前变体 SKU（列表=链接 SKU；详情=页面/选中变体 SKU） */
  sku: string
  /** 主商品 SKU（列表页与 sku 相同；详情=主商品 SKU） */
  mainSku: string
  /** 「当前图片」用：点击时展示的主图 URL（原样，不升 wc） */
  currentImageUrl: string
  /** 详情 webAspects DOM 收集到的变体 SKU（列表页为空，交 MAIN 从 Page1 派生） */
  variantSkus: string[]
}

function is429(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || '')
  return /\b429\b/.test(msg) || /too many/i.test(msg)
}

/** 取消 / MAIN 侧作废：静默退出，不弹 error */
function shouldAbortZipDownload(token: number, err?: unknown): boolean {
  if (isCancelled(token)) return true
  if (err != null && isImageDownloadCancelledError(err)) return true
  return false
}

/** 绑定 scope + 进度订阅 + 取消时通知 MAIN 作废 prefetch */
function beginScopedZipDownload(token: number) {
  const progressScopeId = String(token)
  bindImageDownloadProgressScope(progressScopeId)
  const offProgress = onVariantLoadProgress(
    (p) => setVariantProgress(token, p.current, p.total),
    progressScopeId,
  )
  registerImageDownloadCleanup(() => cancelImageDownloadPrefetch(progressScopeId))
  registerImageDownloadCleanup(offProgress)
  return { progressScopeId, offProgress }
}

function releaseScopedZipDownload(token: number, offProgress: () => void): void {
  offProgress()
  if (isActiveSession(token)) bindImageDownloadProgressScope(null)
}

/** zip 内路径去重（wc1000 后 cover 与首图可能重名） */
function dedupeEntries(entries: ZipImageEntry[]): ZipImageEntry[] {
  const seen = new Set<string>()
  const out: ZipImageEntry[] = []
  for (const e of entries) {
    if (seen.has(e.path)) continue
    seen.add(e.path)
    out.push(e)
  }
  return out
}

// ── 1. 当前图片 ──────────────────────────────────────────────
export async function downloadCurrentImage(ctx: ImageDownloadContext): Promise<void> {
  const url = String(ctx.currentImageUrl || '').trim()
  if (!url) {
    showToast('未找到当前图片', 2500)
    return
  }
  const ext = extensionFromOzonUrl(url)
  const filename = `${ctx.sku || 'image'}${ext}`
  try {
    await downloadSingleImage(url, filename)
    showToast('下载成功', 2000)
  } catch (err) {
    showToast(is429(err) ? '请求过快，请稍后再试' : '下载失败', 2500)
  }
}

// ── 2. 当前变体（zip）────────────────────────────────────────
export async function downloadCurrentVariantZip(ctx: ImageDownloadContext): Promise<void> {
  const sku = String(ctx.sku || '').trim()
  if (!sku) {
    showToast('未找到商品 SKU', 2500)
    return
  }

  const token = startImageDownloadSession('variant')
  setVariantProgress(token, 0, 1)
  const { progressScopeId, offProgress } = beginScopedZipDownload(token)
  const retry = () => void downloadCurrentVariantZip(ctx)

  try {
    const galleries = await getVariantGalleriesFromMainWorld({
      mainSku: ctx.mainSku || sku,
      variantSkus: [sku],
      mode: 'variant',
      prefetchIfMissing: true,
      progressScopeId,
    })
    if (shouldAbortZipDownload(token)) return

    const gallery = galleries[sku] || Object.values(galleries)[0]
    const urls = collectGalleryUrls(gallery?.cover || '', gallery?.images || [])
    if (!urls.length) {
      failImageDownloadSession(token, '未找到该变体的图片', retry)
      return
    }

    const entries = dedupeEntries(
      urls.map((u) => {
        const dl = toCarouselDownloadUrl(u)
        return { url: dl, path: `${sku}/${imageFileNameFromOzonUrl(dl)}` }
      }),
    )
    enterDownloadingImages(token, entries.length)
    const result = await buildImageZip(entries, {
      onImageDone: (d, t) => setImageProgress(token, d, t),
      onPacking: () => enterPacking(token),
      shouldCancel: () => isCancelled(token),
    })
    if (result.cancelled || shouldAbortZipDownload(token)) return
    if (!result.blob) {
      failImageDownloadSession(token, '图片下载失败，请稍后重试', retry)
      return
    }

    triggerBlobDownload(result.blob, `${sku}.zip`)
    if (result.failed > 0) {
      showToast(`部分图片下载失败（成功 ${result.success}/${result.total}）`, 3000)
    }
    finishImageDownloadSession(token)
  } catch (err) {
    if (shouldAbortZipDownload(token, err)) return
    const msg = is429(err) ? '请求过快，请稍后再试' : (err as Error)?.message || '下载失败'
    failImageDownloadSession(token, msg, retry)
  } finally {
    releaseScopedZipDownload(token, offProgress)
  }
}

// ── 3. 全部图片（zip）───────────────────────────────────────
export async function downloadAllVariantsZip(ctx: ImageDownloadContext): Promise<void> {
  const mainSku = String(ctx.mainSku || ctx.sku || '').trim()
  if (!mainSku) {
    showToast('未找到商品 SKU', 2500)
    return
  }

  const token = startImageDownloadSession('all')
  setVariantProgress(token, 0, 0)
  const { progressScopeId, offProgress } = beginScopedZipDownload(token)
  const retry = () => void downloadAllVariantsZip(ctx)

  try {
    const galleries: VariantGalleriesMap = await getVariantGalleriesFromMainWorld({
      mainSku,
      variantSkus: ctx.variantSkus || [],
      mode: 'all',
      prefetchIfMissing: true,
      progressScopeId,
    })
    if (shouldAbortZipDownload(token)) return

    const skus = Object.keys(galleries)
    if (!skus.length) {
      failImageDownloadSession(token, '未找到商品图片', retry)
      return
    }

    const zipBaseName = formatTimestampZipName()
    const entries: ZipImageEntry[] = []
    for (const vsku of skus) {
      const g = galleries[vsku]
      const urls = collectGalleryUrls(g?.cover || '', g?.images || [])
      const perSku = dedupeEntries(
        urls.map((u) => {
          const dl = toCarouselDownloadUrl(u)
          return { url: dl, path: `${zipBaseName}/${vsku}/${imageFileNameFromOzonUrl(dl)}` }
        }),
      )
      entries.push(...perSku)
    }
    if (!entries.length) {
      failImageDownloadSession(token, '未找到商品图片', retry)
      return
    }

    enterDownloadingImages(token, entries.length)
    const result = await buildImageZip(entries, {
      onImageDone: (d, t) => setImageProgress(token, d, t),
      onPacking: () => enterPacking(token),
      shouldCancel: () => isCancelled(token),
    })
    if (result.cancelled || shouldAbortZipDownload(token)) return
    if (!result.blob) {
      failImageDownloadSession(token, '图片下载失败，请稍后重试', retry)
      return
    }

    triggerBlobDownload(result.blob, `${zipBaseName}.zip`)
    if (result.failed > 0) {
      showToast(`部分图片下载失败（成功 ${result.success}/${result.total}）`, 3000)
    }
    finishImageDownloadSession(token)
  } catch (err) {
    if (shouldAbortZipDownload(token, err)) return
    const msg = is429(err) ? '请求过快，请稍后再试' : (err as Error)?.message || '下载失败'
    failImageDownloadSession(token, msg, retry)
  } finally {
    releaseScopedZipDownload(token, offProgress)
  }
}
