import type { AiAutoSelectConfig } from './types'

const NON_SHOP_1688_HOSTS = new Set(['www.1688.com', 's.1688.com', 'detail.1688.com'])

/** 解析店铺商品列表链接，支持中英文分号分隔 */
export function parseStoreLinks(input: string): string[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  return trimmed
    .split(/[;；]+/)
    .map((link) => link.trim())
    .filter(Boolean)
}

/** 是否为 1688 店铺子域（shop*.1688.com），排除 www/s/detail */
export function is1688ShopListHost(hostname: string): boolean {
  if (!hostname.endsWith('.1688.com')) return false
  if (NON_SHOP_1688_HOSTS.has(hostname)) return false
  return /^shop[a-z0-9]+\.1688\.com$/i.test(hostname)
}

/** 取店铺列表页 origin，忽略 query/hash 差异 */
export function getShopListOrigin(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!is1688ShopListHost(parsed.hostname)) return null
    if (!parsed.pathname.toLowerCase().includes('offerlist')) return null
    return parsed.origin
  } catch {
    return null
  }
}

/** 当前页是否为任一目标店铺（按 origin 匹配） */
export function isCurrentStoreCollectPage(links: string[]): boolean {
  return isOnAnyConfiguredStorePage(links)
}

/** 当前页是否落在配置的任一店铺 origin 上 */
export function isOnAnyConfiguredStorePage(links: string[]): boolean {
  if (!links.length) return false
  const currentOrigin = getShopListOrigin(window.location.href)
  if (!currentOrigin) return false
  return links.some((link) => getShopListOrigin(link) === currentOrigin)
}

/** 开始采集前是否需跳转到店铺商品列表页 */
export function needsStoreNavigation(config: AiAutoSelectConfig): boolean {
  if (!config.storeCollectEnabled || !config.storeLinks.length) return false
  return !isOnAnyConfiguredStorePage(config.storeLinks)
}

/** 取首个待跳转的店铺链接 */
export function getFirstStoreLink(config: AiAutoSelectConfig): string | null {
  if (!config.storeCollectEnabled || !config.storeLinks.length) return null
  return config.storeLinks[0] ?? null
}

/** 当前店之后的店铺链接，供多店顺序续采 */
export function getRemainingStoreLinks(config: AiAutoSelectConfig, currentHref: string): string[] {
  if (!config.storeCollectEnabled || !config.storeLinks.length) return []
  const currentOrigin = getShopListOrigin(currentHref)
  if (!currentOrigin) return config.storeLinks.slice(1)
  const idx = config.storeLinks.findIndex((link) => getShopListOrigin(link) === currentOrigin)
  if (idx < 0) return config.storeLinks
  return config.storeLinks.slice(idx + 1)
}
