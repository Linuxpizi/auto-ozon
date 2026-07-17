/**
 * 统一 Background 代理 fetch 执行层
 * 支持 preset 注入（1688 Cookie、可选本地服务鉴权）及 binary/base64 编码
 */
import type { ProxyFetchPreset, ProxyFetchResponseType, ProxyFetchResult, ProxyFetchMultipartField } from '../utils/proxyFetch'

export const PROXY_FETCH_MESSAGE = 'PROXY_FETCH'

type ProxyFetchRequestData = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  multipart?: ProxyFetchMultipartField[]
  responseType?: ProxyFetchResponseType
  exposeHeaders?: string[]
  preset?: ProxyFetchPreset
  credential?: string
  timeout?: number
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  return btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      '',
    ),
  )
}

/** 拼接 1688 登录态 Cookie，供 preset 1688 使用 */
async function build1688CookieHeader(): Promise<string> {
  try {
    const domains = ['1688.com', '.1688.com', 'detail.1688.com', '.detail.1688.com']
    const seen = new Set<string>()
    const parts: string[] = []

    for (const domain of domains) {
      const cookies = await chrome.cookies.getAll({ domain })
      for (const c of cookies) {
        if (seen.has(c.name)) continue
        seen.add(c.name)
        parts.push(`${c.name}=${c.value}`)
      }
    }
    return parts.join('; ')
  } catch (error) {
    console.warn('[Background][1688] 读取 Cookie 失败:', error)
    return ''
  }
}

type LocalAuthSettings = {
  credential: string
  headerName: string
  scheme: string
}

/** 可选本地服务凭证。默认无凭证，因此本地开发无需登录。 */
async function readLocalAuthSettings(): Promise<LocalAuthSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['local_api_auth'], (items) => {
      const auth = items?.local_api_auth || {}
      resolve({
        credential: typeof auth.credential === 'string' ? auth.credential.trim() : '',
        headerName:
          typeof auth.headerName === 'string' && auth.headerName.trim()
            ? auth.headerName.trim()
            : 'Authorization',
        scheme: typeof auth.scheme === 'string' ? auth.scheme.trim() : 'Bearer',
      })
    })
  })
}

function isLocalServiceUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

/** 按 preset 合并请求头 */
async function applyPreset(
  url: string,
  preset: ProxyFetchPreset | undefined,
  headers: Record<string, string>,
  credentialOverride?: string,
): Promise<Record<string, string>> {
  const merged = { ...headers }

  if (preset === '1688') {
    const cookieHeader = await build1688CookieHeader()
    const isOfferDetailsCdn = url.includes('itemcdn.tmall.com')
    merged.Accept = merged.Accept || 'text/html,application/xhtml+xml,*/*'
    merged.Referer = isOfferDetailsCdn ? 'https://detail.1688.com/' : 'https://www.1688.com/'
    if (cookieHeader) {
      merged.Cookie = cookieHeader
    }
  }

  if (preset === 'local_auth') {
    if (!isLocalServiceUrl(url)) {
      throw new Error('local_auth 仅允许用于 localhost/127.0.0.1 服务')
    }
    const settings = await readLocalAuthSettings()
    const credential = String(credentialOverride || settings.credential).trim()
    if (credential) {
      const value = settings.scheme ? `${settings.scheme} ${credential}` : credential
      merged[settings.headerName] = value
    }
  }

  return merged
}

/** 从 Response 提取 exposeHeaders 白名单内的响应头（大小写不敏感） */
function extractExposedHeaders(response: Response, exposeHeaders?: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  if (!exposeHeaders?.length) return result

  for (const name of exposeHeaders) {
    const value = response.headers.get(name) || response.headers.get(name.toLowerCase())
    if (value) {
      result[name] = value
    }
  }
  return result
}

/** 由 base64 / 文本字段重建 FormData（multipart 代理上传） */
function buildFormDataFromMultipart(fields: ProxyFetchMultipartField[]): FormData {
  const formData = new FormData()
  for (const field of fields) {
    if (field.textValue !== undefined) {
      formData.append(field.name, field.textValue)
      continue
    }
    if (!field.data) continue
    const bytes = base64ToUint8Array(field.data)
    const blob = new Blob([bytes as BlobPart], { type: field.contentType || 'application/octet-stream' })
    formData.append(field.name, blob, field.filename || 'file')
  }
  return formData
}

/** 统一代理 fetch 入口 */
export async function handleProxyFetch(
  data: ProxyFetchRequestData,
  sendResponse: (response?: ProxyFetchResult) => void,
): Promise<void> {
  try {
    const url = String(data?.url || '').trim()
    if (!url) {
      sendResponse({ ok: false, status: 0, body: null, headers: {}, error: '缺少 url' })
      return
    }

    const method = (data.method || 'GET').toUpperCase()
    const responseType: ProxyFetchResponseType = data.responseType || 'text'
    let headers = await applyPreset(url, data.preset, data.headers || {}, data.credential)

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (data.timeout && data.timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), data.timeout)
    }

    const fetchInit: RequestInit = {
      method,
      signal: controller.signal,
    }

    // multipart 时由 fetch 自动设置 Content-Type boundary，不可手动指定
    if (data.multipart?.length) {
      fetchInit.body = buildFormDataFromMultipart(data.multipart)
      delete headers['Content-Type']
      delete headers['content-type']
      fetchInit.headers = headers
    } else {
      fetchInit.headers = headers
      if (data.body !== undefined && method !== 'GET' && method !== 'HEAD') {
        fetchInit.body = data.body
        // 字符串 body 未带 Content-Type 时，fetch 会默认为 text/plain，导致 Spring 接口 500
        const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
        if (!hasContentType) {
          const trimmed = String(data.body).trim()
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            headers['Content-Type'] = 'application/json;charset=utf-8'
            fetchInit.headers = headers
          }
        }
      }
    }

    const response = await fetch(url, fetchInit)
    if (timeoutId) clearTimeout(timeoutId)

    const contentType = response.headers.get('Content-Type') || undefined
    const exposedHeaders = extractExposedHeaders(response, data.exposeHeaders)
    const ok = response.ok

    if (responseType === 'binary') {
      const arrayBuffer = await response.arrayBuffer()
      sendResponse({
        ok,
        status: response.status,
        body: arrayBuffer.byteLength > 0 ? arrayBufferToBase64(arrayBuffer) : '',
        headers: exposedHeaders,
        contentType,
      })
      return
    }

    if (responseType === 'json') {
      let parsed: ProxyFetchResult['body'] = null
      try {
        parsed = await response.json()
      } catch {
        parsed = null
      }
      if (!ok) {
        sendResponse({
          ok: false,
          status: response.status,
          body: parsed,
          headers: exposedHeaders,
          contentType,
          error: `HTTP ${response.status}`,
        })
        return
      }
      sendResponse({
        ok: true,
        status: response.status,
        body: parsed,
        headers: exposedHeaders,
        contentType,
      })
      return
    }

    // text
    const text = await response.text()
    if (!ok) {
      sendResponse({
        ok: false,
        status: response.status,
        body: text,
        headers: exposedHeaders,
        contentType,
        error: `HTTP ${response.status}`,
      })
      return
    }
    sendResponse({
      ok: true,
      status: response.status,
      body: text,
      headers: exposedHeaders,
      contentType,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error('[Background][PROXY_FETCH] 代理失败:', error)
    sendResponse({ ok: false, status: 0, body: null, headers: {}, error: message })
  }
}
