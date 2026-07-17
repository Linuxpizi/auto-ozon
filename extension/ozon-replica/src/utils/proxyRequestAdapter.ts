/**
 * 将 apiService axios 风格请求转为 background PROXY_FETCH，复刻拦截器行为
 */
import type { AxiosRequestConfig } from 'axios'
import { API_CONFIG } from './api-config'
import {
  buildUrlWithParams,
  fileToBase64,
  proxyFetch,
  type ProxyFetchMethod,
  type ProxyFetchMultipartField,
} from './proxyFetch'

type ApiResponseLike = {
  code?: number
  msg?: string
  [key: string]: unknown
}

/** 解析 axios endpoint + baseURL + params 为完整 URL */
export function resolveRequestUrl(endpoint: string, config: AxiosRequestConfig): string {
  let url = endpoint
  if (!url.startsWith('http')) {
    const base = String(config.baseURL || API_CONFIG.LOCAL_API_BASE_URL).replace(/\/$/, '')
    const path = url.startsWith('/') ? url : `/${url}`
    url = `${base}${path}`
  }
  if (config.params && typeof config.params === 'object') {
    url = buildUrlWithParams(url, config.params as Record<string, unknown>)
  }
  return url
}

/** FormData → multipart 代理字段 */
async function formDataToMultipart(formData: FormData): Promise<ProxyFetchMultipartField[]> {
  const fields: ProxyFetchMultipartField[] = []
  for (const [name, value] of formData.entries()) {
    if (value instanceof Blob) {
      fields.push({
        name,
        filename: value instanceof File ? value.name : undefined,
        contentType: value.type || 'application/octet-stream',
        data: await fileToBase64(value),
      })
    } else {
      fields.push({ name, textValue: String(value) })
    }
  }
  return fields
}

/**
 * 扩展环境下经 background 代理发起 API 请求
 */
export async function proxyRequestViaBackground<T>(
  endpoint: string,
  options: AxiosRequestConfig,
  _api?: unknown,
): Promise<T> {
  const { headers: rawHeaders, data, method, timeout, ...rest } = options
  const fullUrl = resolveRequestUrl(endpoint, options)

  const headers: Record<string, string> = {}
  if (rawHeaders) {
    const h = rawHeaders as Record<string, string>
    for (const [k, v] of Object.entries(h)) {
      if (v === undefined) continue
      // multipart/form-data 由 fetch 自动设置 boundary，不可手动传入
      if (k.toLowerCase() === 'content-type' && String(v).includes('multipart/form-data')) {
        continue
      }
      headers[k] = String(v)
    }
  }

  const fetchMethod = (method?.toUpperCase() || 'GET') as ProxyFetchMethod

  const fetchOptions: Parameters<typeof proxyFetch>[1] = {
    method: fetchMethod,
    headers,
    responseType: 'json',
    timeout: typeof timeout === 'number' ? timeout : undefined,
  }

  // 本地服务可通过 chrome.storage.local.local_api_auth 选择性注入中性凭证。
  // background 会拒绝把该凭证发送到非 loopback 地址。
  try {
    const hostname = new URL(fullUrl).hostname.toLowerCase()
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      fetchOptions.preset = 'local_auth'
    }
  } catch {
    // resolveRequestUrl 正常情况下已生成绝对 URL，异常时交由 background 返回错误。
  }

  if (data instanceof FormData) {
    fetchOptions.multipart = await formDataToMultipart(data)
  } else if (data !== undefined && data !== null && fetchMethod !== 'GET') {
    fetchOptions.body = typeof data === 'string' ? data : (data as Record<string, unknown>)
    // POST JSON 必须显式声明 Content-Type，否则 background fetch 默认为 text/plain
    const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
    if (!hasContentType) {
      headers['Content-Type'] = 'application/json;charset=utf-8'
    }
  }

  fetchOptions.headers = headers

  void rest

  try {
    const result = await proxyFetch(fullUrl, fetchOptions)

    if (!result.ok) {
      const errBody =
        result.body && typeof result.body === 'object' && !Array.isArray(result.body)
          ? (result.body as Record<string, unknown>)
          : { msg: result.error || `HTTP ${result.status}` }
      throw { code: result.status || 500, ...errBody }
    }

    const body = (result.body ?? {}) as ApiResponseLike
    return body as T
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw error
    }
    console.error('API Proxy Network Error:', error)
    throw { code: 0, msg: '网络错误，请检查网络连接' }
  }
}
