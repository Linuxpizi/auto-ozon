/**
 * 商品图下载 — 抓图 / 打包 / 触发浏览器下载
 *
 * 抓图统一走 background 代理（proxyFetchBlob，绕过 CORS/CSP），
 * zip 打包用项目已依赖的 jszip。取消时立即停止并丢弃半成品（不产出 blob）。
 */
import JSZip from 'jszip'
import { proxyFetchBlob } from '../../../utils/proxyFetch'

export interface ZipImageEntry {
  /** zip 内路径（含子目录），如 `{sku}/11066111290.jpg` 或 `{时间戳}/{sku}/11066111290.jpg` */
  path: string
  /** 下载用 URL（轮播已按规则升 wc1000） */
  url: string
}

export interface BuildZipResult {
  blob: Blob | null
  total: number
  success: number
  failed: number
  cancelled: boolean
}

/** 触发浏览器下载一个 Blob，随后释放 objectURL */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 延迟释放，确保浏览器已开始读取
  setTimeout(() => URL.revokeObjectURL(href), 4000)
}

/** 单张图片下载并触发浏览器保存（「当前图片」用：原样 URL，不升 wc、无 zip） */
export async function downloadSingleImage(url: string, filename: string): Promise<void> {
  const { blob } = await proxyFetchBlob(url, { method: 'GET', headers: { Accept: 'image/*' } })
  if (!blob || blob.size === 0) throw new Error('图片内容为空')
  triggerBlobDownload(blob, filename)
}

/**
 * 逐张下载并写入 zip（串行：便于取消 + 轻微防风控）。
 * 每张完成回调 onImageDone(done,total)；shouldCancel 每步检查，取消即停并返回 cancelled=true。
 * 成功 0 张返回 blob=null（由调用方判定 error 态）。
 */
export async function buildImageZip(
  entries: ZipImageEntry[],
  opts: {
    onImageDone?: (done: number, total: number) => void
    onPacking?: () => void
    shouldCancel?: () => boolean
  } = {},
): Promise<BuildZipResult> {
  const zip = new JSZip()
  const total = entries.length
  let success = 0
  let failed = 0
  let done = 0

  for (const entry of entries) {
    if (opts.shouldCancel?.()) {
      return { blob: null, total, success, failed, cancelled: true }
    }
    try {
      const { blob } = await proxyFetchBlob(entry.url, {
        method: 'GET',
        headers: { Accept: 'image/*' },
      })
      if (blob && blob.size > 0) {
        zip.file(entry.path, blob)
        success++
      } else {
        failed++
      }
    } catch {
      failed++
    }
    done++
    opts.onImageDone?.(done, total)
  }

  if (opts.shouldCancel?.()) {
    return { blob: null, total, success, failed, cancelled: true }
  }
  if (success === 0) {
    return { blob: null, total, success, failed, cancelled: false }
  }

  opts.onPacking?.()
  const blob = await zip.generateAsync({ type: 'blob' })

  if (opts.shouldCancel?.()) {
    return { blob: null, total, success, failed, cancelled: true }
  }
  return { blob, total, success, failed, cancelled: false }
}
