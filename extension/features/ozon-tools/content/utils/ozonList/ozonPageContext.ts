/** Ozon 零售站页面类型，用于功能栏按钮显隐 */

export type OzonPageType = 'list' | 'search' | 'detail' | 'other'

/** 是否为 Ozon 零售站（非 seller.ozon.ru） */
export function isOzonRetailSite(hostname = window.location.hostname): boolean {
  const h = String(hostname || '').toLowerCase()
  if (h === 'seller.ozon.ru') return false
  return /(^|\.)ozon\.ru$/i.test(h) || /(^|\.)ozon\.kz$/i.test(h)
}

/** 是否为 Ozon 商品详情页路径 */
export function isOzonProductPath(pathname = window.location.pathname): boolean {
  return String(pathname || '').includes('/product/')
}

/** 是否为搜索页（URL 含搜索关键词或 /search/ 路径） */
export function isOzonSearchPage(
  pathname = window.location.pathname,
  search = window.location.search,
): boolean {
  if (pathname.includes('/search')) return true
  const params = new URLSearchParams(search)
  return params.has('text') || params.has('query') || params.has('search')
}

/** 解析当前 Ozon 页面类型 */
export function resolveOzonPageType(loc: Location = window.location): OzonPageType {
  if (!isOzonRetailSite(loc.hostname)) return 'other'
  if (isOzonProductPath(loc.pathname)) return 'detail'
  if (isOzonSearchPage(loc.pathname, loc.search)) return 'search'
  return 'list'
}

/** 列表/搜索页视为同一组（爬取类按钮仅在这些页显示） */
export function isOzonListLikePage(pageType: OzonPageType): boolean {
  return pageType === 'list' || pageType === 'search'
}

/** 以图搜图结果页（仅此类页面展示 MP 汇总表格） */
export function isOzonSearchByImagePage(href = window.location.href): boolean {
  if (href.includes('seller.ozon.ru')) return false
  return href.includes('/search-by-image')
}
