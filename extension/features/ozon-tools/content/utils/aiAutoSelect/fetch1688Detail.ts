/**
 * 1688 详情页：经 background 代理拉取 HTML、提取 transform context、解析详情描述图
 */
import { proxyFetchText } from '../../../utils/proxyFetch'
import { hasExtensionMessaging } from '../../../utils/runtime'

// ── 代理请求 ──────────────────────────────────────────────────

async function sendProxiedFetch(url: string, logLabel: string): Promise<string | null> {
  if (!hasExtensionMessaging()) {
    console.warn('[aiAutoSelect] chrome.runtime 不可用，无法代理详情请求')
    return null
  }

  try {
    const html = await proxyFetchText(url, { preset: '1688' })
    // itemcdn offer_details 脚本体可能很短，不能用详情页 100 字节下限
    const isOfferDetailsCdn = url.includes('itemcdn.tmall.com')
    const minLength = isOfferDetailsCdn ? 1 : 100
    if (!html || html.length < minLength) {
      console.warn('[aiAutoSelect] 详情页内容为空', logLabel)
      return null
    }
    return html
  } catch (error) {
    console.warn('[aiAutoSelect] 代理请求失败', logLabel, error)
    return null
  }
}

/** 经 background 代理拉取任意 1688 相关 URL（详情页、itemcdn 详情描述等） */
export function fetch1688ProxiedUrl(url: string): Promise<string | null> {
  const trimmed = String(url || '').trim()
  if (!trimmed) return Promise.resolve(null)
  return sendProxiedFetch(trimmed, trimmed)
}

export function fetch1688DetailHtml(offerId: string): Promise<string | null> {
  const detailUrl = `https://detail.1688.com/offer/${offerId}.html?offerId=${offerId}`
  return sendProxiedFetch(detailUrl, offerId)
}

// ── HTML 字段提取（精简 context） ─────────────────────────────

/**
 * 从 1688 详情 HTML 按需提取 transform 所需字段，组装为与 pdd-main 同形的精简 context
 * 避免整段 window.context 含非法 JS 对象字面量（如 skuWeight:{6239966623890:0.26}）导致 JSON.parse 失败
 */

type FeatureAttribute = { name?: string; value?: unknown; values?: unknown[] }
type SkuPropValue = { name?: string; imageUrl?: string }
type SkuProp = { id?: number; prop?: string; value?: SkuPropValue[] }
type SkuInfoEntry = {
  skuId?: number | string
  discountPrice?: string | number
  canBookCount?: number
  skuImg?: string
  specAttrs?: string
  images?: string[]
}
type PieceWeightScaleItem = {
  skuId?: number | string
  length?: number
  width?: number
  height?: number
  weight?: number
}

export type Slim1688Context = {
  result: {
    data: {
      Root: {
        fields: {
          dataJson: {
            tempModel: { offerTitle: string }
            skuModel: {
              skuInfoMap: Record<string, SkuInfoEntry>
              skuProps: SkuProp[]
            }
          }
          orderParamModel?: {
            orderParam?: {
              skuParam?: {
                skuRangePrices?: Array<{ price?: number | string }>
              }
            }
          }
        }
      }
      mainPrice: {
        fields: {
          finalPriceModel: {
            tradeWithoutPromotion: { offerMaxPrice: number }
          }
        }
      }
      gallery: {
        fields: { mainImage: string[] }
      }
      productPackInfo: {
        fields: {
          pieceWeightScale: { pieceWeightScaleInfo: PieceWeightScaleItem[] }
        }
      }
    }
    global: {
      globalData: {
        model: {
          offerDetail: { featureAttributes: FeatureAttribute[] }
        }
      }
    }
    detailImages?: string[]
    description?: string
  }
}

/** 括号平衡截取（支持字符串内的括号） */
function extractBalancedSlice(
  source: string,
  openIndex: number,
  openChar: '{' | '[' | '(',
): string | null {
  const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : ')'
  let depth = 0
  let inString = false
  let stringChar = ''
  let escaped = false

  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === stringChar) inString = false
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      continue
    }

    if (ch === openChar) depth += 1
    else if (ch === closeChar) {
      depth -= 1
      if (depth === 0) return source.slice(openIndex, i + 1)
    }
  }
  return null
}

/** 解析 JS 字面量
 * @param literal 字面量
 * @returns 解析 JS 字面量
 */
function parseJsLiteral<T>(literal: string): T | null {
  if (!literal) return null
  try {
    return JSON.parse(literal) as T
  } catch {
    try {
      // eslint-disable-next-line no-new-func
      return new Function(`return (${literal})`)() as T
    } catch {
      return null
    }
  }
}

/** 按 key 提取 JSON 数组或对象（取 HTML 中首次匹配） */
function extractByKey(html: string, key: string, open: '{' | '['): unknown | null {
  const openPattern = open === '{' ? '\\{' : '\\['
  const re = new RegExp(`"${key}"\\s*:\\s*${openPattern}`)
  const match = re.exec(html)
  if (!match) return null
  const openIndex = html.indexOf(open, match.index)
  if (openIndex === -1) return null
  const slice = extractBalancedSlice(html, openIndex, open)
  if (!slice) return null
  return parseJsLiteral(slice)
}

/** 提取字符串
 * @param html HTML
 * @param key 键
 * @returns 提取字符串
 */
function extractStringByKey(html: string, key: string): string {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`)
  const match = re.exec(html)
  if (!match?.[1]) return ''
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

/** 提取数字
 * @param html HTML
 * @param key 键
 * @returns 提取数字
 */
function extractNumberByKey(html: string, key: string): number {
  const re = new RegExp(`"${key}"\\s*:\\s*([\\d.]+)`)
  const match = re.exec(html)
  if (!match?.[1]) return 0
  const n = parseFloat(match[1])
  return Number.isNaN(n) ? 0 : n
}

/** 提取字符串数组
 * @param html HTML
 * @param key 键
 * @returns 提取字符串数组
 */
function extractStringArrayByKey(html: string, key: string): string[] {
  const raw = extractByKey(html, key, '[')
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

/** 提取 SKU 信息
 * @param raw 原始数据
 * @returns 提取 SKU 信息
 */
function slimSkuInfoMap(raw: unknown): Record<string, SkuInfoEntry> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, SkuInfoEntry> = {}
  for (const [name, info] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    if (!info || typeof info !== 'object') continue
    const entry: SkuInfoEntry = {}
    if (info.skuId != null) entry.skuId = info.skuId as number | string
    if (info.discountPrice != null) entry.discountPrice = info.discountPrice as string | number
    if (info.canBookCount != null) entry.canBookCount = Number(info.canBookCount)
    if (typeof info.skuImg === 'string') entry.skuImg = info.skuImg
    if (typeof info.specAttrs === 'string') entry.specAttrs = info.specAttrs
    if (Array.isArray(info.images)) {
      entry.images = info.images.filter((u): u is string => typeof u === 'string')
    }
    out[name] = entry
  }
  return out
}

/** 提取 SKU 属性
 * @param raw 原始数据
 * @returns 提取 SKU 属性
 */
function slimSkuProps(raw: unknown): SkuProp[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const prop = item as SkuProp
    const values = Array.isArray(prop.value)
      ? prop.value.map((v) => ({
          name: v?.name,
          imageUrl: v?.imageUrl,
        }))
      : []
    return {
      id: prop.id,
      prop: prop.prop,
      value: values,
    }
  })
}

/** 提取特征属性
 * @param raw 原始数据
 * @returns 提取特征属性
 */
function slimFeatureAttributes(raw: unknown): FeatureAttribute[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const row = item as FeatureAttribute
      return { name: row.name, value: row.value, values: row.values }
    })
    .filter((item) => item.name)
}

function slimPieceWeightScaleInfo(raw: unknown): PieceWeightScaleItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const row = item as PieceWeightScaleItem
    return {
      skuId: row.skuId,
      length: row.length,
      width: row.width,
      height: row.height,
      weight: row.weight,
    }
  })
}

/**
 * 从详情 HTML 组装 transformCollectedRawData 所需的最小 context
 */
export function buildSlim1688ContextFromHtml(html: string): Slim1688Context | null {
  if (!html || typeof html !== 'string') return null

  const offerTitle =
    extractStringByKey(html, 'offerTitle') ||
    extractStringByKey(html, 'subject') ||
    ''

  const featureAttributes = slimFeatureAttributes(
    extractByKey(html, 'featureAttributes', '['),
  )
  const mainImage = extractStringArrayByKey(html, 'mainImage')
  const skuInfoMap = slimSkuInfoMap(extractByKey(html, 'skuInfoMap', '{'))
  const skuProps = slimSkuProps(extractByKey(html, 'skuProps', '['))
  const pieceWeightScaleInfo = slimPieceWeightScaleInfo(
    extractByKey(html, 'pieceWeightScaleInfo', '['),
  )

  let offerMaxPrice = extractNumberByKey(html, 'offerMaxPrice')
  if (!offerMaxPrice) {
    offerMaxPrice = extractNumberByKey(html, 'skuPriceScale')
  }

  const detailImages = extractStringArrayByKey(html, 'detailImages')
  // const description = extractStringByKey(html, 'description') //1688没有描述

  // 无 SKU 时 transform 会读 skuRangePrices，只提取该数组避免整段 orderParamModel 含非法字段
  let orderParamModel: Slim1688Context['result']['data']['Root']['fields']['orderParamModel']
  if (Object.keys(skuInfoMap).length === 0) {
    const skuRangePrices = extractByKey(html, 'skuRangePrices', '[') as
      | Array<{ price?: number | string }>
      | null
    if (Array.isArray(skuRangePrices) && skuRangePrices.length > 0) {
      orderParamModel = {
        orderParam: {
          skuParam: { skuRangePrices },
        },
      }
    }
  }

  if (
    !offerTitle &&
    mainImage.length === 0 &&
    Object.keys(skuInfoMap).length === 0 &&
    featureAttributes.length === 0
  ) {
    return null
  }

  const slim: Slim1688Context = {
    result: {
      data: {
        Root: {
          fields: {
            dataJson: {
              tempModel: { offerTitle },
              skuModel: { skuInfoMap, skuProps },
            },
            ...(orderParamModel ? { orderParamModel } : {}),
          },
        },
        mainPrice: {
          fields: {
            finalPriceModel: {
              tradeWithoutPromotion: { offerMaxPrice },
            },
          },
        },
        gallery: {
          fields: { mainImage },
        },
        productPackInfo: {
          fields: {
            pieceWeightScale: { pieceWeightScaleInfo },
          },
        },
      },
      global: {
        globalData: {
          model: {
            offerDetail: { featureAttributes },
          },
        },
      },
      ...(detailImages.length > 0 ? { detailImages } : {}),
      // ...(description ? { description } : {}), //1688没有描述
    },
  }

  return slim
}

// ── 详情描述图 ────────────────────────────────────────────────

const DETAIL_URL_KEY_RE = /"detailUrl"\s*:\s*"((?:\\.|[^"\\])*)"/g
const OFFER_DETAILS_RE = /offer_details\s*=\s*(\{[\s\S]*\})\s*;?\s*$/

/** 只认 itemcdn 详情描述 CDN，避免误取 creditdetailUrl 等同名字段 */
function isDescriptionDetailCdnUrl(url: string): boolean {
  return url.includes('itemcdn.tmall.com') || url.includes('1688offer')
}

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

/**
 * 从详情页 HTML 提取 description.fields.detailUrl（itemcdn CDN 地址）
 */
export function extractDescriptionDetailUrl(html: string): string {
  if (!html) return ''

  let match: RegExpExecArray | null
  DETAIL_URL_KEY_RE.lastIndex = 0
  while ((match = DETAIL_URL_KEY_RE.exec(html)) !== null) {
    const url = unescapeJsonString(match[1] || '').trim()
    if (url && isDescriptionDetailCdnUrl(url)) {
      return url
    }
  }
  return ''
}

/**
 * 解析 itemcdn 返回的 var offer_details={...} 脚本体
 */
export function parseOfferDetailsResponse(text: string): { content?: string } | null {
  if (!text) return null

  const trimmed = text.trim()
  const match = OFFER_DETAILS_RE.exec(trimmed) || trimmed.match(/offer_details\s*=\s*(\{[\s\S]*\})/)
  if (!match?.[1]) return null

  const parsed = parseJsLiteral<{ content?: string }>(match[1])
  if (!parsed || typeof parsed !== 'object') return null
  return parsed
}

/**
 * 规范化详情图 URL，过滤占位图
 */
export function normalizeDetailImageUrl(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''

  let fullUrl = trimmed
  if (fullUrl.startsWith('//')) {
    fullUrl = `https:${fullUrl}`
  }

  if (
    fullUrl.includes('grey.gif') ||
    fullUrl.includes('assets/') ||
    !/^https?:\/\//i.test(fullUrl)
  ) {
    return ''
  }

  return fullUrl
}

/**
 * 从 offer_details.content HTML 中提取所有 img src（DOMParser 处理嵌套转义更可靠）
 */
export function extractImgSrcFromHtmlContent(htmlContent: string): string[] {
  if (!htmlContent || typeof DOMParser === 'undefined') {
    return []
  }

  const doc = new DOMParser().parseFromString(htmlContent, 'text/html')
  const images: string[] = []
  const seen = new Set<string>()

  doc.querySelectorAll('img').forEach((img) => {
    const candidates = [
      img.getAttribute('src'),
      img.getAttribute('data-src'),
      img.getAttribute('data-lazyload-src'),
    ]
    for (const raw of candidates) {
      const normalized = normalizeDetailImageUrl(raw || '')
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized)
        images.push(normalized)
        break
      }
    }
  })

  return images
}

/**
 * 从详情页 HTML 拉取并解析详情描述图列表
 * 失败时返回空数组，不阻断主流程
 */
export async function fetch1688OfferDetailImages(detailPageHtml: string): Promise<string[]> {
  const cdnUrl = extractDescriptionDetailUrl(detailPageHtml)
  if (!cdnUrl) {
    return []
  }

  const responseText = await fetch1688ProxiedUrl(cdnUrl)
  if (!responseText) {
    console.warn('[aiAutoSelect] 详情描述 CDN 请求失败', cdnUrl)
    return []
  }

  const offerDetails = parseOfferDetailsResponse(responseText)
  const content = String(offerDetails?.content ?? '').trim()
  if (!content) {
    console.warn('[aiAutoSelect] offer_details.content 为空', cdnUrl)
    return []
  }

  const images = extractImgSrcFromHtmlContent(content)
  if (images.length === 0) {
    console.warn('[aiAutoSelect] 详情描述中未解析到图片', cdnUrl)
  }
  return images
}

// ── 对外 API ──────────────────────────────────────────────────

/**
 * 从 1688 详情页 HTML 提取 transform 所需的最小 context（非整段 window.context）
 */
export function parse1688ContextFromHtml(html: string): Record<string, unknown> | null {
  const slim = buildSlim1688ContextFromHtml(html)
  if (!slim) {
    console.warn('[aiAutoSelect] parse1688ContextFromHtml: 未能提取有效商品字段')
    return null
  }
  return slim as unknown as Record<string, unknown>
}
