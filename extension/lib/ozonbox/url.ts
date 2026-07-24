function isOzonHost(hostname: string): boolean {
  return hostname === 'ozon.ru' || hostname.endsWith('.ozon.ru')
}

export function isOzonUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && isOzonHost(url.hostname)
  } catch {
    return false
  }
}

export function extractOzonProductId(value: string, baseUrl?: string): string | undefined {
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value)
    if (url.protocol !== 'https:' || !isOzonHost(url.hostname)) return undefined
    // Match /product/...name-SKU/ pattern; extract the trailing numeric segment as SKU
    const pathPart = url.pathname.match(/\/product\/([^/?#]+)/i)
    if (!pathPart) return undefined
    // Find all digit groups, the SKU is typically the last/largest one
    const digits = pathPart[1].match(/\d+/g)
    return digits?.pop()
  } catch {
    return undefined
  }
}


export function isOzonProductUrl(value: string): boolean {
  return extractOzonProductId(value) !== undefined
}

export function isOzonListPage(value: string): boolean {
  try {
    const url = new URL(value)
    if (!isOzonHost(url.hostname)) return false
    const pathname = url.pathname
    const listPrefixes = ['/category', '/highlight', '/seller', '/search', '/brand', '/publisher']
    return pathname === '/' || pathname === '' || listPrefixes.some((prefix) => pathname.startsWith(prefix))
  } catch {
    return false
  }
}
