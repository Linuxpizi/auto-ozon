/**
 * 利润计算器抽屉：从详情页解析商品标题与包装（重量/长宽高）。
 * MAIN 世界脚本通过 ext-req / ext-res 回传数据；标题解析与 AiCollectModal 一致，
 * 包装取自 pieceWeightScaleInfo（与 transformRawData 路径一致）。
 */
import type { CollectedRawInput } from './collectedGoodsTransform'

/** 请求 MAIN 世界返回采集用 window 数据（与 AiCollectModal.fetchRawData 同源协议） */
export function requestMainWorldWindowData(timeoutMs = 8000): Promise<CollectedRawInput> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      document.removeEventListener('ext-res', handleResponse)
      reject(new Error('读取页面商品数据超时'))
    }, timeoutMs)

    function handleResponse(event: Event) {
      const customEvent = event as CustomEvent
      let detail: any = customEvent.detail
      if (typeof detail === 'string') {
        try {
          detail = JSON.parse(detail)
        } catch {
          return
        }
      }
      if (!detail || detail.type !== 'getWindowData' || detail.action !== 'getWindowData') {
        return
      }
      window.clearTimeout(timer)
      document.removeEventListener('ext-res', handleResponse)
      if (detail.success && detail.data != null) {
        resolve({ source: detail.source ?? undefined, data: detail.data })
      } else {
        reject(new Error('页面未返回商品数据'))
      }
    }

    document.addEventListener('ext-res', handleResponse)
    document.dispatchEvent(
      new CustomEvent('ext-req', {
        detail: { type: 'ext-req', action: 'getWindowData' },
      }),
    )
  })
}

export { extractTitleFromRawData } from './collectedGoodsTransform'

function stripSiteSuffix(title: string): string {
  return title
    .replace(/\s*[-|｜]\s*淘宝网.*$/i, '')
    .replace(/\s*[-|｜]\s*天猫.*$/i, '')
    .replace(/\s*[-|｜]\s*阿里巴巴.*$/i, '')
    .replace(/\s*[-|｜]\s*拼多多.*$/i, '')
    .replace(/\s*[-|｜]\s*1688.*$/i, '')
    .trim()
}

/** DOM 兜底：og:title / twitter:title / document.title / h1 */
export function getFallbackProductTitleFromDom(): string {
  const og = document.querySelector('meta[property="og:title"]')
  const ogc = og?.getAttribute('content')?.trim()
  if (ogc) return stripSiteSuffix(ogc)

  const tw = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content')?.trim()
  if (tw) return stripSiteSuffix(tw)

  const t = document.title?.trim()
  if (t) return stripSiteSuffix(t)

  const h1 = document.querySelector('h1')
  const h1t = h1?.textContent?.trim()
  if (h1t && h1t.length > 3) return h1t

  return ''
}

/** 包装尺寸/重量（与 AiCollectModal pieceWeightScaleInfo 一致，单位与页面数据源一致） */
export type ProfitPackagingHint = {
  /** 毛重/包装重量，通常为克 */
  weightG?: string
  /** 长、宽、高（页面原始数值字符串，多为 mm） */
  length?: string
  width?: string
  height?: string
  /** 估算体积 cm³（由长宽高换算，仅当三者均为正数时给出） */
  volumeCm3?: string
}

function numishToString(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return String(v)
  const s = String(v).trim().replace(/,/g, '.')
  const n = parseFloat(s.replace(/[^\d.]/g, ''))
  if (Number.isFinite(n) && n > 0) return String(n)
  return ''
}

/** 根据长宽高粗算体积（cm³）：较大边 ≥50 时按 mm→cm 换算，否则按已为 cm 处理 */
function estimateVolumeCm3FromSides(L: number, W: number, H: number): string {
  if (!(L > 0 && W > 0 && H > 0)) return ''
  const mx = Math.max(L, W, H)
  let vol: number
  if (mx >= 50) {
    const cmL = L / 10
    const cmW = W / 10
    const cmH = H / 10
    vol = cmL * cmW * cmH
  } else {
    vol = L * W * H
  }
  if (!(vol > 0)) return ''
  return String(Math.round(vol * 1000) / 1000)
}

function pickPieceWeightRow(list: unknown): Record<string, unknown> | null {
  if (!Array.isArray(list) || list.length === 0) return null
  const hit = list.find(
    (row: any) =>
      row &&
      (row.weight || row.length || row.width || row.height),
  )
  return (hit || list[0]) as Record<string, unknown>
}

function pieceWeightScaleListFromResolved(source: string | null, data: any): any[] {
  if (!data || typeof data !== 'object') return []
  if (source === '__INIT_DATA') {
    return data?.data?.['13772573013168']?.data?.pieceWeightScale?.pieceWeightScaleInfo || []
  }
  const fromContext = data?.result?.data?.productPackInfo?.fields?.pieceWeightScale?.pieceWeightScaleInfo
  if (Array.isArray(fromContext) && fromContext.length) return fromContext
  return data?.data?.['13772573013168']?.data?.pieceWeightScale?.pieceWeightScaleInfo || []
}

/** 与 transformRawData 一致：context 用 global…featureAttributes；1688 用 data['13772573013169'] */
function getFeatureAttributeRows(data: any, source: string | null): Array<{ name: string; value: unknown }> {
  if (!data || typeof data !== 'object') return []
  const ctx = data?.result?.global?.globalData?.model?.offerDetail?.featureAttributes
  if (Array.isArray(ctx) && ctx.length) {
    return ctx.map((item: any) => ({
      name: String(item?.name ?? item?.title ?? ''),
      value: item?.value !== undefined && item?.value !== null && item?.value !== '' ? item.value : item?.text,
    }))
  }
  if (source === '__INIT_DATA') {
    const fd = data?.data?.['13772573013169']?.data
    if (Array.isArray(fd)) {
      return fd.map((item: any) => ({
        name: String(item?.name ?? item?.title ?? ''),
        value: item?.value !== undefined && item?.value !== null && item?.value !== '' ? item.value : item?.text,
      }))
    }
  }
  const fd2 = data?.data?.['13772573013169']?.data
  if (Array.isArray(fd2)) {
    return fd2.map((item: any) => ({
      name: String(item?.name ?? item?.title ?? ''),
      value: item?.value !== undefined && item?.value !== null && item?.value !== '' ? item.value : item?.text,
    }))
  }
  return []
}

function featureValueToString(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map((v) => String(v)).join(' ')
  return String(value)
}

/** 从文案中顺序取前三个正数（兼容「35cm*25cm*8cm」「100 200 300」） */
function parseThreeNumbersFromText(text: string): { a: string; b: string; c: string } | null {
  const t = text.replace(/×/g, '*').replace(/，/g, ',')
  const nums = t.match(/\d+(?:[.,]\d+)?/g)
  if (!nums || nums.length < 3) return null
  const x = parseFloat(nums[0].replace(',', '.'))
  const y = parseFloat(nums[1].replace(',', '.'))
  const z = parseFloat(nums[2].replace(',', '.'))
  if (!(x > 0 && y > 0 && z > 0)) return null
  return { a: String(x), b: String(y), c: String(z) }
}

/** 从参数表里解析毛重/重量（克） */
function parseWeightGramsFromText(text: string): string {
  const t = text.trim()
  if (!t) return ''
  const lower = t.toLowerCase()
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|千克|公斤|g|克)?/i)
  if (!m) return ''
  let n = parseFloat(m[1].replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return ''
  const unit = (m[2] || '').toLowerCase()
  if (unit === 'kg' || unit === '千克' || unit === '公斤' || lower.includes('千克') || lower.includes('公斤')) {
    n *= 1000
  }
  return String(Math.round(n))
}

function extractPackagingFromFeatureRows(rows: Array<{ name: string; value: unknown }>): ProfitPackagingHint {
  const out: ProfitPackagingHint = {}
  for (const row of rows) {
    const name = (row.name || '').replace(/\s+/g, '')
    const valRaw = featureValueToString(row.value).trim()
    if (!name || !valRaw) continue

    if (/毛重|包装重量|商品毛重|发货重量|包装重|净重|^重量$|商品重量/.test(name)) {
      const w = parseWeightGramsFromText(valRaw)
      if (w && !out.weightG) out.weightG = w
    }
    if (/尺寸|长宽高|外形尺寸|包装尺寸|体积|容积/.test(name)) {
      const triple = parseThreeNumbersFromText(valRaw)
      if (triple) {
        if (!out.length) out.length = triple.a
        if (!out.width) out.width = triple.b
        if (!out.height) out.height = triple.c
      }
    }
    if (/^(长|长度)/.test(name)) {
      const s = numishToString(valRaw)
      if (s && !out.length) out.length = s
    }
    if (/^(宽|宽度)/.test(name)) {
      const s = numishToString(valRaw)
      if (s && !out.width) out.width = s
    }
    if (/^(高|高度)/.test(name)) {
      const s = numishToString(valRaw)
      if (s && !out.height) out.height = s
    }
  }
  return out
}

function mergePackagingHints(a: ProfitPackagingHint, b: ProfitPackagingHint): ProfitPackagingHint {
  const m: ProfitPackagingHint = {
    weightG: a.weightG || b.weightG,
    length: a.length || b.length,
    width: a.width || b.width,
    height: a.height || b.height,
    volumeCm3: a.volumeCm3 || b.volumeCm3,
  }
  const L = parseFloat(m.length || '')
  const W = parseFloat(m.width || '')
  const H = parseFloat(m.height || '')
  if (
    !m.volumeCm3 &&
    Number.isFinite(L) &&
    Number.isFinite(W) &&
    Number.isFinite(H) &&
    L > 0 &&
    W > 0 &&
    H > 0
  ) {
    m.volumeCm3 = estimateVolumeCm3FromSides(L, W, H)
  }
  const cleaned: ProfitPackagingHint = {}
  if (m.weightG) cleaned.weightG = m.weightG
  if (m.length) cleaned.length = m.length
  if (m.width) cleaned.width = m.width
  if (m.height) cleaned.height = m.height
  if (m.volumeCm3) cleaned.volumeCm3 = m.volumeCm3
  return cleaned
}

/**
 * 从 MAIN 世界返回的 raw 中取首条 SKU 包装信息（重量 / 长宽高 / 估算体积 cm³）。
 * 与 transformRawData 中 pieceWeightScaleInfo 路径一致。
 */
export function extractPackagingFromRawData(rawDataObj: any): ProfitPackagingHint {
  try {
    let source: string | null = null
    let data: any = null

    if (rawDataObj && typeof rawDataObj === 'object') {
      if (rawDataObj.source !== undefined && rawDataObj.data !== undefined) {
        source = rawDataObj.source
        data = rawDataObj.data
      } else if (rawDataObj.globalData) {
        source = '__INIT_DATA'
        data = rawDataObj
      } else if (rawDataObj.result?.data?.Root?.fields?.dataJson) {
        source = 'context'
        data = rawDataObj
      } else {
        data = rawDataObj
      }
    }

    if (!data) return {}

    const list = pieceWeightScaleListFromResolved(source, data)
    const row = pickPieceWeightRow(list)

    let fromScale: ProfitPackagingHint = {}
    if (row) {
      const weightG = numishToString(row.weight)
      const length = numishToString(row.length)
      const width = numishToString(row.width)
      const height = numishToString(row.height)

      const L = parseFloat(length)
      const W = parseFloat(width)
      const H = parseFloat(height)
      const volumeCm3 =
        Number.isFinite(L) && Number.isFinite(W) && Number.isFinite(H) && L > 0 && W > 0 && H > 0
          ? estimateVolumeCm3FromSides(L, W, H)
          : ''

      if (weightG) fromScale.weightG = weightG
      if (length) fromScale.length = length
      if (width) fromScale.width = width
      if (height) fromScale.height = height
      if (volumeCm3) fromScale.volumeCm3 = volumeCm3
    }

    const featRows = getFeatureAttributeRows(data, source)
    const fromFeatures = extractPackagingFromFeatureRows(featRows)

    // 淘宝/Ozon MAIN 里 pieceWeightScaleInfo 常只有空 weight；长宽高多在商品参数里
    return mergePackagingHints(fromScale, fromFeatures)
  } catch (error) {
    console.error('[profitDrawer] 解析包装失败:', error)
    return {}
  }
}
