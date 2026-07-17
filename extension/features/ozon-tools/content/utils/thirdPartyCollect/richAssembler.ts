// 富载荷采集（1688 / 拼多多 / 淘宝 / 拼多多批发）：复用 MAIN 世界数据桥 requestMainWorldWindowData，
// 将统一后的 dataJson（tempModel + skuModel）组装为旧插件 /system/ozonCollect 富载荷。
// 移植自 ozon_old/src/ozon/1688/crawler.js 的 collectAndFormatData / resolve1688SourceData / parseInitDataToDataJson。
// 适配点：
//  1) 新桥返回 { source, data }；
//  2) 主图：原生 1688 取 dataJson.images[].fullPathImageURI，新桥 reshaped（拼多多/淘宝/批发）兜底 gallery.fields.mainImage；
//  3) 富文本图：原生 1688 扫 DOM #description，新桥 reshaped 兜底 data.result.data.detailImages；
//  4) platformType 由调用方按平台覆盖。
import type { CollectGoodData } from './types'

/* ----------------------------- 基础工具 ----------------------------- */

function getRandom(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 生成 6 位随机字母数字本地码（对齐旧插件 getCode） */
function getCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    const type = getRandom(1, 3)
    if (type === 1) code += String.fromCharCode(getRandom(48, 57))
    else if (type === 2) code += String.fromCharCode(getRandom(65, 90))
    else code += String.fromCharCode(getRandom(97, 122))
  }
  return code
}

function normalizeUrl(u: unknown): string {
  if (u == null || u === '') return ''
  let s = String(u)
  if (s.indexOf('//') === 0) s = 'https:' + s
  return s
}

/* ------------------------- __INIT_DATA 归一 ------------------------- */

function findInitDataModule(initData: any, componentType: string): any {
  if (!initData || typeof initData !== 'object') return null
  for (const key of Object.keys(initData)) {
    const mod = initData[key]
    if (mod && mod.componentType === componentType) return mod
  }
  return null
}

/** 将 window.__INIT_DATA 组件化结构归一为与 context.dataJson 相近的形态 */
function parseInitDataToDataJson(initData: any): { dataJson: any; offerDetail: any; orderUrl: string } {
  if (initData?.globalData) {
    const g = initData.globalData
    return {
      dataJson: {
        tempModel: g.tempModel,
        images: Array.isArray(g.images) ? g.images : [],
        skuModel: g.skuModel || null,
        qrCode: g.qrCode || '',
      },
      offerDetail: g.offerDetail || g.model?.offerDetail || null,
      orderUrl: g.qrCode || '',
    }
  }

  const titleMod = findInitDataModule(initData, '@ali/tdmod-kj-od-pc-offer-title')
  const picMod = findInitDataModule(initData, '@ali/tdmod-pc-od-main-pic')
  const priceMod = findInitDataModule(initData, '@ali/tdmod-kj-od-pc-offer-price')
  const attrMod =
    findInitDataModule(initData, '@ali/tdmod-kj-od-pc-attribute-new') ||
    findInitDataModule(initData, '@ali/tdmod-cross-border-helper')

  const title = titleMod?.data?.title || titleMod?.data?.subject || picMod?.data?.subject || ''

  const rawImgUrls = picMod?.data?.mainImage || picMod?.data?.offerImgList || []
  const images = (Array.isArray(rawImgUrls) ? rawImgUrls : [])
    .map((item: any) => {
      if (typeof item === 'string') return { fullPathImageURI: item }
      if (item && item.fullPathImageURI) return item
      return null
    })
    .filter(Boolean)

  const skuMapOriginal = priceMod?.data?.finalPriceModel?.tradeWithoutPromotion?.skuMapOriginal || []
  const skuInfoMap: Record<string, any> = {}
  skuMapOriginal.forEach((item: any) => {
    if (!item || !item.specAttrs) return
    skuInfoMap[item.specAttrs] = {
      specId: item.specId,
      saleCount: item.saleCount,
      discountPrice: item.discountPrice,
      price: item.price,
      specAttrs: item.specAttrs,
      skuId: item.skuId,
      isPromotionSku: item.isPromotionSku,
    }
  })

  const skuKeys = Object.keys(skuInfoMap)
  let skuProps: any[] = []
  const attrList = Array.isArray(attrMod?.data)
    ? attrMod.data
    : Array.isArray(attrMod?.attributes)
      ? attrMod.attributes
      : []

  if (attrList.length > 0 && skuKeys.length > 0) {
    const matched = attrList.find((attr: any) => {
      const values = Array.isArray(attr.values)
        ? attr.values
        : attr.value
          ? String(attr.value).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
          : []
      return values.some((v: string) => skuKeys.includes(v))
    })
    if (matched) {
      const values = Array.isArray(matched.values)
        ? matched.values
        : String(matched.value || '').split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
      skuProps = [{ fid: matched.fid, prop: matched.name || '规格', value: values.map((name: string) => ({ name })) }]
    }
  }
  if (skuProps.length === 0 && skuKeys.length > 0) {
    skuProps = [{ prop: '规格', value: skuKeys.map((name) => ({ name })) }]
  }

  const priceDisplay =
    priceMod?.data?.priceModel?.originalPriceDisplay ||
    priceMod?.data?.finalPriceModel?.tradeWithoutPromotion?.offerPriceDisplay ||
    ''

  const offerId = picMod?.data?.offerId || priceMod?.data?.offerId
  const dataJson = {
    tempModel: { offerTitle: title, offerId },
    images,
    skuModel: { skuInfoMap, skuProps, skuPriceScaleOriginal: priceDisplay },
    qrCode: '',
  }
  const featureAttributes = attrList.map((attr: any) => ({
    fid: attr.fid,
    name: attr.name,
    value: attr.value,
    values: Array.isArray(attr.values)
      ? attr.values
      : attr.value
        ? String(attr.value).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
        : [],
  }))

  return {
    dataJson,
    offerDetail: { featureAttributes },
    orderUrl: typeof window !== 'undefined' ? window.location.href : '',
  }
}

/** 按数据来源解析统一的 dataJson / offerDetail（兼容原生 1688 与新桥 reshaped 结构） */
function resolve1688SourceData(source: string | null, data: any): { dataJson: any; offerDetail: any; orderUrl: string } {
  if (source === '__INIT_DATA') {
    return parseInitDataToDataJson(data)
  }
  const dataJson = data?.Root?.fields?.dataJson || data?.result?.data?.Root?.fields?.dataJson || null
  const offerDetail =
    data?.result?.global?.globalData?.model?.offerDetail ||
    data?.result?.data?.global?.globalData?.model?.offerDetail ||
    dataJson?.offerDetail ||
    null
  return {
    dataJson,
    offerDetail,
    orderUrl: dataJson?.qrCode || (typeof window !== 'undefined' ? window.location.href : ''),
  }
}

/* --------------------------- 富文本详情图 --------------------------- */

/** 采集 1688 商品富文本详情图（仅 #description → shadow #detail），移植自旧插件 collectRichTextImages */
function collectRichTextImages(): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const push = (src: string) => {
    const s = (src || '').trim()
    if (s && !seen.has(s)) {
      seen.add(s)
      urls.push(s)
    }
  }
  const pickImgSrc = (img: Element): string =>
    img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || ''
  const isRichTextImageUrl = (src: string): boolean => {
    if (!src || src.startsWith('data:')) return false
    if (/[-_]rate\.jpg/i.test(src) || /imgextra.*[-_]rate/i.test(src)) return false
    return /alicdn\.com|cbu\d+\.alicdn|1688\.com/i.test(src)
  }
  const shouldSkipImg = (img: Element | null): boolean => {
    if (!img) return true
    if (
      img.closest(
        'table, thead, tbody, tr, td, th, .ant-descriptions, .offer-pack-info-list, .od-pc-offer-table, ' +
          '.video-wapper, .detail-video, video, .price-indication, .statement-content',
      )
    )
      return true
    return !!img.closest('.od-gallery, .od-scroller-list, .img-list-wrapper')
  }
  const pushImg = (img: Element) => {
    if (shouldSkipImg(img)) return
    const src = pickImgSrc(img)
    if (isRichTextImageUrl(src)) push(src)
  }
  const collectFromShadowDetail = (shadowRoot: ShadowRoot) => {
    const detail = shadowRoot.querySelector('#detail')
    if (!detail) return
    detail.querySelectorAll('img').forEach(pushImg)
  }
  const collectFromDescription = (description: Element | null) => {
    if (!description) return
    const htmlDescHosts = description.querySelectorAll('.html-description, [class*="html-description"]')
    if (htmlDescHosts.length > 0) {
      htmlDescHosts.forEach((host) => {
        if ((host as HTMLElement).shadowRoot) collectFromShadowDetail((host as HTMLElement).shadowRoot as ShadowRoot)
      })
      return
    }
    description.querySelectorAll('*').forEach((el) => {
      if ((el as HTMLElement).shadowRoot) collectFromShadowDetail((el as HTMLElement).shadowRoot as ShadowRoot)
    })
  }

  const description =
    document.querySelector('#description[data-module="od_product_description"]') ||
    document.querySelector('#description') ||
    document.querySelector('[data-module="od_product_description"]')

  collectFromDescription(description)

  if (urls.length === 0 && description) {
    description.querySelectorAll('img.desc-img-loaded').forEach(pushImg)
  }
  return urls
}

/** 带重试的富文本图采集（shadow #detail 可能异步注入，对齐旧插件 collectRichTextImagesWithRetry） */
export function collectRichTextImagesWithRetry(maxRetry = 3, delayMs = 500): Promise<string[]> {
  return new Promise((resolve) => {
    const tryCollect = (attempt: number) => {
      const urls = collectRichTextImages()
      if (urls.length > 0 || attempt >= maxRetry - 1) {
        resolve(urls)
        return
      }
      window.setTimeout(() => tryCollect(attempt + 1), delayMs)
    }
    tryCollect(0)
  })
}

/* ----------------------------- 主组装 ----------------------------- */

const parseSpecAttrs = (specAttrs: unknown): string[] => {
  if (!specAttrs || typeof specAttrs !== 'string') return []
  return specAttrs.split(/&gt;|>/).map((s) => s.trim()).filter(Boolean)
}

const SKU_PROP_SORT_INDEX_MISS = 9999

function getSpecPartsForKey(key: string, skuInfoMap: Record<string, any>): string[] {
  const fromMap = skuInfoMap[key]?.specAttrs
  if (typeof fromMap === 'string' && fromMap) return parseSpecAttrs(fromMap)
  return parseSpecAttrs(key)
}

/** 按 skuProps 各维 value 下标排序 skuInfoMap 已有 key（不生成新 key，数据仍从 skuInfoMap 读） */
function sortSkuKeysBySkuProps(skuInfoMap: Record<string, any>, skuProps: any[]): string[] {
  const keys = Object.keys(skuInfoMap)
  if (!keys.length || !skuProps.length) return keys

  const rankOf = (key: string): number[] => {
    const parts = getSpecPartsForKey(key, skuInfoMap)
    return skuProps.map((prop, dimIdx) => {
      const names = (Array.isArray(prop?.value) ? prop.value : [])
        .map((v: any) => v?.name)
        .filter(Boolean) as string[]
      if (!names.length) return 0
      const part = parts[dimIdx] ?? ''
      const idx = names.indexOf(part)
      return idx >= 0 ? idx : SKU_PROP_SORT_INDEX_MISS
    })
  }

  return [...keys].sort((a, b) => {
    const ra = rankOf(a)
    const rb = rankOf(b)
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
      const diff = (ra[i] ?? 0) - (rb[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  })
}

/**
 * 从 MAIN 世界数据桥返回值组装富载荷。
 * @param raw requestMainWorldWindowData() 的返回 { source, data }
 * @param platformType 后端平台编码（覆盖载荷 platformType）
 * @returns 富载荷；无法解析（无 dataJson）时返回 null，由调用方回退 DOM 简单载荷。
 */
export function assembleRichPayloadFromBridge(
  raw: { source: string | null; data: any },
  platformType: number,
  richTextOverride?: string[],
): CollectGoodData | null {
  const source = raw?.source ?? null
  const data = raw?.data
  const { dataJson, offerDetail, orderUrl } = resolve1688SourceData(source, data)
  if (!dataJson) return null

  const title = dataJson?.tempModel?.offerTitle || ''

  // SKU 模型
  const skuModel = dataJson?.skuModel || null
  const skuInfoMap = skuModel?.skuInfoMap && typeof skuModel.skuInfoMap === 'object' ? skuModel.skuInfoMap : null
  const skuProps: any[] = Array.isArray(skuModel?.skuProps) ? skuModel.skuProps : []
  const skuKeys = skuInfoMap ? sortSkuKeysBySkuProps(skuInfoMap, skuProps) : []

  // 找色卡维度（通常是"颜色"），建 colorMap 用于 fileListBt + 主图过滤
  let colorDimIdx = -1
  const colorMap: Record<string, string> = {}
  for (let i = 0; i < skuProps.length; i++) {
    const dim = skuProps[i]
    if (Array.isArray(dim?.value) && dim.value.some((v: any) => v && v.imageUrl)) {
      colorDimIdx = i
      dim.value.forEach((v: any) => {
        if (v && v.name) colorMap[v.name] = v.imageUrl || ''
      })
      break
    }
  }

  // 主图列表：原生 1688 取 dataJson.images（剔除色卡）；reshaped 兜底 gallery.fields.mainImage
  const imagesArray = Array.isArray(dataJson?.images) ? dataJson.images : []
  const colorUrlSet = new Set(Object.values(colorMap).filter((u) => u))
  let mainImgUrls: string[] = imagesArray
    .map((img: any) => img?.fullPathImageURI)
    .filter((url: string) => url && !colorUrlSet.has(url))
  if (mainImgUrls.length === 0) {
    const galleryMain = data?.result?.data?.gallery?.fields?.mainImage
    if (Array.isArray(galleryMain)) {
      mainImgUrls = galleryMain.map((u: unknown) => normalizeUrl(u)).filter(Boolean)
    }
  }
  const mainImage = mainImgUrls[0] || ''
  const images = mainImgUrls.join(';')
  const mainImgsJSON = JSON.stringify(mainImgUrls)

  // goodsSkuList：每个 SKU 一个本地随机码
  const goodsSkuList = JSON.stringify(skuKeys.length > 0 ? skuKeys.map(() => getCode()) : [getCode()])

  // priceList：必须与 goodsSkuList / variantCollection 等长同序（后端按下标把价格对到变体）。
  // 逐个 SKU 取价，缺价用兜底(本 SKU 原价 → 整体基准价低位)占位，绝不 filter 丢长度，否则后端对价错位。
  const fallbackBasePrice =
    skuModel?.skuPriceScaleOriginal != null && String(skuModel.skuPriceScaleOriginal).trim() !== ''
      ? String(skuModel.skuPriceScaleOriginal).split('-')[0]
      : ''
  const pickSkuPrice = (info: any): string => {
    for (const c of [info?.discountPrice, info?.price, fallbackBasePrice]) {
      if (c !== null && c !== undefined && String(c).trim() !== '') return String(c)
    }
    return ''
  }
  const priceArr =
    skuKeys.length > 0 ? skuKeys.map((k) => pickSkuPrice(skuInfoMap[k])) : [fallbackBasePrice]
  const priceList = JSON.stringify(priceArr)

  // variantCollection：每个 SKU 一个 [{prop1:val1, prop2:val2}]
  let variantCollection: string
  if (skuKeys.length > 0) {
    const variantArray = skuKeys.map((key) => {
      const parts = parseSpecAttrs(skuInfoMap[key]?.specAttrs)
      const merged = parts.reduce((acc: Record<string, string>, val, idx) => {
        const propName = skuProps[idx]?.prop || `维度${idx + 1}`
        acc[propName] = val
        return acc
      }, {})
      return [merged]
    })
    variantCollection = JSON.stringify(variantArray)
  } else {
    variantCollection = JSON.stringify([[{}]])
  }

  // fileListBt：xgImages = 该变体色卡 1 张，imgs = 全商品主图轮播
  let fileListBt = '[]'
  if (skuKeys.length > 0 && colorDimIdx >= 0) {
    const fileListBtArray = skuKeys.map((key) => {
      const parts = parseSpecAttrs(skuInfoMap[key]?.specAttrs)
      const colorName = parts[colorDimIdx] || ''
      const colorImage = colorMap[colorName] || ''
      const xgImages = colorImage ? [{ name: colorName || 'Image 1', url: colorImage }] : []
      return { xgImages, imgs: mainImgsJSON }
    })
    fileListBt = JSON.stringify(fileListBtArray)
  }
  if (fileListBt === '[]') {
    const xgImages = mainImgUrls.map((url, idx) => ({ name: `Image ${idx + 1}`, url }))
    const entries =
      skuKeys.length > 0 ? skuKeys.map(() => ({ xgImages, imgs: mainImgsJSON })) : [{ xgImages, imgs: mainImgsJSON }]
    fileListBt = JSON.stringify(entries)
  }

  // 富文本图：reshaped 取 data.result.data.detailImages，原生 1688 扫 DOM
  const detailImagesFromBridge = data?.result?.data?.detailImages
  const richTextList =
    richTextOverride ??
    (Array.isArray(detailImagesFromBridge) && detailImagesFromBridge.length
      ? (detailImagesFromBridge as string[])
      : collectRichTextImages())

  // features：保持与旧插件一致，整组透传给后端（旧版默认 "[]"）
  void offerDetail

  return {
    platformType,
    orderUrl,
    title,
    mainImage,
    images,
    videos: null,
    goodsSkuList,
    priceList,
    fileListBt,
    variantCollection,
    features: '[]',
    richTextList,
  }
}
