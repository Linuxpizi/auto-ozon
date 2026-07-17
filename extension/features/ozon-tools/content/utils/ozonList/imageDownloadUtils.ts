/**
 * Ozon 商品图下载 — 纯工具函数（无副作用，可单测）
 *
 * 与「传后端」采集/编辑上架的取图逻辑刻意区分：
 *   - 不给 cover_image 加 '?'（那是 AI 采集防重复用）
 *   - 不用 wc500（那是以图搜图用）
 *   - zip 内轮播统一升到 wc1000
 */

/**
 * 从 Ozon 图片 URL 取最后一段作为 zip 内文件名。
 * https://.../wc1000/11066111290.jpg → 11066111290.jpg
 * 无扩展名/异常时兜底 image_{n}.jpg 由调用方处理，这里仅取最后一段。
 */
export function imageFileNameFromOzonUrl(url: string): string {
  const clean = String(url || '').split('?')[0].split('#')[0]
  const seg = clean.split('/').filter(Boolean).pop() || ''
  return seg
}

/**
 * 轮播图下载 URL（仅 zip 内轮播使用）：将 `/wc\d+/` 段替换为 `/wc1000/`。
 * 已是 wc1000 或无 wc 段则原样返回。
 */
export function toCarouselDownloadUrl(url: string): string {
  const s = String(url || '')
  if (!/\/wc\d+\//.test(s)) return s
  return s.replace(/\/wc\d+\//, '/wc1000/')
}

/**
 * 合并 coverImage + images[]，按 URL 去重（保序）。不加 '?'。
 * @returns 去重后的 URL 数组
 */
export function collectGalleryUrls(cover: string, images: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (u: unknown) => {
    const url = String(u || '').trim()
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push(url)
  }
  push(cover)
  ;(images || []).forEach(push)
  return out
}

/** 从 URL 取扩展名（含点），如 `.jpg` / `.webp`；取不到兜底 `.jpg`。 */
export function extensionFromOzonUrl(url: string): string {
  const name = imageFileNameFromOzonUrl(url)
  const i = name.lastIndexOf('.')
  if (i !== -1 && i < name.length - 1) return name.substring(i)
  const m = String(url || '').match(/\.(jpg|jpeg|png|gif|webp|bmp)(?:[?#]|$)/i)
  if (m) return `.${m[1].toLowerCase()}`
  return '.jpg'
}

/** 最外层「全部图片」zip 文件名：YYYYMMDDHHmmss（本地时间）。 */
export function formatTimestampZipName(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}
