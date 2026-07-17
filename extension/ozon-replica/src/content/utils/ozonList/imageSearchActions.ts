import { API_CONFIG } from '../../../utils/api-config'
import { showToast } from '../../../utils/toast'
import {
  FETCH_AND_UPLOAD_IMAGE,
  OZON_SEARCH_BY_IMAGE,
} from '../../../background/imageSearchHandler'

let ozonImageSearchBusy = false
let ali1688ImageSearchBusy = false

function sendBgMessage<T>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(res as T)
    })
  })
}

function normalizeImageUrl(url: string): string {
  return String(url || '').replace(/\/wc\d+\//, '/wc500/')
}

function resolveOzonOrigin(): string {
  const href = window.location.href || ''
  return href.includes('ozon.kz') ? 'https://www.ozon.kz' : 'https://www.ozon.ru'
}

function resolveImageUrlFromCard(card: HTMLElement, btn: HTMLElement): string {
  const fromBtn = btn.getAttribute('data-img-url') || btn.getAttribute('data-value') || ''
  if (fromBtn) return normalizeImageUrl(fromBtn)
  const fromDataset = card.dataset.productImg || ''
  if (fromDataset) return normalizeImageUrl(fromDataset)
  return ''
}

async function ozonSearchByImage(imageUrl: string): Promise<string> {
  const res = await sendBgMessage<{ ok?: boolean; openUrl?: string; error?: string }>({
    action: OZON_SEARCH_BY_IMAGE,
    payload: { imageUrl, ozonOrigin: resolveOzonOrigin() },
  })
  if (!res?.ok || !res.openUrl) {
    throw new Error(res?.error || 'Ozon 以图搜图失败')
  }
  return res.openUrl
}

async function ali1688SearchByImage(imageUrl: string): Promise<string> {
  const res = await sendBgMessage<{
    ok?: boolean
    status?: number
    statusText?: string
    error?: string
    data?: { code?: number; data?: { image_id?: string; url?: string }; msg?: string; message?: string }
  }>({
    action: FETCH_AND_UPLOAD_IMAGE,
    payload: {
      imageUrl,
      uploadUrl: `${API_CONFIG.LOCAL_API_BASE_URL}/system/pythonAnalysis/imageAnalysis`,
    },
  })

  // 对齐旧版 messageFromFetchUploadResponse + reject(hint || response.error)：
  // 后台抓图/上传失败时，res.ok === false / res.data 为空，但 res.error 才是真错
  // （例如缺少 ozone.ru CDN 的 host_permission 时 fetch 抛 "Failed to fetch"）。
  // 之前只看 res.data 会把所有失败都报成"未返回有效链接"，掩盖真实根因。
  if (res?.ok === false) {
    const body = res.data
    const backendMsg = body?.msg || body?.message
    const statusHint = res.status ? `HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}` : ''
    throw new Error(backendMsg || res.error || statusHint || '后台抓图并上传失败')
  }

  const body = res?.data
  const imageId = body?.data?.image_id
  if (body?.code === 200 && imageId) {
    return (
      'https://s.1688.com/youyuan/index.htm?tab=imageSearch' +
      '&region=10,490,10,490' +
      `&imageId=${encodeURIComponent(imageId)}` +
      '&yoloCropRegion=50,350,50,350'
    )
  }
  throw new Error(body?.msg || body?.message || '1688 以图搜图未返回有效链接')
}

// 对齐旧版 crawler.js 点击瞬间 .html(loadingSvg) 的视觉：dashed circle，stroke=currentColor，
// 与按钮原图标同 24×24 viewBox + 16px 渲染尺寸（继承 .bcs-card-circle-btn svg），
// 配合 .cj-but1688-loading svg { animation: bcs-spin } 转起来看起来就是小圈圈转
const LOADING_SPINNER_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
  '<circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>' +
  '</svg>'

function setBtnLoading(btn: HTMLElement, loading: boolean) {
  if (loading) {
    // 保存原始内嵌（首次进入 loading 才存，再次进 loading 不要覆盖成已经替换过的 spinner）
    if (btn.dataset.bcsOriginalHtml == null) {
      btn.dataset.bcsOriginalHtml = btn.innerHTML
    }
    btn.innerHTML = LOADING_SPINNER_SVG
    btn.classList.add('is_loading', 'cj-but1688-loading')
    btn.setAttribute('aria-disabled', 'true')
  } else {
    btn.classList.remove('is_loading', 'cj-but1688-loading')
    btn.removeAttribute('aria-disabled')
    // 恢复原始内嵌（含原本的搜索/1688 svg + 任何包装节点）
    if (btn.dataset.bcsOriginalHtml != null) {
      btn.innerHTML = btn.dataset.bcsOriginalHtml
      delete btn.dataset.bcsOriginalHtml
    }
  }
}

/** 绑定卡片上以图搜图按钮 */
export function bindCardImageSearchActions(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-action="img_search_ozon"]').forEach((btn) => {
    if (btn.dataset.boundImgOzon === '1') return
    btn.dataset.boundImgOzon = '1'
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const card = btn.closest('.mjgd_ozon_sku_card') as HTMLElement | null
      if (!card) return
      const imgUrl = resolveImageUrlFromCard(card, btn)
      if (!imgUrl) {
        showToast('未找到商品图片', 2500)
        return
      }
      if (ozonImageSearchBusy) {
        showToast('请等待当前 Ozon 以图搜图完成', 2500)
        return
      }
      ozonImageSearchBusy = true
      setBtnLoading(btn, true)
      void ozonSearchByImage(imgUrl)
        .then((openUrl) => {
          window.open(openUrl, '_blank')
        })
        .catch((err: Error) => {
          const msg = err?.message || 'Ozon 以图搜图失败'
          const lower = msg.toLowerCase()
          if (lower.includes('not json') || lower.includes('403') || lower.includes('forbidden')) {
            showToast('以图搜图失败，请检查是否已登录 Ozon 商城账号', 4000)
          } else {
            showToast(msg, 4000)
          }
        })
        .finally(() => {
          setBtnLoading(btn, false)
          ozonImageSearchBusy = false
        })
    })
  })

  root.querySelectorAll<HTMLElement>('[data-action="img_search_1688"]').forEach((btn) => {
    if (btn.dataset.boundImg1688 === '1') return
    btn.dataset.boundImg1688 = '1'
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const card = btn.closest('.mjgd_ozon_sku_card') as HTMLElement | null
      if (!card) return
      const imgUrl = resolveImageUrlFromCard(card, btn)
      if (!imgUrl) {
        showToast('未找到商品图片', 2500)
        return
      }
      if (ali1688ImageSearchBusy) {
        showToast('请等待当前 1688 以图搜图完成', 2500)
        return
      }
      ali1688ImageSearchBusy = true
      setBtnLoading(btn, true)
      void ali1688SearchByImage(imgUrl)
        .then((openUrl) => {
          window.open(openUrl, '_blank')
        })
        .catch((err: Error) => {
          showToast(err?.message || '1688 以图搜图失败', 4000)
        })
        .finally(() => {
          setBtnLoading(btn, false)
          ali1688ImageSearchBusy = false
        })
    })
  })
}
