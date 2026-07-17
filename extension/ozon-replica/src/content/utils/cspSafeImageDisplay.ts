/**
 * 仅 Ozon 宿主页 img-src CSP 会拦截 OSS 等外链；其他平台可直接 <img src>，无需转 blob:。
 */
import { ref } from 'vue'
import { proxyFetchBlob } from '../../utils/proxyFetch'

const blobUrlCache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()
// 取图失败 URL 不再重试，避免 computed 反复触发 fetch 形成无限循环
const failedUrlCache = new Set<string>()
const displayMap = ref<Record<string, string>>({})
const loadingMap = ref<Record<string, boolean>>({})

/** 当前是否在 Ozon 站点（仅此类页面需要 CSP 安全展示） */
export function isOzonCspRestrictedSite(hostname = window.location.hostname): boolean {
  const h = String(hostname || '').toLowerCase()
  if (h === 'seller.ozon.ru') return true
  return /(^|\.)ozon\.(ru|com|by|kz|tm|uz)$/i.test(h)
    || /(^|\.)ozonru\.(me|cn)$/i.test(h)
    || /(^|\.)ozoncom\.me$/i.test(h)
}

/** Ozon 页 img-src 白名单后缀（与页面 CSP 保持一致，用于判断能否直接 <img src>） */
const OZON_CSP_IMAGE_HOST_SUFFIXES = [
  'ozone.ru',
  'ozonstatic.cn',
  'ozonusercontent.com',
  'ozon.ru',
  'ozon.com',
  'ozon.by',
  'ozon.kz',
  'ozon.tm',
  'ozon.uz',
  'ozonru.me',
  'ozoncom.me',
  'ozonru.cn',
  'static.kion.ru',
  'maps.yandex.net',
  'api-maps.yandex.ru',
  'tns-counter.ru',
  'adriver.ru',
  'weborama-tech.ru',
  'serving-sys.ru',
  'youtube.com',
  'ytimg.com',
  'googletagmanager.com',
  'targetads.io',
]

/** 当前 URL 是否可直接作为 img src 加载（不被 Ozon CSP 拦截） */
export function isOzonPageCspAllowedImageUrl(url: string): boolean {
  const trimmed = (url || '').trim()
  if (!trimmed) return true
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return true
  try {
    const parsed = new URL(trimmed, window.location.origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
    if (parsed.origin === window.location.origin) return true
    const host = parsed.hostname.toLowerCase()
    return OZON_CSP_IMAGE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith('.' + suffix))
  } catch {
    return true
  }
}

/** 是否需经代理转 blob 后再展示（非 Ozon 站点始终为 false） */
export function needsCspSafeDisplayUrl(url: string): boolean {
  if (!isOzonCspRestrictedSite()) return false
  return !!url && !isOzonPageCspAllowedImageUrl(url)
}

async function fetchCspSafeBlobUrl(url: string): Promise<string> {
  if (!needsCspSafeDisplayUrl(url)) return url
  const cached = blobUrlCache.get(url)
  if (cached) return cached
  let pending = inflight.get(url)
  if (!pending) {
    pending = (async () => {
      try {
        const { blob } = await proxyFetchBlob(url, { method: 'GET', headers: { Accept: 'image/*' } })
        if (!blob || blob.size === 0) throw new Error('图片内容为空')
        const blobUrl = URL.createObjectURL(blob)
        blobUrlCache.set(url, blobUrl)
        return blobUrl
      } catch (err) {
        failedUrlCache.add(url)
        throw err
      } finally {
        inflight.delete(url)
      }
    })()
    inflight.set(url, pending)
  }
  return pending
}

function setLoading(raw: string, loading: boolean): void {
  if (loading) {
    if (loadingMap.value[raw]) return
    loadingMap.value = { ...loadingMap.value, [raw]: true }
    return
  }
  if (!loadingMap.value[raw]) return
  const next = { ...loadingMap.value }
  delete next[raw]
  loadingMap.value = next
}

/** Vue 模板用：blocked URL 异步换 blob，加载前返回空串避免 CSP 报错 */
export function useCspSafeImageDisplayMap() {
  function isCspDisplayUrlFailed(url: string): boolean {
    const raw = (url || '').trim()
    if (!raw || !needsCspSafeDisplayUrl(raw)) return false
    return failedUrlCache.has(raw)
  }
  function isCspDisplayUrlLoading(url: string): boolean {
    const raw = (url || '').trim()
    if (!raw || !needsCspSafeDisplayUrl(raw)) return false
    if (displayMap.value[raw]) return false
    if (failedUrlCache.has(raw)) return false
    return !!loadingMap.value[raw] || inflight.has(raw)
  }

  function cspDisplayUrl(url: string): string {
    const raw = (url || '').trim()
    if (!raw) return ''
    if (!needsCspSafeDisplayUrl(raw)) return raw
    const resolved = displayMap.value[raw]
    if (resolved) return resolved
    const cachedBlob = blobUrlCache.get(raw)
    if (cachedBlob) {
      displayMap.value = { ...displayMap.value, [raw]: cachedBlob }
      return cachedBlob
    }
    // 已失败 URL 不再发起 fetch，避免 computed 重算导致无限循环
    if (failedUrlCache.has(raw)) return ''
    if (!inflight.has(raw)) {
      setLoading(raw, true)
      void fetchCspSafeBlobUrl(raw).then((safe) => {
        if (displayMap.value[raw] !== safe) {
          displayMap.value = { ...displayMap.value, [raw]: safe }
        }
      }).catch(() => {}).finally(() => {
        setLoading(raw, false)
      })
    }
    return ''
  }
  return { cspDisplayUrl, isCspDisplayUrlLoading, isCspDisplayUrlFailed, displayMap, loadingMap }
}
