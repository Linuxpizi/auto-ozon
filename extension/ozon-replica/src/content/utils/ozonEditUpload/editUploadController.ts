// 编辑上架主控制器
// 移植旧版 src/ozon/index.js handleEditUploadDataClick + switchOzonLocale，
// 流程、文案、判定与旧版保持一致：自动切俄语 → MAIN 世界构建数据
// （prefetch + skipVariants 按模式）→ current 过滤 → priceOverrides → 西里尔兜底
// → richAnnotationJson 序列化 → 上传 → code200 打开 ERP 编辑页 → 恢复中文。

import { API_CONFIG } from '../../../utils/api-config'
import { buildEditUploadDataFromMainWorld, fetchGalleryForRowsFromMainWorld, fetchTitlesForRowsFromMainWorld } from '../ozonQuickShelve/quickShelveMainWorld'
import { submitEditUpload } from './editUploadApi'
import { showGlobalLoading, hideGlobalLoading, updateEditUploadProgress, type EditUploadProgressPhase } from './editUploadLoading'

// 重入保护（对齐旧版 $btn.prop("disabled")，避免重复点击并发上传）
let _running = false

/** buildEditUploadDataFromMainWorld 超时（多变体 getBt + shops 可能较慢） */
const BUILD_DATA_TIMEOUT_MS = 120000

/** 切换 Ozon 站点语言（移植旧版 switchOzonLocale，"ru" 俄语 / "zh-Hans" 中文） */
async function switchOzonLocale(locale: string): Promise<boolean> {
  try {
    const res = await fetch('/api/composer-api.bx/_action/saveLocale', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    })
    return res.ok
  } catch (e) {
    console.warn('[bcs] switchOzonLocale(' + locale + ') failed:', e)
    return false
  }
}

/** 从页面 DOM 兜底解析当前商品 SKU（菜单/无 data-sku 场景） */
function resolvePageSku(): string {
  const skuText = document.querySelector('[data-widget="webDetailSKU"]')?.textContent || ''
  const m = skuText.match(/\d+/)
  return m ? String(m[0]) : ''
}

function attachEditUploadProgressListener(): () => void {
  const onProgress = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (!detail || !detail.phase) return
    const phase = detail.phase as EditUploadProgressPhase
    if (phase !== 'variants' && phase !== 'shops') return
    updateEditUploadProgress({
      phase,
      current: Number(detail.current) || 0,
      total: Number(detail.total) || 0,
    })
  }
  document.addEventListener('edit-upload-progress', onProgress)
  return () => document.removeEventListener('edit-upload-progress', onProgress)
}

export interface EditUploadOptions {
  /** sku → 卢布售价，覆盖采集价（利润面板一键上架场景） */
  priceOverrides?: Record<string, string>
}

interface EditUploadData {
  rows?: Array<{ sku?: string | number; price?: string }>
  common_attributes?: Array<{ name?: string }>
  richAnnotationJson?: unknown
  [key: string]: unknown
}

/**
 * 处理编辑上架：获取商品数据并上传到后台（移植旧版 handleEditUploadDataClick）。
 * @param mainSku 主商品 SKU
 * @param mode "current" 仅当前变体 / "all" 全部变体
 * @param options priceOverrides: sku → 卢布售价
 */
export async function handleEditUploadDataClick(
  mainSku: string,
  mode: 'current' | 'all',
  options?: EditUploadOptions,
): Promise<void> {
  showGlobalLoading('数据获取中，请稍候...')
  if (_running) {
    hideGlobalLoading()
    return
  }
  _running = true
  let localeSwitched = false // 标记是否自动切换了语言
  let detachProgress: (() => void) | null = null
  const variantMode = mode || 'all'
  try {
    let sku = String(mainSku || '').trim()
    if (!sku) sku = resolvePageSku()
    if (!sku) {
      hideGlobalLoading()
      alert('Ozon 提示：未识别到主 SKU')
      return
    }

    // === 语言自动切换：检测当前是否为俄语，不是则自动切换 ===
    const htmlLang = (document.documentElement.lang || '').toLowerCase()
    const isRussian = htmlLang === 'ru' || htmlLang.startsWith('ru-')
    if (!isRussian) {
      const switchOk = await switchOzonLocale('ru')
      if (switchOk) {
        localeSwitched = true
        // 等待 cookie 生效
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    // "当前变体"模式只需拉取当前 SKU 数据，skipVariants=true 跳过全量 BFS
    const skipVariants = variantMode === 'current'

    detachProgress = attachEditUploadProgressListener()
    showGlobalLoading('商品数据获取中，请稍候...', { showProgress: true })
    // 统一调用 MAIN 世界 buildEditUploadDataBySku（prefetch 强制拉取，确保切语言后取到俄语数据）
    const editData = (await Promise.race([
      buildEditUploadDataFromMainWorld(sku, true, skipVariants, localeSwitched),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('数据获取超时(120s)')), BUILD_DATA_TIMEOUT_MS)
      }),
    ])) as EditUploadData | null

    if (!editData) {
      hideGlobalLoading()
      alert('Ozon 提示：未获取到有效的编辑上架数据')
      return
    }

    // 对齐旧版：build 后再补拉缺图/缺标题变体（一进页就点编辑上架时 getBt 可能尚未完成）
    // 不切换遮罩文案，保持上一阶段进度条状态
    if (Array.isArray(editData.rows) && editData.rows.length > 0) {
      try {
        await fetchGalleryForRowsFromMainWorld(editData.rows as Array<Record<string, unknown>>)
      } catch (e) {
        console.warn('[bcs][editUpload] 补全变体图库失败:', e)
      }
      try {
        await fetchTitlesForRowsFromMainWorld(editData.rows as Array<Record<string, unknown>>, String(sku))
      } catch (e) {
        console.warn('[bcs][editUpload] 补全变体标题失败:', e)
      }
    }

    // "当前变体"模式：仅保留与当前 SKU 匹配的变体行
    if (variantMode === 'current' && Array.isArray(editData.rows)) {
      const currentSkuStr = String(sku)
      const filteredRows = editData.rows.filter((row) => String(row.sku) === currentSkuStr)
      if (filteredRows.length > 0) {
        editData.rows = filteredRows
      }
    }
    // 利润模块一键上架等场景：用自定义卢布售价覆盖采集价
    const priceOverrides = options && options.priceOverrides
    if (priceOverrides && Array.isArray(editData.rows)) {
      editData.rows.forEach((row) => {
        const customPrice = priceOverrides[String(row.sku || '').trim()]
        if (customPrice != null && customPrice !== '') {
          row.price = String(customPrice)
        }
      })
    }

    // 语言检测兜底：如果自动切换后仍未获取到俄语数据，提示用户
    const ca = editData.common_attributes
    if (Array.isArray(ca) && ca.length > 0 && ca[0] && ca[0].name) {
      if (!/[а-яА-ЯёЁ]/.test(ca[0].name)) {
        hideGlobalLoading()
        alert('Ozon 提示：自动切换语言后仍未获取到俄语数据，请手动将 Ozon 网站语言设置为俄语后重试')
        return
      }
    }
    // richAnnotationJson 序列化为字符串传递给后端
    if (editData.richAnnotationJson && typeof editData.richAnnotationJson === 'object') {
      editData.richAnnotationJson = JSON.stringify(editData.richAnnotationJson)
    }

    showGlobalLoading('数据上传中，请稍候...')
    const uploadRes = await submitEditUpload(editData)
    hideGlobalLoading()
    if (uploadRes && uploadRes.code === 200) {
      const targetUrl = API_CONFIG.LOCAL_FRONTEND_URL + '/loadingZone/ozonGoods?id=' + uploadRes.data
      console.log('editUpload upload success, redirect:', targetUrl)
      window.open(targetUrl, '_blank')
    } else {
      alert((uploadRes && uploadRes.msg) || 'Ozon 提示：编辑上架上传失败')
    }
  } catch (e) {
    hideGlobalLoading()
    console.error('editUploadData trigger error:', e)
    alert('Ozon 提示：编辑上架失败，请重试')
  } finally {
    detachProgress?.()
    // 如果自动切换了语言，恢复为中文
    if (localeSwitched) {
      switchOzonLocale('zh-Hans').catch((e) => {
        console.warn('[bcs] 恢复语言失败:', e)
      })
    }
    _running = false
  }
}
