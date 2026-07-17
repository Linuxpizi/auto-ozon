/** 详情页 DOM 上下文：SKU、贴卡容器、主图 */

/** 从 webDetailSKU 组件解析当前商品 SKU */
export function extractDetailPageSku(): string | null {
  const el = document.querySelector('[data-widget="webDetailSKU"]')
  const text = el?.textContent || ''
  const m = text.match(/\d{7,}/)
  return m?.[0] || null
}

/** 详情页贴卡容器：webSale 的父节点（与旧版 findTargetContainer 一致） */
export function findDetailCardHost(): HTMLElement | null {
  const webSale = document.querySelector('div[data-widget="webSale"]')
  const parent = webSale?.parentElement
  if (parent && parent instanceof HTMLElement) return parent
  return null
}

/** 详情页主图（跳过视频缩略图） */
export function extractDetailProductImage(): string | undefined {
  const candidates = [
    document.querySelector('div[data-index="0"] img'),
    document.querySelector('div[data-index="1"] img'),
  ]
  for (const img of candidates) {
    const src = img?.getAttribute('src') || ''
    if (src && !src.includes('video')) return src
  }
  return undefined
}

export interface DetailVariant {
  sku: string
  /** webAspects 中该变体的现价原文（如 "1 234 ₽"），可能为空 */
  priceText: string
}

/**
 * 从详情页 webAspects DOM 解析当前商品的全部变体（SKU + 现价原文，按 SKU 去重）。
 * 对齐旧版 parseAspectsFromStateObject 的数据结构；单变体商品无 webAspects 时返回空数组。
 */
export function collectDetailVariants(): DetailVariant[] {
  const out: DetailVariant[] = []
  const seen = new Set<string>()
  const nodes = document.querySelectorAll<HTMLElement>("[id*='state-webAspects']")
  for (const node of nodes) {
    // 排除急速上架弹窗的 webAspectsModal，避免混入其他商品变体
    if ((node.id || '').includes('Modal')) continue
    let state: any = null
    try {
      state = JSON.parse(node.getAttribute('data-state') || '')
    } catch {
      continue
    }
    const aspects = state && Array.isArray(state.aspects) ? state.aspects : []
    for (const aspect of aspects) {
      const variants = aspect && Array.isArray(aspect.variants) ? aspect.variants : []
      for (const v of variants) {
        const sku = v && v.sku != null ? String(v.sku).trim() : ''
        if (!sku || seen.has(sku)) continue
        seen.add(sku)
        const priceText = v && v.data && v.data.price != null ? String(v.data.price) : ''
        out.push({ sku, priceText })
      }
    }
  }
  return out
}

/** 详情页现价文本（供急速上架等复用） */
export function readDetailPriceText(): string {
  const webSale = document.querySelector('div[data-widget="webSale"]')
  if (!webSale) return ''
  const green = webSale.querySelector('span.tsHeadline600Large')
  if (green?.textContent) return green.textContent.trim()
  for (const span of webSale.querySelectorAll('span')) {
    const t = span.textContent || ''
    if (t.includes('₽') || t.includes('¥') || t.includes('$')) return t.trim()
  }
  return ''
}
