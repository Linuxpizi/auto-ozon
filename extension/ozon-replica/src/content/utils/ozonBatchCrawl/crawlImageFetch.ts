import { proxyFetchDataUrl } from '../../../utils/proxyFetch'

/** 对齐旧版 fetchImageAsBase64：跨域图片转 data URL，失败返回空串 */
export async function fetchCrawlImageAsBase64(imgSrc: string): Promise<string> {
  const url = String(imgSrc || '').trim()
  if (!url) return ''

  try {
    if (/^data:image\//i.test(url)) return url
    return await proxyFetchDataUrl(url)
  } catch (e) {
    console.warn('[mjgd][crawl] 图片下载失败', url, e)
    return ''
  }
}
