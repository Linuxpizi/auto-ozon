/**
 * M06：以图搜图 background handler（Ozon / 1688）
 * 移植自 ozon_old/popup/background.js
 */
import { API_CONFIG } from '../utils/api-config'

export const OZON_SEARCH_BY_IMAGE = 'OZON_SEARCH_BY_IMAGE'
export const FETCH_AND_UPLOAD_IMAGE = 'FETCH_AND_UPLOAD_IMAGE'

type ImageSearchSender = { tab?: { id?: number } } | undefined

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function guessExtFromMime(mime: string, imageUrl: string): string {
  const lower = String(mime || '').toLowerCase()
  if (lower.includes('png')) return 'png'
  if (lower.includes('webp')) return 'webp'
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg'
  const match = String(imageUrl || '').match(/\.([a-z0-9]+)(?:\?|$)/i)
  return match?.[1] || 'jpg'
}

async function convertWebpBlobToPng(blob: Blob): Promise<Blob> {
  const imageBitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas context unavailable')
  ctx.drawImage(imageBitmap, 0, 0)
  imageBitmap.close()
  return canvas.convertToBlob({ type: 'image/png', quality: 1 })
}

function normalizeOzonOrigin(ozonOrigin: string): string {
  let o = String(ozonOrigin || '').trim()
  if (!o) return ''
  if (o.endsWith('/')) o = o.slice(0, -1)
  return o
}

/** 上传最大重试次数 */
const UPLOAD_MAX_RETRIES = 1
/** 上传重试延迟 */
const UPLOAD_RETRY_DELAY_MS = 500

/** 是否可重试上传 */
function isUploadRetryable(status: number, data: unknown): boolean {
  if (status >= 500) return true
  const body = data as { code?: number } | null
  return status === 200 && typeof body?.code === 'number' && body.code >= 500
}

/** 解析上传响应 */
async function parseUploadResponse(uploadResp: Response): Promise<unknown> {
  const contentType = uploadResp.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return uploadResp.json().catch(() => uploadResp.text())
  }
  const rawText = await uploadResp.text()
  try {
    return JSON.parse(rawText)
  } catch {
    return rawText
  }
}

type LocalAuthSettings = {
  credential: string
  headerName: string
  scheme: string
}

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

/** 读取中性的本地服务鉴权配置；默认不启用鉴权。 */
function readLocalAuthSettings(): Promise<LocalAuthSettings> {
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

async function buildLocalUploadHeaders(
  uploadUrl: string,
  credentialOverride?: string,
): Promise<Record<string, string>> {
  const explicitCredential = String(credentialOverride || '').trim()
  if (!isLoopbackUrl(uploadUrl)) {
    if (explicitCredential) {
      throw new Error('本地服务凭证禁止发送到非 loopback 地址')
    }
    return {}
  }

  const settings = await readLocalAuthSettings()
  const credential = explicitCredential || settings.credential
  if (!credential) return {}
  const value = settings.scheme ? `${settings.scheme} ${credential}` : credential
  return { [settings.headerName]: value }
}

/** 处理图片上传 */
async function handleFetchAndUploadImage(
  payload: { imageUrl?: string; uploadUrl?: string; credential?: string },
  sendResponse: (response?: unknown) => void,
) {
  try {
    const imageUrl = payload?.imageUrl
    const uploadUrl =
      payload?.uploadUrl || `${API_CONFIG.LOCAL_API_BASE_URL}/system/pythonAnalysis/imageAnalysis`

    if (!imageUrl) {
      sendResponse({ ok: false, error: 'FETCH_AND_UPLOAD_IMAGE missing imageUrl' })
      return
    }

    const imageResp = await fetch(imageUrl, { method: 'GET', cache: 'no-store' })
    if (!imageResp.ok) {
      sendResponse({ ok: false, status: imageResp.status, error: 'FETCH_AND_UPLOAD_IMAGE image fetch failed' })
      return
    }

    let imageBlob = await imageResp.blob()
    let imageMime = imageBlob.type || imageResp.headers.get('content-type') || 'application/octet-stream'
    if (String(imageMime).toLowerCase().includes('webp')) {
      imageBlob = await convertWebpBlobToPng(imageBlob)
      imageMime = 'image/png'
    }

    const formData = new FormData()
    formData.append('image', imageBlob, `image.${guessExtFromMime(imageMime, imageUrl)}`)

    const headers = await buildLocalUploadHeaders(uploadUrl, payload?.credential)
    // 上传响应
    let uploadResp!: Response
    // 上传数据
    let data: unknown = null
    for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt += 1) {
      // 上传请求
      uploadResp = await fetch(uploadUrl, { method: 'POST', headers, body: formData })
      // 解析上传响应
      data = await parseUploadResponse(uploadResp)
      if (!isUploadRetryable(uploadResp.status, data) || attempt === UPLOAD_MAX_RETRIES) break
      await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS))
    }

    sendResponse({
      ok: uploadResp.ok,
      status: uploadResp.status,
      statusText: uploadResp.statusText,
      data,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    sendResponse({ ok: false, status: 0, error: msg })
  }
}

async function handleOzonSearchByImage(
  payload: { imageUrl?: string; ozonOrigin?: string },
  sender: ImageSearchSender,
  sendResponse: (response?: unknown) => void,
) {
  try {
    const imageUrl = payload?.imageUrl
    const ozonOrigin = normalizeOzonOrigin(payload?.ozonOrigin || '')
    const tabId = sender?.tab?.id

    if (!imageUrl) {
      sendResponse({ ok: false, error: 'OZON_SEARCH_BY_IMAGE missing imageUrl' })
      return
    }
    if (!ozonOrigin) {
      sendResponse({ ok: false, error: 'OZON_SEARCH_BY_IMAGE missing ozonOrigin' })
      return
    }
    if (tabId == null) {
      sendResponse({ ok: false, error: 'OZON_SEARCH_BY_IMAGE missing tab' })
      return
    }

    const imageResp = await fetch(imageUrl, { method: 'GET', cache: 'no-store' })
    if (!imageResp.ok) {
      sendResponse({ ok: false, status: imageResp.status, error: 'OZON_SEARCH_BY_IMAGE image fetch failed' })
      return
    }

    const imageBlob = await imageResp.blob()
    let imageMime = imageBlob.type || imageResp.headers.get('content-type') || 'application/octet-stream'
    const bitmap = await createImageBitmap(imageBlob)
    const width = bitmap.width
    const height = bitmap.height
    bitmap.close()

    const lowerMime = String(imageMime).toLowerCase()
    if (!lowerMime.includes('webp')) {
      if (lowerMime.includes('png')) imageMime = 'image/png'
      else imageMime = 'image/jpeg'
    }

    const base64 = arrayBufferToBase64(await imageBlob.arrayBuffer())
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [base64, imageMime, width, height, imageMime, ozonOrigin],
      func: (
        b64: string,
        mimeForBlob: string,
        w: number,
        h: number,
        sourceMetaType: string,
        origin: string,
      ) => {
        try {
          const bin = atob(b64)
          const u8 = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i)
          const blob = new Blob([u8], { type: mimeForBlob || 'application/octet-stream' })
          const mime = String(mimeForBlob || '').toLowerCase()
          const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
          const fd = new FormData()
          fd.append('file', blob, `upload.${ext}`)
          fd.append(
            'sourceMetadata',
            JSON.stringify({ width: w, height: h, type: sourceMetaType || mimeForBlob || 'image/jpeg' }),
          )

          const uploadUrl = `${origin}/api/composer-api.bx/_action/searchByImageUpload`
          return fetch(uploadUrl, {
            method: 'POST',
            body: fd,
            credentials: 'include',
            headers: { Accept: 'application/json', 'x-o3-app-name': 'dweb_client' },
          })
            .then((up) =>
              up.text().then((uploadText) => {
                let uploadJson: Record<string, unknown>
                try {
                  uploadJson = JSON.parse(uploadText)
                } catch {
                  return { ok: false, error: `OZON upload not JSON: ${uploadText.slice(0, 240)}` }
                }
                const imageId =
                  uploadJson?.imageId ||
                  (uploadJson?.data as Record<string, unknown> | undefined)?.imageId
                if (!up.ok || !imageId) {
                  return {
                    ok: false,
                    error: (uploadJson?.message as string) || 'OZON upload failed or no imageId',
                  }
                }

                const searchUrl = `${origin}/api/composer-api.bx/_action/searchByImage`
                return fetch(searchUrl, {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'x-o3-app-name': 'dweb_client',
                  },
                  body: JSON.stringify({
                    imageId,
                    cropRectangle: { left: 0, top: 0, width: 1, height: 1 },
                  }),
                }).then((se) =>
                  se.text().then((searchText) => {
                    let searchJson: Record<string, unknown>
                    try {
                      searchJson = JSON.parse(searchText)
                    } catch {
                      return { ok: false, error: `OZON search not JSON: ${searchText.slice(0, 240)}` }
                    }
                    const data = searchJson?.data as Record<string, unknown> | undefined
                    const redirectUri = (searchJson?.redirectUri || data?.redirectUri) as string | undefined
                    const resultId = (searchJson?.resultId || data?.resultId) as string | undefined
                    let openUrl = ''
                    if (redirectUri) {
                      openUrl =
                        redirectUri.indexOf('http') === 0
                          ? redirectUri
                          : `${origin}${redirectUri.startsWith('/') ? '' : '/'}${redirectUri}`
                    } else if (resultId) {
                      openUrl = `${origin}/search-by-image?image_id=${encodeURIComponent(String(resultId))}`
                    }
                    if (!se.ok || !openUrl) {
                      return {
                        ok: false,
                        error: (searchJson?.message as string) || 'OZON search failed or no redirect',
                      }
                    }
                    return { ok: true, openUrl }
                  }),
                )
              }),
            )
            .catch((err: Error) => ({ ok: false, error: err?.message || String(err) }))
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          return Promise.resolve({ ok: false, error: msg })
        }
      },
    })

    const mainResult = injectionResults?.[0]?.result as { ok?: boolean; openUrl?: string; error?: string } | undefined
    if (!mainResult?.ok || !mainResult.openUrl) {
      sendResponse({ ok: false, error: mainResult?.error || 'OZON_SEARCH_BY_IMAGE MAIN world failed' })
      return
    }
    sendResponse({ ok: true, openUrl: mainResult.openUrl })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    sendResponse({ ok: false, error: msg })
  }
}

export function handleImageSearchMessage(
  msg: { type?: string; action?: string; payload?: Record<string, unknown> },
  sender: ImageSearchSender,
  sendResponse: (response?: unknown) => void,
): boolean {
  const type = msg?.type || msg?.action
  if (type === FETCH_AND_UPLOAD_IMAGE) {
    void handleFetchAndUploadImage((msg.payload || {}) as Parameters<typeof handleFetchAndUploadImage>[0], sendResponse)
    return true
  }
  if (type === OZON_SEARCH_BY_IMAGE) {
    void handleOzonSearchByImage(
      (msg.payload || {}) as Parameters<typeof handleOzonSearchByImage>[0],
      sender,
      sendResponse,
    )
    return true
  }
  return false
}
