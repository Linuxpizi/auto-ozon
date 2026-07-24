import type { AuthSession, AuthUser, ScrapedProduct } from './types'
import type {
  OzonboxCategoryResult,
  OzonboxEnvelope,
  OzonboxPackageShopFacts,
  OzonboxProductRecord,
  OzonboxProductRecordSaved,
  OzonboxStore,
} from '@/lib/ozonbox/contract'
import { assertOzonboxEnvelope, assertOzonboxProductRecord } from '@/lib/ozonbox/contract'
import type {
  PanelListingDraftInput,
  PanelListingDraftResult,
  PanelListingSubmitResult,
  PanelPricingInput,
  PanelPricingResult,
  PanelSelectionRule,
  PanelSelectionRuleInput,
} from '@/lib/ozonbox/panel-tools-contract'
import { assertCompleteProduct } from './product-data'
import { rubToCnyFromExchangeRates } from '@/lib/ozonbox/exchange-rate'
import { clearAuthSession, getAuthSession, getSettings, saveAuthSession } from './storage'

/** 获取后端 API 基础地址 */
async function getBaseUrl(): Promise<string> {
  const settings = await getSettings()
  return settings.apiBaseUrl.replace(/\/+$/, '').replace(/\/api$/, '')
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '[::1]'
}

function requireLoopbackApiBaseUrl(baseUrl: string): void {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('Cookie 绑定仅允许使用有效的本机 API 地址')
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isLoopbackHostname(url.hostname)) {
    throw new Error('为保护 Cookie 安全，绑定接口仅允许使用 localhost、127.0.0.1 或 ::1')
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true,
  sensitiveLoopbackOnly = false,
): Promise<T> {
  const baseUrl = await getBaseUrl()
  if (sensitiveLoopbackOnly) requireLoopbackApiBaseUrl(baseUrl)
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

export interface OzonSellerCookieBindInput {
  clientId: string
  ozonCookie: string
  ssoCookie: string
}

export async function bindOzonSellerCookies(input: OzonSellerCookieBindInput): Promise<unknown> {
  return request('/browser-sync/ozon-cookies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: input.clientId,
      ozon_cookie: input.ozonCookie,
      sso_cookie: input.ssoCookie,
      source: 'browser-extension',
    }),
  }, true, true)
}

async function ozonboxRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = assertOzonboxEnvelope<T>(await request<unknown>(path, options))
  if (response.code !== 200) throw new Error(response.message || '服务请求失败')
  return response.data
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

export async function listOzonboxStores(): Promise<OzonboxStore[]> {
  return ozonboxRequest<OzonboxStore[]>('/store/list')
}

export async function queryOzonboxLocalCategory(
  storeId: number,
  productId: number,
): Promise<OzonboxCategoryResult> {
  return ozonboxRequest<OzonboxCategoryResult>(`/online-product/info?storeId=${storeId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: [productId] }),
  })
}

export async function queryOzonboxLiveCategory(
  clientId: string,
  productId: number,
): Promise<OzonboxCategoryResult> {
  return ozonboxRequest<OzonboxCategoryResult>(`/ozon/products/info?clientId=${encodeURIComponent(clientId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId }),
  })
}

export async function queryOzonboxPackageFacts(sku: string): Promise<OzonboxPackageShopFacts[]> {
  return ozonboxRequest<OzonboxPackageShopFacts[]>('/system/sku/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku }),
  })
}

export async function saveOzonboxProductRecord(
  record: OzonboxProductRecord,
): Promise<OzonboxProductRecordSaved> {
  const completeRecord = assertOzonboxProductRecord(record)
  return ozonboxRequest<OzonboxProductRecordSaved>('/product-record/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(completeRecord),
  })
}

export async function runPanelPricing(input: PanelPricingInput): Promise<PanelPricingResult> {
  return request<PanelPricingResult>('/panel-tools/pricing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function listPanelSelectionRules(): Promise<PanelSelectionRule[]> {
  return request<PanelSelectionRule[]>('/panel-tools/selection-rules')
}

export interface OzonboxExchangeRatesResponse {
  rates: Record<string, unknown>
  [key: string]: unknown
}

export async function getExchangeRates(): Promise<OzonboxExchangeRatesResponse> {
  return request<OzonboxExchangeRatesResponse>('/v1/exchange-rates')
}

export async function getRubToCnyExchangeRate(): Promise<number | undefined> {
  const response = await getExchangeRates()
  return rubToCnyFromExchangeRates(response.rates)
}

export async function createPanelSelectionRule(input: PanelSelectionRuleInput): Promise<PanelSelectionRule> {
  return request<PanelSelectionRule>('/panel-tools/selection-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function updatePanelSelectionRule(id: number, input: PanelSelectionRuleInput): Promise<PanelSelectionRule> {
  return request<PanelSelectionRule>(`/panel-tools/selection-rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function togglePanelSelectionRule(id: number, enabled: boolean): Promise<PanelSelectionRule> {
  return request<PanelSelectionRule>(`/panel-tools/selection-rules/${id}/enabled`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

export async function deletePanelSelectionRule(id: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/panel-tools/selection-rules/${id}`, { method: 'DELETE' })
}

export async function preparePanelListingDraft(
  product: OzonboxProductRecord,
  input: PanelListingDraftInput,
): Promise<PanelListingDraftResult> {
  return request<PanelListingDraftResult>('/panel-tools/listing/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: assertOzonboxProductRecord(product), input }),
  })
}

export async function submitPanelListingDraft(draftId: number): Promise<PanelListingSubmitResult> {
  const result = await request<{ success: true; task_id: string; message: string }>(`/upload/drafts/${draftId}/submit`, {
    method: 'POST',
  })
  return {
    draftId,
    simulated: false,
    externalSubmitted: true,
    taskId: result.task_id,
    message: result.message,
  }
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
