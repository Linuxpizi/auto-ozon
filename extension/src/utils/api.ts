import type { ScrapedProduct } from './types'
import { getSettings } from './storage'

/** 获取后端 API 基础地址 */
async function getBaseUrl(): Promise<string> {
  const settings = await getSettings()
  return settings.apiBaseUrl.replace(/\/+$/, '')
}

/** 批量同步采集商品到后端 */
export async function syncProducts(products: ScrapedProduct[]): Promise<{ created: number; skipped: number }> {
  const baseUrl = await getBaseUrl()
  const resp = await fetch(`${baseUrl}/api/browser-sync/sync-products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ products }),
  })
  if (!resp.ok) throw new Error(`同步失败: ${resp.status} ${resp.statusText}`)
  return resp.json()
}

/** 从后端获取采集商品列表 */
export async function fetchBackendProducts(
  platform?: string,
  limit = 50,
): Promise<{ products: ScrapedProduct[]; total: number }> {
  const baseUrl = await getBaseUrl()
  const params = new URLSearchParams({ limit: String(limit) })
  if (platform) params.set('platform', platform)
  const resp = await fetch(`${baseUrl}/api/browser-sync/products?${params}`)
  if (!resp.ok) throw new Error(`获取失败: ${resp.status}`)
  const products = await resp.json()
  // 同时获取总数
  const countResp = await fetch(`${baseUrl}/api/browser-sync/products/count${platform ? `?platform=${platform}` : ''}`)
  const countData = countResp.ok ? await countResp.json() : { total: products.length }
  return { products, total: countData.total }
}

/** 从后端删除采集商品 */
export async function deleteBackendProduct(recordId: number): Promise<void> {
  const baseUrl = await getBaseUrl()
  const resp = await fetch(`${baseUrl}/api/browser-sync/products/${recordId}`, {
    method: 'DELETE',
  })
  if (!resp.ok) throw new Error(`删除失败: ${resp.status}`)
}

/** 检测后端连接状态 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const baseUrl = await getBaseUrl()
    const resp = await fetch(`${baseUrl}/api/browser-sync/products/count`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    return resp.ok
  } catch {
    return false
  }
}
