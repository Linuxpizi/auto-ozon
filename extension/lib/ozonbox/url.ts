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
    const match = url.pathname.match(/^\/product\/[^/?#]*-([1-9]\d*)\/?$/i)
    return match?.[1]
  } catch {
    return undefined
  }
}

export function isOzonProductUrl(value: string): boolean {
  return extractOzonProductId(value) !== undefined
}