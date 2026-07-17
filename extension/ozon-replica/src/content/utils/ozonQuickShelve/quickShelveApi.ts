import { apiService } from '../../../utils/api'
import { API_CONFIG } from '../../../utils/api-config'
import type {
  OzonShopInfo,
  ShopRecordQuotaData,
  ShopWarehouseConfig,
  TemplateSelectItem,
  UpperTemplateItem,
} from './types'

function formatQuotaUsageLimit(block?: { usage?: number | string; limit?: number | string }): string {
  if (!block || typeof block !== 'object') return '--/--'
  const u = block.usage
  const l = block.limit
  if (
    (typeof u !== 'number' && typeof u !== 'string') ||
    (typeof l !== 'number' && typeof l !== 'string')
  ) {
    return '--/--'
  }
  return `${u}/${l}`
}

function quotaUsageLimitWithSpans(block?: { usage?: number | string; limit?: number | string }): string {
  const raw = formatQuotaUsageLimit(block)
  if (raw === '--/--') return raw
  // 用中性类名，急速上架与上品模板两个弹窗的 SCSS 都给它上同一份红色（对齐旧版 shop-quota-num 的 #da4b28）
  return `<span class="mjgd_shop_quota_num">${raw}</span>`
}

/** 店铺额度一行 HTML */
export function formatShopQuotaHtml(data?: ShopRecordQuotaData | null): string {
  if (!data || typeof data !== 'object') {
    return '日创:-- / 日更:-- / 共创:--'
  }
  return `日创:${quotaUsageLimitWithSpans(data.daily_create)} / 日更:${quotaUsageLimitWithSpans(data.daily_update)} / 共创:${quotaUsageLimitWithSpans(data.total)}`
}

/** 剩余额度展示：max(0, limit - usage) / limit */
export function formatQuotaRemainLimit(block?: { usage?: number | string; limit?: number | string }): string {
  if (!block || typeof block !== 'object') return '--/--'
  const usage = Number(block.usage)
  const limit = Number(block.limit)
  if (!Number.isFinite(usage) || !Number.isFinite(limit)) return '--/--'
  const remain = Math.max(0, limit - usage)
  return `${remain}/${limit}`
}

export async function fetchShopRecordQuotaData(shopId: string | number): Promise<ShopRecordQuotaData | null> {
  try {
    const res = await apiService.request<{ code: number; data?: ShopRecordQuotaData }>(
      `/system/ozonRecord/getInfo/${encodeURIComponent(String(shopId))}`,
      { method: 'GET', baseURL: API_CONFIG.LOCAL_API_BASE_URL },
    )
    if (res?.code === 200 && res.data) return res.data
  } catch {
    /* ignore */
  }
  return null
}

export async function fetchShopRecordQuota(shopId: string): Promise<string> {
  const data = await fetchShopRecordQuotaData(shopId)
  return formatShopQuotaHtml(data)
}

export async function fetchOzonShops(): Promise<OzonShopInfo[]> {
  try {
    const res = await apiService.request<{ code: number; data?: OzonShopInfo[] }>(
      '/system/ozonShop/ozon/shopInfo',
      { method: 'GET', baseURL: API_CONFIG.LOCAL_API_BASE_URL },
    )
    if (res?.code === 200 && Array.isArray(res.data)) return res.data
  } catch (error) {
    console.warn('[mjgd][quick-shelve] 本地店铺列表服务不可用', error)
  }
  return []
}

export async function fetchUpperTemplates(): Promise<UpperTemplateItem[]> {
  try {
    const res = await apiService.request<{ code: number; data?: Array<Record<string, unknown>> }>(
      '/system/productTemplate/productTemplateSelectList',
      { method: 'GET', baseURL: API_CONFIG.LOCAL_API_BASE_URL },
    )
    if (res?.code !== 200 || !Array.isArray(res.data)) return []
    return res.data
      .map((item) => {
        const rawId = item.id ?? item.templateId
        if (rawId == null || rawId === '') return null
        const label = String(
          item.templateName || item.name || item.label || item.title || rawId,
        )
        return { id: String(rawId), label, raw: item }
      })
      .filter((x): x is UpperTemplateItem => !!x)
  } catch (error) {
    console.warn('[mjgd][quick-shelve] 本地上品模板服务不可用', error)
    return []
  }
}

export async function fetchShopWarehouses(shopId: string): Promise<ShopWarehouseConfig> {
  const payload = {
    bt: 0,
    cfStatus: 0,
    Btxh: true,
    aiImage: true,
    diyName: null,
    logoUrl: null,
    warehouseId: null,
    brandStatus: true,
    oModel: true,
    pricateStatus: 0,
    ldStatus: 0,
    shopIds: [],
    shopId,
    stock: 0,
  }
  const res = await apiService.request<{
    code: number
    data?: { result?: Array<{ warehouse_id: string; name: string }> }
  }>(API_CONFIG.ENDPOINTS.GET_WAREHOUSE, {
    method: 'POST',
    baseURL: API_CONFIG.LOCAL_API_BASE_URL,
    data: payload,
  })
  const list = res?.data?.result || []
  return {
    shopId,
    warehouseId: list[0]?.warehouse_id || '',
    stock: 0,
    warehouseList: list,
  }
}

export async function submitQuickShelve(payload: Record<string, unknown>) {
  return apiService.request<{ code: number; msg?: string }>(
    '/system/ozonRecord/hts/user/add',
    {
      method: 'POST',
      baseURL: API_CONFIG.LOCAL_API_BASE_URL,
      data: payload,
    },
  )
}

/** AI 改图模板列表 */
export async function fetchAiImageTemplates(): Promise<TemplateSelectItem[]> {
  try {
    const res = await apiService.request<{
      code: number
      rows?: Array<{ id?: string | number; templateName?: string }>
    }>('/system/AIRetouch/list?pageNumber=0&pageSize=100', {
      method: 'GET',
      baseURL: API_CONFIG.LOCAL_API_BASE_URL,
    })
    if (res?.code !== 200 || !Array.isArray(res.rows)) return []
    return res.rows
      .filter((item) => item.id != null && item.id !== '')
      .map((item) => ({
        id: String(item.id),
        label: String(item.templateName || item.id),
      }))
  } catch (error) {
    console.warn('[mjgd][quick-shelve] 本地 AI 改图模板服务不可用', error)
    return []
  }
}

/** 防跟卖签名模板列表 */
export async function fetchAntiFollowTemplates(): Promise<TemplateSelectItem[]> {
  try {
    const res = await apiService.request<{
      code: number
      data?: Array<{ id?: string | number; templateName?: string }>
    }>('/system/antiFollowTemplate/selectList', {
      method: 'GET',
      baseURL: API_CONFIG.LOCAL_API_BASE_URL,
    })
    if (res?.code !== 200 || !Array.isArray(res.data)) return []
    return res.data
      .filter((item) => item.id != null && item.id !== '')
      .map((item) => ({
        id: String(item.id),
        label: String(item.templateName || item.id),
      }))
  } catch (error) {
    console.warn('[mjgd][quick-shelve] 本地防跟卖模板服务不可用', error)
    return []
  }
}

export async function submitQuickShelveV2(payload: Record<string, unknown>) {
  return apiService.request<{ code: number; msg?: string }>(
    '/system/ozonRecord/hts/user/addV2',
    {
      method: 'POST',
      baseURL: API_CONFIG.LOCAL_API_BASE_URL,
      data: payload,
    },
  )
}

/** 品牌搜索（自定义品牌输入下拉，对齐旧版 POST /system/ozonRecord/search/band） */
export interface BrandSearchItem {
  id: string
  value: string
}

export async function searchBrand(keyword: string): Promise<BrandSearchItem[]> {
  const kw = (keyword || '').trim()
  if (!kw) return []
  try {
    const res = await apiService.request<{
      code: number
      data?: { result?: Array<{ id?: string | number; value?: string; name?: string }>; results?: Array<{ id?: string | number; value?: string; name?: string }> } | null
    }>('/system/ozonRecord/search/band', {
      method: 'POST',
      baseURL: API_CONFIG.LOCAL_API_BASE_URL,
      data: { brand: kw },
    })
    if (res?.code !== 200 || res.data == null) return []
    const list = res.data.result ?? res.data.results ?? []
    return list
      .filter((it) => it.id != null && it.id !== '')
      .map((it) => ({ id: String(it.id), value: String(it.value || it.name || it.id) }))
  } catch {
    return []
  }
}

/** 自定义品牌名解析 Ozon dictionary_value_id（未点下拉时兜底，对齐旧版 resolveBrandIdByName） */
export async function resolveBrandIdByName(brandName: string): Promise<string> {
  const name = (brandName || '').trim()
  if (!name) return ''
  const items = await searchBrand(name)
  const lower = name.toLowerCase()
  const exact = items.find((it) => it.value.trim().toLowerCase() === lower)
  return (exact || items[0])?.id || ''
}
