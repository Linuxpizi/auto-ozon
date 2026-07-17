/**
 * 统一 Background 代理请求 — Content 侧 API
 * 跨域 / CSP / 自定义响应头等场景经 background fetch 转发
 */
import { hasExtensionMessaging } from './runtime'

export const PROXY_FETCH_MESSAGE = 'PROXY_FETCH'

export type ProxyFetchPreset = '1688' | 'local_auth'

export type ProxyFetchMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type ProxyFetchResponseType = 'text' | 'json' | 'binary'

/** multipart 字段（content 侧 base64 编码后传给 background 重建 FormData） */
export type ProxyFetchMultipartField = {
  name: string
  filename?: string
  contentType?: string
  /** base64 编码的文件内容（与 textValue 二选一） */
  data?: string
  /** 纯文本字段（与 data 二选一） */
  textValue?: string
}

export type ProxyFetchOptions = {
  method?: ProxyFetchMethod
  headers?: Record<string, string>
  /** 对象会在发送前 JSON.stringify；与 multipart 互斥 */
  body?: string | Record<string, unknown>
  /** multipart 上传（绕过页面 CORS 限制） */
  multipart?: ProxyFetchMultipartField[]
  responseType?: ProxyFetchResponseType
  /** background 可读但页面 CORS 屏蔽的响应头 */
  exposeHeaders?: string[]
  preset?: ProxyFetchPreset
  /** 覆盖 local_auth 本地配置中的凭证；仅向本地服务注入。 */
  credential?: string
  timeout?: number
}

export type ProxyFetchResult = {
  ok: boolean
  status: number
  /** text 为字符串；json 为对象或数组；binary 为 base64 */
  body: string | Record<string, unknown> | unknown[] | null
  headers: Record<string, string>
  contentType?: string
  error?: string
}

type ProxyFetchMessagePayload = {
  url: string
  method?: ProxyFetchMethod
  headers?: Record<string, string>
  body?: string
  multipart?: ProxyFetchMultipartField[]
  responseType?: ProxyFetchResponseType
  exposeHeaders?: string[]
  preset?: ProxyFetchPreset
  credential?: string
  timeout?: number
}

/** 拼接 URL 与 query params */
export function buildUrlWithParams(baseUrl: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return baseUrl
  const sep = baseUrl.includes('?') ? '&' : '?'
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return qs ? `${baseUrl}${sep}${qs}` : baseUrl
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(
    new Uint8Array(buffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      '',
    ),
  )
}

/** 经 background 代理发起 fetch */
export function proxyFetch(url: string, options: ProxyFetchOptions = {}): Promise<ProxyFetchResult> {
  if (!hasExtensionMessaging()) {
    return Promise.reject(new Error('非扩展环境，无法使用 background 代理'))
  }

  const {
    method = 'GET',
    headers,
    body,
    multipart,
    responseType = 'text',
    exposeHeaders,
    preset,
    credential,
    timeout,
  } = options

  let serializedBody: string | undefined
  if (body !== undefined && body !== null && !multipart?.length) {
    serializedBody = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const payload: ProxyFetchMessagePayload = {
    url,
    method,
    headers,
    body: serializedBody,
    multipart,
    responseType,
    exposeHeaders,
    preset,
    credential,
    timeout,
  }

  return new Promise((resolve, reject) => {
    const runtime = chrome.runtime
    runtime.sendMessage(
      { type: PROXY_FETCH_MESSAGE, data: payload },
      (response: ProxyFetchResult | undefined) => {
        if (runtime.lastError) {
          reject(new Error(runtime.lastError.message || 'background 未响应'))
          return
        }
        if (!response) {
          reject(new Error('background 返回空响应'))
          return
        }
        resolve(response)
      },
    )
  })
}

/** GET 文本（1688 HTML、类目 JSON 字符串等） */
export async function proxyFetchText(url: string, options: Omit<ProxyFetchOptions, 'responseType'> = {}): Promise<string> {
  const result = await proxyFetch(url, { ...options, responseType: 'text' })
  if (!result.ok) {
    throw new Error(result.error || `HTTP ${result.status}`)
  }
  return (result.body as string) ?? ''
}

/** GET/POST JSON */
export async function proxyFetchJson<T = Record<string, unknown>>(
  url: string,
  options: Omit<ProxyFetchOptions, 'responseType'> = {},
): Promise<T> {
  const result = await proxyFetch(url, { ...options, responseType: 'json' })
  if (!result.ok) {
    throw new Error(result.error || `HTTP ${result.status}`)
  }
  return (result.body ?? {}) as T
}

/** 二进制响应 → Blob */
export async function proxyFetchBlob(
  url: string,
  options: Omit<ProxyFetchOptions, 'responseType'> = {},
): Promise<{ blob: Blob; headers: Record<string, string>; status: number }> {
  const result = await proxyFetch(url, { ...options, responseType: 'binary' })
  if (!result.ok) {
    throw new Error(result.error || `HTTP ${result.status}`)
  }

  const base64 = (result.body as string) ?? ''
  let blob = new Blob([], { type: result.contentType || 'application/octet-stream' })
  if (base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    blob = new Blob([bytes], { type: result.contentType || 'application/octet-stream' })
  }

  return { blob, headers: result.headers, status: result.status }
}

/** File → base64，供 multipart 代理上传 */
export async function fileToBase64(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  return arrayBufferToBase64(buffer)
}

/** 跨域图片 → data URL（绕过 CORS） */
export async function proxyFetchDataUrl(url: string): Promise<string> {
  const { blob } = await proxyFetchBlob(url, {
    method: 'GET',
    headers: { Accept: 'image/*' },
  })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Blob 读取失败'))
    reader.readAsDataURL(blob)
  })
}
