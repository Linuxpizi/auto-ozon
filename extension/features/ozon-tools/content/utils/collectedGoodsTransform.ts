/**
 * 采集原始数据 → 工作台 / AI 标准结构（1688 → Ozon）
 *
 * 输入 raw 形态：`{ source: 'context' | '__INIT_DATA', data: ... }`（MAIN 世界 ext-res 同源）
 * 输出：`TransformedGoodsData`（global_data + sku_matrix），可选 `enrichTransformedDataWithImageLists` 补充图片编辑列表
 *
 * 复制到其他项目：复制本文件（建议与 content 脚本、ozonGoodsFeature 等同目录打包），浏览器环境可自动 DOM 采详情图；无 DOM 时传 `collectDetailImages: () => []`
 *
 * @example
 * const title = extractTitleFromRawData(raw)
 * const transformed = transformCollectedRawData(raw, title)
 * if (transformed) enrichTransformedDataWithImageLists(transformed)
 */

/** Ozon 采集富文本暂存，待 JSON富内容 属性加载后写入变体特征 */
export const RICH_ANNOTATION_JSON_PREFILL_KEY = '__mjgd_rich_annotation_json_prefill'

const OFFERID_PREFIX_BASE = 'BCS-A-'
const OFFERID_RANDOM_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'

export type OzonVariantAttrItem = {
  name?: string
  value?: string[] | string
}

export type OzonGoodsRow = {
  sku?: string | number
  variantAttr?: OzonVariantAttrItem[]
  /** /sku/shops 返回的 attributes，用于解析包装长宽高重量 */
  goodsSize?: unknown[]
}

export type CollectedRawInput = {
  source?: string
  data?: unknown
  ozonRows?: OzonGoodsRow[] | null
  rows?: OzonGoodsRow[] | null
  [key: string]: unknown
}

export type SkuImageListItem = {
  url: string
  transformUrl: string
  transformHistory: unknown[]
}

export type SkuMatrixRow = {
  row_id: number
  sku_unique_id: string
  sku_name: string
  specs: Record<string, string>
  price_amount: number
  sale_price: number
  price_currency: string
  stock_quantity: number
  sku_image_url: string
  carousel_images?: string[]
  length: number
  width: number
  height: number
  weight: number
  offerid_prefix: string
  aspect_feature_values: Record<string, unknown>
  skuImgList?: SkuImageListItem[]
}

export type TransformedGoodsData = {
  __instruction__: string
  meta_info: {
    source_url: string
    crawl_timestamp: number
  }
  global_data: {
    product_name: string
    description_clean_text: string
    category_hint: string
    features: Array<{ name: string; value: string }>
    packaging: {
      defaults: {
        weight_g: number
        length_mm: number
        width_mm: number
        height_mm: number
      }
    }
    media_gallery: {
      main_images: string[]
      detail_images: string[]
    }
    [key: string]: unknown
  }
  sku_matrix: SkuMatrixRow[]
  detailImgList?: SkuImageListItem[]
}

export type TransformOptions = {
  /** 默认浏览器 location.href，非浏览器环境需显式传入 */
  sourceUrl?: string
  /** 默认 collectDetailImagesFromDom */
  collectDetailImages?: () => string[]
  /** 默认 generateDefaultOfferidPrefix */
  generateOfferidPrefix?: () => string
}

/** 生成默认货号前缀 BCS-A- + 8 位随机 */
export function generateDefaultOfferidPrefix(): string {
  let tail = ''
  for (let i = 0; i < 8; i++) {
    tail += OFFERID_RANDOM_CHARS[Math.floor(Math.random() * OFFERID_RANDOM_CHARS.length)]
  }
  return `${OFFERID_PREFIX_BASE}${tail}`
}

/** variantAttr 首值，供 Ozon 特征匹配等场景 */
export function extractFirstVariantValue(attr: OzonVariantAttrItem): string {
  const vals = attr?.value
  if (Array.isArray(vals) && vals.length > 0) {
    return String(vals[0] ?? '').trim()
  }
  return String(vals ?? '').trim()
}

/** 从采集 raw 读取 ozon-main 返回的 rows */
export function extractOzonRowsFromRaw(rawDataObj: CollectedRawInput | null | undefined): OzonGoodsRow[] | null {
  if (!rawDataObj || typeof rawDataObj !== 'object') {
    return null
  }
  const pick = (value: unknown): OzonGoodsRow[] | null => {
    if (Array.isArray(value) && value.length > 0) {
      return value as OzonGoodsRow[]
    }
    return null
  }
  const data = rawDataObj.data as CollectedRawInput | undefined
  return (
    pick(rawDataObj.ozonRows) ||
    pick(data?.ozonRows) ||
    pick(data?.rows) ||
    pick(rawDataObj.rows) ||
    null
  )
}

/** 从 ozonRows[].variantAttr 构建 specs（俄文属性名 → 值） */
export function buildSpecsFromOzonVariantAttr(
  variantAttr: OzonVariantAttrItem[] | null | undefined
): Record<string, string> {
  const specs: Record<string, string> = {}
  if (!Array.isArray(variantAttr)) {
    return specs
  }
  variantAttr.forEach((attr) => {
    const name = String(attr?.name ?? '').trim()
    const val = extractFirstVariantValue(attr)
    if (name && val) {
      specs[name] = val
    }
  })
  return specs
}

/**
 * Ozon sku_name 为 title-v1-v2 时，按变体维度数量取末尾值段（title 本身可含连字符）
 */
export function parseOzonSkuNameSpecParts(skuName: string, propCount: number): string[] {
  if (propCount <= 0) {
    return []
  }
  const trimmed = String(skuName ?? '').trim()
  if (!trimmed) {
    return []
  }
  if (trimmed.includes('&gt;')) {
    return trimmed.split('&gt;').map((s) => s.trim()).filter(Boolean)
  }
  const segments = trimmed.split('-').map((s) => s.trim()).filter(Boolean)
  if (segments.length >= propCount) {
    return segments.slice(segments.length - propCount)
  }
  return segments
}

/** 从 MAIN 世界返回的 raw 结构中取 offerTitle */
export function extractTitleFromRawData(rawDataObj: CollectedRawInput | null | undefined): string {
  try {
    let source: string | null = null
    let data: Record<string, unknown> | null = null

    if (rawDataObj && typeof rawDataObj === 'object') {
      if (rawDataObj.source && rawDataObj.data) {
        source = String(rawDataObj.source)
        data = rawDataObj.data as Record<string, unknown>
      } else if ((rawDataObj as { globalData?: unknown }).globalData) {
        source = '__INIT_DATA'
        data = rawDataObj as Record<string, unknown>
      } else if ((rawDataObj as { result?: { data?: { Root?: { fields?: { dataJson?: unknown } } } } }).result?.data?.Root?.fields?.dataJson) {
        source = 'context'
        data = rawDataObj as Record<string, unknown>
      } else {
        data = rawDataObj as Record<string, unknown>
      }
    }

    let globalData: Record<string, unknown> | null = null
    let dataJson: Record<string, unknown> | null = null

    if (source === '__INIT_DATA') {
      globalData = (data?.globalData as Record<string, unknown>) ?? null
    } else if (source === 'context') {
      dataJson = (data?.result as { data?: { Root?: { fields?: { dataJson?: Record<string, unknown> } } } })?.data?.Root?.fields?.dataJson ?? null
    } else if (data) {
      if (data.globalData) {
        globalData = data.globalData as Record<string, unknown>
      } else if ((data.result as { data?: { Root?: { fields?: { dataJson?: Record<string, unknown> } } } })?.data?.Root?.fields?.dataJson) {
        dataJson = (data.result as { data: { Root: { fields: { dataJson: Record<string, unknown> } } } }).data.Root.fields.dataJson
      }
    }

    const tempModel = (obj: Record<string, unknown> | null) =>
      (obj?.tempModel as { offerTitle?: string } | undefined)?.offerTitle || ''

    let title = ''
    if (source === '__INIT_DATA' && globalData) {
      title = tempModel(globalData)
    } else if (source === 'context' && dataJson) {
      title = tempModel(dataJson)
    } else if (globalData) {
      title = tempModel(globalData)
    } else if (dataJson) {
      title = tempModel(dataJson)
    }

    return title.trim()
  } catch (error) {
    console.error('[collectedGoodsTransform] 解析标题失败:', error)
    return ''
  }
}

/** 采集 1688 页面详情图片（DOM） */
export function collectDetailImagesFromDom(): string[] {
  if (typeof document === 'undefined') {
    return []
  }

  const detailImages: string[] = []

  // 方式1: 从 .content-detail 采集
  document.querySelectorAll('.content-detail img').forEach((img: Element) => {
    const imgElement = img as HTMLImageElement
    const url = imgElement.getAttribute('data-lazyload-src') || imgElement.getAttribute('src')
    if (url && !url.includes('assets/')) {
      let fullUrl = url
      if (url.startsWith('//')) {
        fullUrl = `https:${url}`
      } else if (url.startsWith('/') && typeof window !== 'undefined') {
        fullUrl = `${window.location.origin}${url}`
      }
      if (fullUrl && !detailImages.includes(fullUrl)) {
        detailImages.push(fullUrl)
      }
    }
  })

  // 方式2: Shadow DOM 内 .html-description
  const descElements = document.querySelectorAll('.html-description')
  descElements.forEach((el) => {
    if (el.shadowRoot) {
      el.shadowRoot.querySelectorAll('img[src]').forEach((img) => {
        const imgElement = img as HTMLImageElement
        const url = imgElement.getAttribute('data-src') || imgElement.src
        let processedUrl = url
        if (url && url.startsWith('//')) {
          processedUrl = `https:${url}`
        } else if (url && url.startsWith('/') && typeof window !== 'undefined') {
          processedUrl = `${window.location.origin}${url}`
        }
        if (
          processedUrl &&
          !processedUrl.includes('assets/') &&
          !processedUrl.includes('grey.gif') &&
          !detailImages.includes(processedUrl)
        ) {
          detailImages.push(processedUrl)
        }
      })
    }
  })

  return detailImages
}

function resolveDefaultSourceUrl(): string {
  if (typeof window !== 'undefined' && window.location?.href) {
    return window.location.href
  }
  return ''
}

/**
 * 转换原始数据为工作台标准格式（支持 context 与 __INIT_DATA）
 */
export function transformCollectedRawData(
  rawDataObj: CollectedRawInput,
  title: string,
  options?: TransformOptions
): TransformedGoodsData | null {
  const collectDetailImages = options?.collectDetailImages ?? collectDetailImagesFromDom
  const generateOfferidPrefix = options?.generateOfferidPrefix ?? generateDefaultOfferidPrefix
  const sourceUrl = options?.sourceUrl ?? resolveDefaultSourceUrl()

  try {
    const source = rawDataObj.source || 'context'
    const data = (rawDataObj.data ?? rawDataObj) as Record<string, unknown>

    let features: Array<{ name: string; value: string }> = []
    let mainImages: string[] = []
    let skuInfoMap: Record<string, Record<string, unknown>> = {}
    let skuProps: Array<{ id?: number; prop?: string; value?: Array<{ name?: string; imageUrl?: string }> }> = []
    let pieceWeightScaleInfo: Array<{ skuId?: string; length?: number; width?: number; height?: number; weight?: number }> = []
    let defaultPrice = 0

    if (source === 'context') {
      const result = data?.result as Record<string, unknown> | undefined
      const featureAttributes =
        (result?.global as { globalData?: { model?: { offerDetail?: { featureAttributes?: Array<{ name?: string; value?: unknown }> } } } })
          ?.globalData?.model?.offerDetail?.featureAttributes || []
      features = featureAttributes
        .map((item) => {
          let value: unknown = item.value
          if (Array.isArray(value)) {
            value = value.length <= 1 ? (value[0] ?? '') : value
          }
          return {
            name: item.name || '',
            value: String(value ?? ''),
          }
        })
        .filter((item) => item.name && item.value !== '' && item.value != null)

      mainImages =
        ((result?.data as { gallery?: { fields?: { mainImage?: string[] } } })?.gallery?.fields?.mainImage) || []

      const dataJson = (result?.data as { Root?: { fields?: { dataJson?: { skuModel?: { skuInfoMap?: Record<string, Record<string, unknown>>; skuProps?: typeof skuProps } } } } })
        ?.Root?.fields?.dataJson
      skuInfoMap = dataJson?.skuModel?.skuInfoMap || {}
      skuProps = dataJson?.skuModel?.skuProps || []
      pieceWeightScaleInfo =
        ((result?.data as { productPackInfo?: { fields?: { pieceWeightScale?: { pieceWeightScaleInfo?: typeof pieceWeightScaleInfo } } } })
          ?.productPackInfo?.fields?.pieceWeightScale?.pieceWeightScaleInfo) || []
      defaultPrice =
        ((result?.data as { mainPrice?: { fields?: { finalPriceModel?: { tradeWithoutPromotion?: { offerMaxPrice?: number } } } } })
          ?.mainPrice?.fields?.finalPriceModel?.tradeWithoutPromotion?.offerMaxPrice) || 0

      // 针对没有 sku 的情况
      if (Object.keys(skuInfoMap).length === 0) {
        const singlePrice =
          ((result?.data as { Root?: { fields?: { orderParamModel?: { orderParam?: { skuParam?: { skuRangePrices?: Array<{ price?: number }> } } } } } })
            ?.Root?.fields?.orderParamModel?.orderParam?.skuParam?.skuRangePrices?.[0]?.price) || 0
        skuInfoMap[title] = {
          specAttrs: title,
          discountPrice: singlePrice,
        }
        const skuImageList = mainImages.map((item) => ({
          imageUrl: item,
          name: title,
        }))
        skuProps = [
          {
            id: 3216,
            prop: '颜色',
            value: skuImageList,
          },
        ]
      }
    } else if (source === '__INIT_DATA') {
      const featureData = ((data?.data as Record<string, { data?: Array<{ name?: string; value?: string }> }>)?.['13772573013169']?.data) || []
      features = featureData
        .map((item) => ({
          name: item.name || '',
          value: item.value || '',
        }))
        .filter((item) => item.name && item.value)

      const imgs = ((data?.globalData as { images?: Array<{ fullPathImageURI?: string }> })?.images) || []
      mainImages = imgs.map((item) => item.fullPathImageURI).filter((u): u is string => Boolean(u))

      const globalData = data?.globalData as { skuModel?: { skuInfoMap?: typeof skuInfoMap; skuProps?: typeof skuProps } } | undefined
      skuInfoMap = globalData?.skuModel?.skuInfoMap || {}
      skuProps = globalData?.skuModel?.skuProps || []
      pieceWeightScaleInfo =
        ((data?.data as Record<string, { data?: { pieceWeightScale?: { pieceWeightScaleInfo?: typeof pieceWeightScaleInfo } } }>)?.['13772573013168']?.data
          ?.pieceWeightScale?.pieceWeightScaleInfo) || []
    } else {
      console.warn('不支持的数据源:', source)
      return null
    }

    const ozonRowsForSpecs = extractOzonRowsFromRaw(rawDataObj)
    const ozonRowBySkuId = new Map<string, OzonGoodsRow>()
    if (ozonRowsForSpecs?.length) {
      ozonRowsForSpecs.forEach((row) => {
        const skuId = String(row?.sku ?? '').trim()
        if (skuId) {
          ozonRowBySkuId.set(skuId, row)
        }
      })
    }

    const skuMatrix: SkuMatrixRow[] = Object.entries(skuInfoMap).map(([skuName, skuInfo], index) => {
      const specs: Record<string, string> = {}
      const skuId = String(skuInfo?.skuId ?? '').trim()
      const ozonRow = skuId ? ozonRowBySkuId.get(skuId) : undefined
      const specsFromVariantAttr = buildSpecsFromOzonVariantAttr(ozonRow?.variantAttr)
      if (Object.keys(specsFromVariantAttr).length > 0) {
        Object.assign(specs, specsFromVariantAttr)
      } else if (skuProps && skuProps.length > 0) {
        const skuNameParts = skuName.includes('&gt;')
          ? skuName.split('&gt;').map((s) => s.trim())
          : parseOzonSkuNameSpecParts(skuName, skuProps.length)

        skuProps.forEach((prop, propIndex) => {
          if (prop.prop && skuNameParts[propIndex]) {
            specs[prop.prop] = skuNameParts[propIndex]
          }
        })
      }

      let skuImageUrl = ''
      if (skuProps && skuProps.length > 0) {
        const firstProp = skuProps[0]
        if (firstProp.value && Array.isArray(firstProp.value)) {
          const matchedValue = firstProp.value.find(
            (v) => v.name === skuName || v.name === skuName.split('&gt;')[0]
          )
          if (matchedValue?.imageUrl) {
            skuImageUrl = matchedValue.imageUrl
          }
        }
      }
      if (!skuImageUrl && skuProps.length > 1) {
        const secondProp = skuProps[1]
        if (secondProp.value && Array.isArray(secondProp.value)) {
          const matchedValue = secondProp.value.find(
            (v) => v.name === skuName || v.name === skuName.split('&gt;')[1]
          )
          if (matchedValue?.imageUrl) {
            skuImageUrl = matchedValue.imageUrl
          }
        }
      }
      if (!skuImageUrl) {
        skuImageUrl = String(skuInfo.skuImg ?? '')
      }

      const ozonSkuImages: string[] = Array.isArray(skuInfo.images)
        ? (skuInfo.images as string[]).filter((url) => Boolean(url))
        : []
      if (ozonSkuImages.length > 0 && !skuImageUrl) {
        skuImageUrl = ozonSkuImages[0]
      }
      if (!skuImageUrl && mainImages.length > 0) {
        skuImageUrl = mainImages[0]
      }

      const packInfo = pieceWeightScaleInfo.find((info) => info.skuId === skuInfo.skuId)
      const priceAmount = Number(skuInfo.discountPrice ?? defaultPrice)

      return {
        row_id: index + 1,
        sku_unique_id: String(skuInfo.skuId ?? ''),
        sku_name: skuName,
        specs,
        price_amount: priceAmount,
        sale_price: priceAmount,
        price_currency: 'CNY',
        stock_quantity: Number(skuInfo.canBookCount ?? 0),
        sku_image_url: skuImageUrl,
        ...(ozonSkuImages.length > 0 ? { carousel_images: ozonSkuImages } : {}),
        length: packInfo?.length || 0,
        width: packInfo?.width || 0,
        height: packInfo?.height || 0,
        weight: packInfo?.weight || 0,
        offerid_prefix: generateOfferidPrefix(),
        aspect_feature_values: {},
      }
    })

    const result = data?.result as Record<string, unknown> | undefined
    let detailImages = result?.detailImages as string[] | undefined
    if (!detailImages) {
      detailImages = collectDetailImages()
    }

    let richAnnotationJsonPrefill = ''
    if (source === 'context') {
      richAnnotationJsonPrefill = String(result?.richAnnotationJson ?? '').trim()
      if (!richAnnotationJsonPrefill) {
        for (const info of Object.values(skuInfoMap)) {
          const candidate = String(info?.richAnnotationJson ?? '').trim()
          if (candidate) {
            richAnnotationJsonPrefill = candidate
            break
          }
        }
      }
    }

    const transformed: TransformedGoodsData = {
      __instruction__: '1688 -> Ozon',
      meta_info: {
        source_url: sourceUrl,
        crawl_timestamp: Date.now(),
      },
      global_data: {
        product_name: title || '',
        description_clean_text: String(result?.description ?? ''),
        category_hint: '',
        ...(richAnnotationJsonPrefill
          ? { [RICH_ANNOTATION_JSON_PREFILL_KEY]: richAnnotationJsonPrefill }
          : {}),
        features,
        packaging: {
          defaults: {
            weight_g: 0,
            length_mm: 0,
            width_mm: 0,
            height_mm: 0,
          },
        },
        media_gallery: {
          main_images: mainImages,
          detail_images: detailImages,
        },
      },
      sku_matrix: skuMatrix,
    }

    return transformed
  } catch (error) {
    console.error('数据转换失败:', error)
    return null
  }
}

/** 从 skuImgList 提取有序图片 URL（优先 transformUrl，供保存/提交） */
function collectOrderedUrlsFromSkuImgList(
  skuImgList: SkuImageListItem[] | undefined,
): string[] {
  if (!Array.isArray(skuImgList) || !skuImgList.length) return []
  const urls: string[] = []
  const seen = new Set<string>()
  for (const item of skuImgList) {
    const url = String(item?.transformUrl || item?.url || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

/**
 * 保存前将 skuImgList 顺序写回 sku_image_url / carousel_images，
 * 避免 enrich 重载时用旧 canonical 字段覆盖用户拖拽顺序
 */
export function syncSkuImagesFromImgListToTransformed(
  transformed: TransformedGoodsData | null | undefined,
): void {
  if (!transformed) return
  const skuMatrix = transformed.sku_matrix || []
  if (!Array.isArray(skuMatrix)) return

  skuMatrix.forEach((sku) => {
    const urls = collectOrderedUrlsFromSkuImgList(sku.skuImgList)
    if (!urls.length) return

    const hasPerSkuCarousel = Array.isArray(sku.carousel_images) && sku.carousel_images.length > 0
    sku.sku_image_url = urls[0]!
    if (hasPerSkuCarousel) {
      // 与 enrich 对称：主图 + 轮播，其余写入 carousel_images
      sku.carousel_images = urls.slice(1).filter((url) => url !== sku.sku_image_url)
    }
    // 共用 main_images 的变体仅更新 sku_image_url，不改全局 main_images，避免影响其他变体
  })

  const detailList = transformed.detailImgList
  if (Array.isArray(detailList) && detailList.length > 0) {
    const detailUrls = collectOrderedUrlsFromSkuImgList(detailList)
    if (detailUrls.length > 0) {
      transformed.global_data = transformed.global_data || ({} as TransformedGoodsData['global_data'])
      transformed.global_data.media_gallery = transformed.global_data.media_gallery || {
        main_images: [],
        detail_images: [],
      }
      transformed.global_data.media_gallery.detail_images = detailUrls
    }
  }
}

/** 规范化 Ozon 图片 URL 用于 skuImgList 去重（strip ?/#、wc 尺寸段） */
function normalizeSkuImgUrlForDedup(url: string): string {
  const base = String(url || '').split('?')[0].split('#')[0]
  return base.replace(/\/wc\d+\//, '/')
}

/** 按规范化 URL 去重保序写入 skuImgList */
function pushUniqueSkuImgUrl(skuImgList: string[], seen: Set<string>, url: string): void {
  const trimmed = String(url || '').trim()
  if (!trimmed) return
  const key = normalizeSkuImgUrlForDedup(trimmed)
  if (seen.has(key)) return
  seen.add(key)
  skuImgList.push(trimmed)
}

/** 为 transformed 补充 skuImgList / detailImgList，供工作台图片管理 */
export function enrichTransformedDataWithImageLists(transformed: TransformedGoodsData | null | undefined): void {
  if (!transformed) return
  const mediaGallery = transformed.global_data?.media_gallery || { main_images: [], detail_images: [] }
  const skuMatrix = transformed.sku_matrix || []
  if (skuMatrix && Array.isArray(skuMatrix)) {
    skuMatrix.forEach((sku) => {
      // 已有编辑结果时保留顺序与改图状态，避免重开商品时被 carousel_images 冲掉
      if (Array.isArray(sku.skuImgList) && sku.skuImgList.length > 0) {
        return
      }
      const hasPerSkuCarousel = Array.isArray(sku.carousel_images) && sku.carousel_images.length > 0
      const skuImgList: string[] = []
      const seenUrls = new Set<string>()
      if (hasPerSkuCarousel) {
        pushUniqueSkuImgUrl(skuImgList, seenUrls, sku.sku_image_url || '')
        sku.carousel_images!.forEach((url) => {
          pushUniqueSkuImgUrl(skuImgList, seenUrls, url)
        })
      } else {
        pushUniqueSkuImgUrl(skuImgList, seenUrls, sku.sku_image_url || '')
        mediaGallery.main_images?.forEach((url) => {
          pushUniqueSkuImgUrl(skuImgList, seenUrls, url)
        })
      }
      sku.skuImgList = skuImgList.map((url) => ({
        url,
        transformUrl: url,
        transformHistory: [],
      }))
    })
  }
  // 已有详情图编辑列表时跳过重建
  if (Array.isArray(transformed.detailImgList) && transformed.detailImgList.length > 0) {
    return
  }
  const detailImages = transformed.global_data?.media_gallery?.detail_images || []
  if (detailImages && Array.isArray(detailImages)) {
    transformed.detailImgList = detailImages.map((url) => ({
      url,
      transformUrl: url,
      transformHistory: [],
    }))
  }
}
