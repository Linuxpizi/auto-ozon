import type { AuthSession, AuthUser, ScrapedProduct } from './types'
import { assertCompleteProduct } from './product-data'
import { clearAuthSession, getAuthSession, getSettings, saveAuthSession } from './storage'

/** 获取后端 API 基础地址 */
async function getBaseUrl(): Promise<string> {
  const settings = await getSettings()
  return settings.apiBaseUrl.replace(/\/+$/, '').replace(/\/api$/, '')
}

async function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const baseUrl = await getBaseUrl()
  const headers = new Headers(options.headers)
  if (authenticated) {
    const session = await getAuthSession()
    if (!session?.access_token) throw new Error('请先登录插件')
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  const resp = await fetch(`${baseUrl}/api${path}`, { ...options, headers })
  if (resp.status === 401 && authenticated) {
    await clearAuthSession()
    throw new Error('登录已失效，请重新登录插件')
  }
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null) as { detail?: string } | null
    throw new Error(detail?.detail || `请求失败: ${resp.status}`)
  }
  return resp.status === 204 ? undefined as T : await resp.json() as T
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await request<AuthSession>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }, false)
  await saveAuthSession(session)
  return session
}

export async function register(email: string, password: string, name?: string): Promise<AuthSession> {
  const session = await request<AuthSession>('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  }, false)
  await saveAuthSession(session)
  return session
}

export async function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me')
}

/** 批量同步采集商品到后端 */
export async function syncProducts(products: ScrapedProduct[]): Promise<{ created: number; skipped: number }> {
  const completeProducts = products.map(assertCompleteProduct)
  return request<{ created: number; skipped: number }>('/browser-sync/sync-products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ products: completeProducts }),
  })
}

/** 从后端获取采集商品列表 */
export async function fetchBackendProducts(
  platform?: string,
  limit = 50,
): Promise<{ products: ScrapedProduct[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (platform) params.set('platform', platform)
  const products = await request<ScrapedProduct[]>(`/browser-sync/products?${params}`)
  // 同时获取总数
  const countData = await request<{ total: number }>(`/browser-sync/products/count${platform ? `?platform=${encodeURIComponent(platform)}` : ''}`)
  return { products, total: countData.total }
}

/** 从后端删除采集商品 */
export async function deleteBackendProduct(recordId: number): Promise<void> {
  await request<void>(`/browser-sync/products/${recordId}`, {
    method: 'DELETE',
  })
}

/** 检测后端连接状态 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const baseUrl = await getBaseUrl()
    const resp = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    return resp.ok
  } catch {
    return false
  }
}
