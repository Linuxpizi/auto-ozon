import { getFirstStoreLink } from './storeCollectUrl'
import type { AiAutoSelectConfig } from './types'
import { UNLIMITED_CATEGORY } from './types'

const OFFER_SEARCH_BASE = 'https://s.1688.com/selloffer/offer_search.htm'
const OFFER_SEARCH_SPM = 'a260k.home2025.category.dL2.66333597fQz6vx'

/** 1688 主站首页，不限类目选品落地页 */
export const WWW_1688_HOME_URL = 'https://www.1688.com/'

/** 当前是否在任意 1688 域名下 */
export function is1688Host(): boolean {
  try {
    const { hostname } = window.location
    return hostname === '1688.com' || hostname.endsWith('.1688.com')
  } catch {
    return false
  }
}

/** 当前是否在 1688 主站（不限类目时直接开始选品） */
export function is1688WwwHost(): boolean {
  return window.location.host === 'www.1688.com'
}

/** 根据选品配置解析落地页 URL：店铺列表 > 类目搜索 > 主站首页 */
export function resolveAutoSelectLandingUrl(config: AiAutoSelectConfig): string | null {
  if (config.storeCollectEnabled && config.storeLinks.length > 0) {
    return getFirstStoreLink(config)
  }
  if (config.category !== UNLIMITED_CATEGORY) {
    return build1688CategorySearchUrl(config.category)
  }
  return WWW_1688_HOME_URL
}

/** 根据类目名生成 1688 商品搜索列表页 URL（默认从第一页开始） */
export function build1688CategorySearchUrl(category: string): string {
  return build1688CategorySearchUrlFromPageOne(category)
}

/** 生成带 beginPage=1 的类目搜索 URL，同类目再次选品时从第一页爬取 */
export function build1688CategorySearchUrlFromPageOne(category: string): string {
  const params = new URLSearchParams({
    spm: OFFER_SEARCH_SPM,
    charset: 'utf8',
    keywords: category,
    beginPage: '1',
  })
  return `${OFFER_SEARCH_BASE}?${params.toString()}`
}

/** 当前 URL 是否已在指定类目搜索第一页 */
export function isCategorySearchOnPageOne(category: string): boolean {
  if (!isCurrentCategorySearchPage(category)) return false
  try {
    const beginPage = new URL(window.location.href).searchParams.get('beginPage')
    return beginPage === '1'
  } catch {
    return false
  }
}

/** 基于当前类目搜索 URL 追加 beginPage=1，用于同页重选时回到第一页 */
export function buildCategorySearchUrlWithPageOneFromCurrent(_category: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('beginPage', '1')
  return url.toString()
}

/** 是否为类目搜索列表页（用于跨页恢复选品弹窗） */
export function is1688CategorySearchPage(): boolean {
  try {
    const url = new URL(window.location.href)
    return url.hostname === 's.1688.com' && url.pathname.includes('offer_search')
  } catch {
    return false
  }
}

/** 当前页是否为指定类目的 1688 搜索列表页 */
export function isCurrentCategorySearchPage(category: string): boolean {
  if (!category || category === UNLIMITED_CATEGORY) return false
  if (!is1688CategorySearchPage()) return false
  try {
    const keywords = new URL(window.location.href).searchParams.get('keywords')
    if (!keywords) return false
    return decodeURIComponent(keywords) === category
  } catch {
    return false
  }
}

/** 开始采集前是否需跳转到类目搜索页 */
export function needsCategoryNavigation(config: AiAutoSelectConfig): boolean {
  if (config.category === UNLIMITED_CATEGORY) return false
  return !isCurrentCategorySearchPage(config.category)
}
