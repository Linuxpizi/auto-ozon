import { resolveOzonPageType } from '../ozonList/ozonPageContext'
import type { QuickShelveSkuRow } from './types'
import { buildEditUploadDataFromMainWorld } from './quickShelveMainWorld'

interface SkuPriceItem {
  sku: string
  price: string
  offerId: string
  primaryImage: string
  title: string
  video_cover: unknown[]
  video_poster: unknown[]
  description: string
  hashtags: unknown[]
  richAnnotationJson: string
}

function buildFallbackEditData(sku: string, sp?: SkuPriceItem) {
  if (!sp) return null
  return {
    sku: String(sku),
    url: `${window.location.origin}/product/${sku}/`,
    rows: [
      {
        sku: String(sku),
        title: sp.title || '',
        price: sp.price != null ? String(sp.price) : '',
        cover_image: sp.primaryImage || '',
        images: sp.primaryImage ? [sp.primaryImage] : [],
        video_cover: sp.video_cover || [],
        video_poster: sp.video_poster || [],
        variantAttr: [],
      },
    ],
    category: '',
    common_attributes: [],
    description: sp.description || '',
    lastDescriptionCategoryNameOrTypeName: '',
    tags: sp.hashtags || [],
    richAnnotationJson: sp.richAnnotationJson || '',
    skuShopsCategories: [],
  }
}

function mergeGroupRows(
  editData: Record<string, unknown>,
  groupSkus: string[],
  skuPriceMap: Map<string, SkuPriceItem>,
) {
  const rows = Array.isArray(editData.rows) ? [...(editData.rows as Array<Record<string, unknown>>)] : []
  const existing = new Set(rows.map((r) => String(r.sku || '').trim()))

  groupSkus.forEach((sku) => {
    if (!existing.has(sku)) {
      const fb = buildFallbackEditData(sku, skuPriceMap.get(sku))
      if (fb?.rows?.[0]) rows.push(fb.rows[0])
    }
  })

  const filtered = rows.filter((r) => groupSkus.includes(String(r.sku || '').trim()))
  filtered.forEach((r) => {
    const sp = skuPriceMap.get(String(r.sku || '').trim())
    if (!sp) return
    if (sp.price) r.price = String(sp.price)
    if (sp.offerId) r.offerId = String(sp.offerId)
    if (sp.primaryImage && !r.cover_image) {
      r.cover_image = sp.primaryImage
      r.images = [sp.primaryImage]
    }
    if (sp.video_cover?.length && !r.video_cover) r.video_cover = sp.video_cover
    if (sp.video_poster?.length && !r.video_poster) r.video_poster = sp.video_poster
  })

  if (!filtered.length) {
    const mainSku = groupSkus[0]
    const fb = buildFallbackEditData(mainSku, skuPriceMap.get(mainSku))
    if (fb) return fb
  }

  const result: Record<string, unknown> = { ...editData, rows: filtered }
  if (result.richAnnotationJson && typeof result.richAnnotationJson === 'object') {
    result.richAnnotationJson = JSON.stringify(result.richAnnotationJson)
  }
  return result
}

/** 编辑模式 V2：按主 SKU 分组采集并构造 editUploadDataList */
export async function buildEditUploadDataList(
  skuPrices: SkuPriceItem[],
): Promise<Record<string, unknown>[]> {
  const checkedSkus = skuPrices.map((p) => String(p.sku || '').trim()).filter(Boolean)
  if (!checkedSkus.length) return []

  const isDetail = resolveOzonPageType() === 'detail'
  const skuPriceMap = new Map(skuPrices.map((s) => [String(s.sku), s]))
  const processed = new Set<string>()
  const groups: Record<string, unknown>[] = []

  for (const sku of checkedSkus) {
    if (processed.has(sku)) continue

    let editData: Record<string, unknown> | null = null
    try {
      editData = await buildEditUploadDataFromMainWorld(sku, !isDetail)
    } catch (e) {
      console.warn('[mjgd][quickShelve] buildEditUploadData 失败', sku, e)
    }
    if (!editData) {
      editData = buildFallbackEditData(sku, skuPriceMap.get(sku))
    }
    if (!editData) continue

    const rowSkus = (Array.isArray(editData.rows) ? editData.rows : []).map((r: { sku?: string }) =>
      String(r.sku || '').trim(),
    )
    let groupSkus: string[]
    if (isDetail) {
      groupSkus = checkedSkus.filter((s) => !processed.has(s))
    } else {
      groupSkus = checkedSkus.filter((s) => rowSkus.includes(s) && !processed.has(s))
    }
    if (!groupSkus.length) groupSkus = [sku]

    groupSkus.forEach((s) => processed.add(s))
    const merged = mergeGroupRows(editData, groupSkus, skuPriceMap)
    if (merged) groups.push(merged)
  }

  return groups
}
