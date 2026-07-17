/**
 * 改图草稿存储工具
 * 用于存储和恢复改图草稿，包括图片翻译和智能去水印的改图操作
 * 草稿存储在 localStorage 中，以 productKey 为键，存储 ImageEditDraft 对象
 * ImageEditDraft 对象包含以下字段：
 * - collectPlatform: 采集平台
 * - offerId: 商品 ID
 * - savedAt: 保存时间（读写时按 2 天 TTL 自动清理过期草稿）
 * - skuByVariant: 变体图片改图记录
 * - detailByUrl: 详情图片改图记录
 * 
 * TransformSnapshot 对象包含以下字段：
 * - transformUrl: 改图后的图片 URL
 * - transformHistory: 改图历史记录
 */

import type { ImageTransformItem } from '../../utils/imageTransform'

const STORAGE_KEY = 'mjgd_image_edit_draft_v1'
/** 改图草稿保留时长：超过后读写时自动剔除，避免 localStorage 无限堆积 */
const DRAFT_TTL_MS = 2 * 24 * 60 * 60 * 1000

export type TransformSnapshot = {
  transformUrl: string
  transformHistory?: string[]
}

export type ImageEditDraft = {
  collectPlatform: string
  offerId: string
  savedAt: number
  skuByVariant: Array<Record<string, TransformSnapshot>>
  detailByUrl: Record<string, TransformSnapshot>
}

export type ProductMeta = {
  collectPlatform: string
  offerId: string
}

export type ImageEditMergeResult = {
  mergedCount: number
  skippedCount: number
}

type DraftStore = Record<string, ImageEditDraft>

/** 平台 + 商品 ID 组成唯一键 */
export function buildProductKey(collectPlatform: string, offerId: string): string {
  const platform = String(collectPlatform || '').trim()
  const id = String(offerId || '').trim()
  return `${platform}:${id}`
}

/** 无有效 savedAt 或超过 TTL 的草稿视为过期 */
function isDraftExpired(draft: ImageEditDraft | null | undefined): boolean {
  const savedAt = Number(draft?.savedAt)
  if (!Number.isFinite(savedAt) || savedAt <= 0) return true
  return Date.now() - savedAt > DRAFT_TTL_MS
}

/** 原地删除过期商品草稿，返回是否发生了变更 */
function pruneExpiredDrafts(store: DraftStore): boolean {
  let changed = false
  Object.keys(store).forEach((key) => {
    if (isDraftExpired(store[key])) {
      delete store[key]
      changed = true
    }
  })
  return changed
}

function readDraftStore(): DraftStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as DraftStore
    const store = parsed && typeof parsed === 'object' ? parsed : {}
    // 读时顺带清理过期项并回写，保证 load/has/clear 都能触发淘汰
    if (pruneExpiredDrafts(store)) {
      writeDraftStore(store)
    }
    return store
  } catch {
    return {}
  }
}

function writeDraftStore(store: DraftStore): void {
  try {
    // 写入前再 prune，避免把过期数据连同新草稿一起写回
    pruneExpiredDrafts(store)
    if (!Object.keys(store).length) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch (error) {
    console.error('保存改图草稿失败:', error)
  }
}

/** blob 等临时 URL 浏览器重启后不可用，不参与持久化与恢复 */
function isPersistableTransformUrl(url: string): boolean {
  const value = String(url || '').trim()
  if (!value) return false
  if (value.startsWith('blob:')) return false
  return true
}

function normalizeOriginalUrl(item: ImageTransformItem): string {
  return String(item.url || '').trim()
}

function normalizeCurrentTransformUrl(item: ImageTransformItem): string {
  const url = normalizeOriginalUrl(item)
  const transformUrl = String(item.transformUrl || url).trim()
  return transformUrl || url
}

function isImagePristine(item: ImageTransformItem): boolean {
  const url = normalizeOriginalUrl(item)
  if (!url) return false
  return normalizeCurrentTransformUrl(item) === url
}

function buildSnapshot(item: ImageTransformItem): TransformSnapshot | null {
  const url = normalizeOriginalUrl(item)
  const transformUrl = normalizeCurrentTransformUrl(item)
  if (!url || transformUrl === url || !isPersistableTransformUrl(transformUrl)) {
    return null
  }
  const history = Array.isArray(item.transformHistory)
    ? item.transformHistory.filter((entry) => isPersistableTransformUrl(String(entry || '')))
    : undefined
  return {
    transformUrl,
    transformHistory: history?.length ? [...history] : undefined,
  }
}

function hasDraftEntries(draft: ImageEditDraft): boolean {
  const hasSku = draft.skuByVariant.some((variantMap) => Object.keys(variantMap).length > 0)
  return hasSku || Object.keys(draft.detailByUrl).length > 0
}

/** 将 snapshot 转为完整处理链 [...history, transformUrl]，供单调合并比较 */
function snapshotToChain(snapshot: TransformSnapshot): string[] {
  const history = Array.isArray(snapshot.transformHistory)
    ? snapshot.transformHistory.map((entry) => String(entry || '').trim()).filter(Boolean)
    : []
  const transformUrl = String(snapshot.transformUrl || '').trim()
  return transformUrl ? [...history, transformUrl] : history
}

function isChainPrefix(prefix: string[], full: string[]): boolean {
  if (prefix.length > full.length) return false
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== full[index]) return false
  }
  return true
}

/**
 * 草稿合并是否应采纳 incoming：还原（incoming 为前缀）时保留 existing，前进改图时更新
 */
function shouldUpdateDraftSnapshot(
  existing: TransformSnapshot | undefined,
  incoming: TransformSnapshot
): boolean {
  if (!existing) return true
  const existingChain = snapshotToChain(existing)
  const incomingChain = snapshotToChain(incoming)
  if (existingChain.length === incomingChain.length && existingChain.every((value, index) => value === incomingChain[index])) {
    return false
  }
  // 前进改图：incoming 链扩展 existing 链
  if (incomingChain.length >= existingChain.length && isChainPrefix(existingChain, incomingChain)) {
    return true
  }
  // 还原：incoming 链是 existing 的前缀，保留本地更完整的草稿
  if (incomingChain.length < existingChain.length && isChainPrefix(incomingChain, existingChain)) {
    return false
  }
  // 无前缀关系，视为全新改图路径
  return true
}

function mergeSnapshotIntoMap(
  baseMap: Record<string, TransformSnapshot>,
  incomingMap: Record<string, TransformSnapshot>
): void {
  Object.keys(incomingMap).forEach((url) => {
    const incoming = incomingMap[url]
    if (shouldUpdateDraftSnapshot(baseMap[url], incoming)) {
      baseMap[url] = incoming
    }
  })
}

function collectVariantMaps(data: any): Array<Record<string, TransformSnapshot>> {
  const skuMatrix = Array.isArray(data?.sku_matrix) ? data.sku_matrix : []
  return skuMatrix.map((sku: any) => {
    const variantMap: Record<string, TransformSnapshot> = {}
    const imgList = Array.isArray(sku?.skuImgList) ? sku.skuImgList : []
    imgList.forEach((item: ImageTransformItem) => {
      const url = normalizeOriginalUrl(item)
      const snapshot = buildSnapshot(item)
      if (url && snapshot) {
        variantMap[url] = snapshot
      }
    })
    return variantMap
  })
}

function collectDetailMap(data: any): Record<string, TransformSnapshot> {
  const detailMap: Record<string, TransformSnapshot> = {}
  const detailList = Array.isArray(data?.detailImgList) ? data.detailImgList : []
  detailList.forEach((item: ImageTransformItem) => {
    const url = normalizeOriginalUrl(item)
    const snapshot = buildSnapshot(item)
    if (url && snapshot) {
      detailMap[url] = snapshot
    }
  })
  return detailMap
}

/** 从 transformedData 抽取当前内存中的已改图条目（全量快照，不含历史草稿） */
export function extractImageEditDraft(data: any, productMeta: ProductMeta): ImageEditDraft | null {
  const collectPlatform = String(productMeta.collectPlatform || '').trim()
  const offerId = String(productMeta.offerId || '').trim()
  if (!collectPlatform || !offerId || !data) return null
  const draft: ImageEditDraft = {
    collectPlatform,
    offerId,
    savedAt: Date.now(),
    skuByVariant: collectVariantMaps(data),
    detailByUrl: collectDetailMap(data),
  }
  return hasDraftEntries(draft) ? draft : null
}

/**
 * 增量合并改图草稿：仅将当前内存中的改图写入本地，还原操作不写回、不删除已有条目
 */
export function mergeImageEditDraftModifications(
  data: any,
  productMeta: ProductMeta,
  productKey: string
): void {
  const collectPlatform = String(productMeta.collectPlatform || '').trim()
  const offerId = String(productMeta.offerId || '').trim()
  const key = String(productKey || '').trim()
  if (!collectPlatform || !offerId || !key || !data) return

  const incomingSku = collectVariantMaps(data)
  const incomingDetail = collectDetailMap(data)
  const hasIncomingEdits = incomingSku.some((variantMap) => Object.keys(variantMap).length > 0)
    || Object.keys(incomingDetail).length > 0
  // 当前内存无改图（含误还原后全为原图）时不落盘，保留本地已有改图记录
  if (!hasIncomingEdits) return

  const existing = loadImageEditDraft(key)
  const draft: ImageEditDraft = existing
    ? {
        ...existing,
        savedAt: Date.now(),
        skuByVariant: existing.skuByVariant.map((variantMap) => ({ ...variantMap })),
        detailByUrl: { ...existing.detailByUrl },
      }
    : {
        collectPlatform,
        offerId,
        savedAt: Date.now(),
        skuByVariant: [],
        detailByUrl: {},
      }

  const skuMatrix = Array.isArray(data?.sku_matrix) ? data.sku_matrix : []
  const variantCount = Math.max(skuMatrix.length, incomingSku.length, draft.skuByVariant.length)
  const mergedSku: Array<Record<string, TransformSnapshot>> = []
  for (let index = 0; index < variantCount; index += 1) {
    const baseMap = { ...(draft.skuByVariant[index] || {}) }
    mergeSnapshotIntoMap(baseMap, incomingSku[index] || {})
    mergedSku.push(baseMap)
  }
  draft.skuByVariant = mergedSku
  mergeSnapshotIntoMap(draft.detailByUrl, incomingDetail)

  if (!hasDraftEntries(draft)) return
  saveImageEditDraft(draft, key)
}

export function loadImageEditDraft(productKey: string): ImageEditDraft | null {
  const key = String(productKey || '').trim()
  if (!key) return null
  const draft = readDraftStore()[key]
  return draft && typeof draft === 'object' ? draft : null
}

export function saveImageEditDraft(draft: ImageEditDraft | null, productKey: string): void {
  const key = String(productKey || '').trim()
  if (!key) return
  if (!draft || !hasDraftEntries(draft)) return
  const store = readDraftStore()
  store[key] = draft
  writeDraftStore(store)
}

/** 本地草稿是否含有可恢复的改图条目（不依赖当前 transformedData 是否已加载） */
export function hasImageEditDraftEntries(productKey: string): boolean {
  const draft = loadImageEditDraft(productKey)
  return Boolean(draft && hasDraftEntries(draft))
}

export function clearImageEditDraft(productKey: string): void {
  const key = String(productKey || '').trim()
  if (!key) return
  const store = readDraftStore()
  if (!store[key]) return
  delete store[key]
  writeDraftStore(store)
}

function canMergeSnapshot(item: ImageTransformItem, snapshot: TransformSnapshot): boolean {
  const url = normalizeOriginalUrl(item)
  const savedTransformUrl = String(snapshot.transformUrl || '').trim()
  if (!url || !savedTransformUrl || savedTransformUrl === url) return false
  if (!isPersistableTransformUrl(savedTransformUrl)) return false
  return isImagePristine(item)
}

function applySnapshotToItem(item: ImageTransformItem, snapshot: TransformSnapshot): void {
  const savedTransformUrl = String(snapshot.transformUrl || '').trim()
  item.transformUrl = savedTransformUrl
  const history = Array.isArray(snapshot.transformHistory)
    ? snapshot.transformHistory.filter((entry) => isPersistableTransformUrl(String(entry || '')))
    : []
  item.transformHistory = history.length ? [...history] : []
}

function countAndMergeList(
  items: ImageTransformItem[] | undefined,
  snapshotMap: Record<string, TransformSnapshot>,
  mutate: boolean
): { mergedCount: number; skippedCount: number } {
  let mergedCount = 0
  let skippedCount = 0
  const list = Array.isArray(items) ? items : []
  list.forEach((item) => {
    const url = normalizeOriginalUrl(item)
    if (!url) return
    const snapshot = snapshotMap[url]
    if (!snapshot) return
    if (canMergeSnapshot(item, snapshot)) {
      if (mutate) {
        applySnapshotToItem(item, snapshot)
      }
      mergedCount += 1
      return
    }
    if (!isImagePristine(item) && hasMeaningfulSnapshot(snapshot, url)) {
      skippedCount += 1
    }
  })
  return { mergedCount, skippedCount }
}

function hasMeaningfulSnapshot(snapshot: TransformSnapshot, originalUrl: string): boolean {
  const transformUrl = String(snapshot.transformUrl || '').trim()
  const url = String(originalUrl || '').trim()
  return Boolean(transformUrl && transformUrl !== url && isPersistableTransformUrl(transformUrl))
}

/** 统计当前数据可智能合并的改图数量 */
export function countMergeableTransforms(currentData: any, draft: ImageEditDraft | null): number {
  if (!currentData || !draft) return 0
  let total = 0
  const skuMatrix = Array.isArray(currentData?.sku_matrix) ? currentData.sku_matrix : []
  const variantCount = Math.min(skuMatrix.length, draft.skuByVariant.length)
  for (let index = 0; index < variantCount; index += 1) {
    const result = countAndMergeList(skuMatrix[index]?.skuImgList, draft.skuByVariant[index] || {}, false)
    total += result.mergedCount
  }
  const detailResult = countAndMergeList(currentData?.detailImgList, draft.detailByUrl, false)
  total += detailResult.mergedCount
  return total
}

/** 智能合并：仅补回当前仍为原图、本地已有改图的条目 */
export function applyImageEditDraftMerge(currentData: any, draft: ImageEditDraft | null): ImageEditMergeResult {
  const emptyResult: ImageEditMergeResult = { mergedCount: 0, skippedCount: 0 }
  if (!currentData || !draft) return emptyResult
  let mergedCount = 0
  let skippedCount = 0
  const skuMatrix = Array.isArray(currentData?.sku_matrix) ? currentData.sku_matrix : []
  const variantCount = Math.min(skuMatrix.length, draft.skuByVariant.length)
  for (let index = 0; index < variantCount; index += 1) {
    const result = countAndMergeList(
      skuMatrix[index]?.skuImgList,
      draft.skuByVariant[index] || {},
      true
    )
    mergedCount += result.mergedCount
    skippedCount += result.skippedCount
  }
  const detailResult = countAndMergeList(currentData?.detailImgList, draft.detailByUrl, true)
  mergedCount += detailResult.mergedCount
  skippedCount += detailResult.skippedCount
  return { mergedCount, skippedCount }
}
