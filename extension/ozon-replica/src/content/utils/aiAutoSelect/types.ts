import type { TransformedGoodsData } from '../collectedGoodsTransform'
import {
  DEFAULT_MAX_VARIANT_EXECUTION_COUNT,
  getSkuVariantCount,
  isVariantCountOverLimit,
  normalizeMaxVariantExecutionCount,
} from '../maxVariantExecution'

export type RunnerStatus = 'idle' | 'collecting' | 'paused' | 'stopped' | 'finished' | 'error'

/** AI 流程状态（与采集箱/上架业务标记独立，可并存） */
export type AutoSelectCardStatus =
  | 'waiting_ai'
  | 'ai_processing'
  | 'ai_success'

/** 帮填流程各步骤失败标记（流程完毕 ai_success 时仍可存在） */
export type AiFillStepFailureKey = 'fill' | 'translate' | 'refine' | 'rich_content'

export const AI_STEP_FAILURE_LABELS: Record<AiFillStepFailureKey, string> = {
  fill: '帮填失败',
  translate: '翻译失败',
  refine: '改图失败',
  rich_content: '富内容失败',
}

/** 列表筛选用的业务结果状态 */
export type AutoSelectOutcomeFilter = 'listed' | 'in_collect_box'

export type AutoSelectStatusFilter = 'all' | AutoSelectCardStatus | AutoSelectOutcomeFilter

export type ListMetrics = {
  monthlySales?: string
  repurchaseRate?: number
  rating?: number
}

export type ManualEditFocus = {
  kind: 'feature' | 'sku' | 'image_queue'
  attrId?: number
  rowIndex?: number
  /** SKU 表格内字段类型，供工作台滚动定位 */
  skuField?: 'aspect' | 'variant_feature' | 'variant_description'
}

export type ProductEditState = {
  categoryTemplateId?: number | null
  categoryTemplates?: Array<{ id: number; name: string; data?: unknown }>
  featureAttrs?: unknown[]
  prefilledFeatureAttrValues?: Record<string, unknown>
  aiResultJsonList?: unknown[]
  aiResultPublicFeatureData?: Record<string, unknown>
  selectedShops?: number[]
  shopWarehouseInventory?: Record<number, { warehouseId: number | null; quantity: number }>
  workbenchFeatureAttrValues?: Record<string, unknown>
  /** 各变体 SKU 视频 URL，按商品隔离持久化 */
  skuVideoUrlList?: Record<number, string>
}

export type KeywordMatchMode = 'fuzzy' | 'strict'

export type AutomationMode = 'semi' | 'full'

/** 与 SettingsPage aiStep 结构对齐，供单次选品独立配置 */
export type AiAutoSelectAiStepConfig = {
  imageTranslateCheck: boolean
  imageTranslateType: 'package' | 'points'
  imageTranslateSelect: 'sku' | 'sku_and_other'
  imageRefineCheck: boolean
  imageRefineTemplate: string
  /** 展示用：启动选品时从模板列表解析并固化，避免进度弹窗再查接口 */
  imageRefineTemplateName?: string
  imageRefineSelect: 'sku' | 'sku_and_other'
  imageRichContentCheck: boolean
  imageRichContentTemplate: 'other' | 'sku' | 'sku_and_other'
  imageRichContentSelect: 'sku'
}

export const DEFAULT_AI_STEP_CONFIG: AiAutoSelectAiStepConfig = {
  imageTranslateCheck: false,
  imageTranslateType: 'package',
  imageTranslateSelect: 'sku',
  imageRefineCheck: false,
  imageRefineTemplate: '',
  imageRefineSelect: 'sku',
  imageRichContentCheck: false,
  imageRichContentTemplate: 'other',
  imageRichContentSelect: 'sku',
}

/** 全自动模式展开时的 AI 流程默认（帮填必选；翻译/改图/富内容由用户自行勾选） */
export const DEFAULT_FULL_AUTO_AI_STEP_CONFIG: AiAutoSelectAiStepConfig = {
  ...DEFAULT_AI_STEP_CONFIG,
}

export type ListingPriceAdjustOp = 'add' | 'sub' | 'mul' | 'div' | 'pct_up' | 'pct_down'

export type ListingPriceAdjustConfig = {
  op: ListingPriceAdjustOp
  value: number
}

const LISTING_PRICE_ADJUST_OPS: ListingPriceAdjustOp[] = ['add', 'sub', 'mul', 'div', 'pct_up', 'pct_down']

/** 规范化全自动上架售价调整配置 */
export function normalizeListingPriceAdjustConfig(
  raw: Partial<ListingPriceAdjustConfig> | null | undefined,
): ListingPriceAdjustConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const op = LISTING_PRICE_ADJUST_OPS.includes(raw.op as ListingPriceAdjustOp) ? raw.op as ListingPriceAdjustOp : 'add'
  const value = Number.isFinite(Number(raw.value)) ? Number(raw.value) : 0
  if (value <= 0) return undefined
  return { op, value }
}

export type AiAutoSelectConfig = {
  category: string
  minPrice: number | null
  maxPrice: number | null
  targetCount: number
  keywords: string[]
  /** 关键词匹配模式，默认精准（模糊匹配 UI 暂时下线） */
  keywordMatchMode: KeywordMatchMode
  /** 自动化模式：半自动仅采集，全自动采集后自动执行 AI 流程 */
  automationMode: AutomationMode
  /** automationMode === 'full' 时本次选品独立的 AI 流程选项 */
  aiStep?: AiAutoSelectAiStepConfig
  /** automationMode === 'full' 时本次选品独立的变体执行上限 */
  maxVariantExecutionCount?: number
  /** 是否启用店铺商品采集模式 */
  storeCollectEnabled: boolean
  /** 解析后的店铺商品列表链接 */
  storeLinks: string[]
  /** 是否启用自动上架（由全自动模式 + 已选店铺派生，无独立 UI 开关） */
  listingShopEnabled: boolean
  /** 预选上架店铺 id 列表 */
  listingShops: number[]
  /** 预选店铺仓库与库存 */
  listingShopWarehouseInventory: Record<number, { warehouseId: number | null; quantity: number }>
  /** automationMode === 'full' 时上架前对采集价二次调整 */
  listingPriceAdjust?: ListingPriceAdjustConfig
}

export type ShopWarehouseInventoryMap = Record<number, { warehouseId: number | null; quantity: number }>

/** 规范化 AI 流程配置，兼容旧数据与局部字段 */
export function normalizeAiStepConfig(
  aiStep: Partial<AiAutoSelectAiStepConfig> | null | undefined,
): AiAutoSelectAiStepConfig {
  if (!aiStep || typeof aiStep !== 'object') {
    return { ...DEFAULT_AI_STEP_CONFIG }
  }
  const template = aiStep.imageRichContentTemplate
  const richTemplate = template === 'sku' || template === 'sku_and_other' ? template : 'other'
  const translateSelect = aiStep.imageTranslateSelect
  const refineSelect = aiStep.imageRefineSelect
  return {
    imageTranslateCheck: Boolean(aiStep.imageTranslateCheck),
    imageTranslateType: aiStep.imageTranslateType === 'points' ? 'points' : 'package',
    imageTranslateSelect: translateSelect === 'sku_and_other' ? 'sku_and_other' : 'sku',
    imageRefineCheck: Boolean(aiStep.imageRefineCheck),
    imageRefineTemplate: String(aiStep.imageRefineTemplate ?? ''),
    imageRefineTemplateName: String(aiStep.imageRefineTemplateName ?? ''),
    imageRefineSelect: refineSelect === 'sku_and_other' ? 'sku_and_other' : 'sku',
    imageRichContentCheck: Boolean(aiStep.imageRichContentCheck),
    imageRichContentTemplate: richTemplate,
    imageRichContentSelect: 'sku',
  }
}

/** 将各类异常 keywords 形态统一为 string[]，兼容旧草稿与 pending 配置 */
export function normalizeConfigKeywords(keywords: unknown): string[] {
  if (Array.isArray(keywords)) {
    return keywords.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof keywords === 'string') {
    const trimmed = keywords.trim()
    if (!trimmed) return []
    return trimmed.split(/[,，、;；]+/).map((s) => s.trim()).filter(Boolean)
  }
  return []
}

/** 读取/回填时规范化选品配置，避免 keywords 等非数组字段导致运行时报错 */
export function normalizeAiAutoSelectConfig(
  config: Partial<AiAutoSelectConfig> & { category?: string },
): AiAutoSelectConfig {
  const targetCount = config.targetCount
  // 模糊匹配暂时下线，统一使用精准匹配
  const keywordMatchMode: KeywordMatchMode = 'strict'
  const automationMode = config.automationMode === 'full' ? 'full' : 'semi'
  const storeLinks = Array.isArray(config.storeLinks)
    ? config.storeLinks.map((link) => String(link).trim()).filter(Boolean)
    : []
  const listingShops = Array.isArray(config.listingShops)
    ? config.listingShops.filter((id) => typeof id === 'number' && Number.isFinite(id))
    : []
  const listingShopWarehouseInventory: ShopWarehouseInventoryMap = {}
  if (config.listingShopWarehouseInventory && typeof config.listingShopWarehouseInventory === 'object') {
    for (const [key, row] of Object.entries(config.listingShopWarehouseInventory)) {
      const shopId = Number(key)
      if (!Number.isFinite(shopId) || !row || typeof row !== 'object') continue
      listingShopWarehouseInventory[shopId] = {
        warehouseId: row.warehouseId != null ? Number(row.warehouseId) : null,
        quantity: Number.isFinite(Number(row.quantity)) ? Math.max(0, Math.floor(Number(row.quantity))) : 0,
      }
    }
  }
  const normalized: AiAutoSelectConfig = {
    category: config.category || UNLIMITED_CATEGORY,
    minPrice: config.minPrice ?? null,
    maxPrice: config.maxPrice ?? null,
    targetCount:
      typeof targetCount === 'number' && Number.isFinite(targetCount) && targetCount > 0
        ? Math.min(500, Math.max(1, Math.floor(targetCount)))
        : 1,
    keywords: normalizeConfigKeywords(config.keywords),
    keywordMatchMode,
    automationMode,
    storeCollectEnabled: Boolean(config.storeCollectEnabled),
    storeLinks,
    listingShopEnabled: automationMode === 'full' && listingShops.length > 0,
    listingShops: automationMode === 'full' ? listingShops : [],
    listingShopWarehouseInventory: automationMode === 'full' ? listingShopWarehouseInventory : {},
  }
  if (automationMode === 'full') {
    normalized.aiStep = normalizeAiStepConfig(config.aiStep ?? DEFAULT_FULL_AUTO_AI_STEP_CONFIG)
    normalized.maxVariantExecutionCount = normalizeMaxVariantExecutionCount(
      config.maxVariantExecutionCount ?? DEFAULT_MAX_VARIANT_EXECUTION_COUNT,
    )
    normalized.listingPriceAdjust = normalizeListingPriceAdjustConfig(config.listingPriceAdjust)
  }
  return normalized
}

export type AiAutoSelectDraftItem = {
  id: string
  offerId: string
  title: string
  listPrice: number | null
  detailUrl: string
  mainImageUrl?: string
  listMetrics?: ListMetrics
  cardStatus: AutoSelectCardStatus
  /** 已加入采集箱（与 isListed 可同时为 true） */
  inCollectBox?: boolean
  /** 已上架 Ozon（与 inCollectBox 可同时为 true） */
  isListed?: boolean
  needsManualEdit: boolean
  manualEditFocus?: ManualEditFocus
  /** AI 帮填任务 sessionId，用于 SSE 失败后轮询/恢复；成功后清除 */
  aiSessionId?: string
  transformed: TransformedGoodsData
  editState?: ProductEditState
  /** 帮填/翻译/改图/富内容 步骤失败项，展示在卡片失败徽章上 */
  aiStepFailures?: AiFillStepFailureKey[]
  /** Ozon 上架失败记录（卡片右上角展示可点击状态，详情见错误弹窗） */
  ozonListingFailures?: OzonListingFailureRecord[]
  collectedAt: number
}

export type OzonListingFailureRecord = {
  shopId: number
  message: string
}

export type AiAutoSelectDraft = {
  /** 选品会话 ID，多标签页并行时各会话独立 */
  sessionId: string
  version: 2
  pageUrl: string
  config: AiAutoSelectConfig
  status: RunnerStatus
  /** 累计成功采集数（只增不减）；手动删除商品时不回退，用于进度与 Runner 停止条件 */
  collectedCount: number
  items: AiAutoSelectDraftItem[]
  /** 已扫描/采集过的 offerId，删除商品后仍保留，防止续采重复出现 */
  seenOfferIds?: string[]
  /** 列表页已扫描过的 offerId（含未通过筛选的），用于空结果时展示扫描量 */
  scannedOfferIds?: string[]
  updatedAt: number
}

export type ListOfferItem = {
  offerId: string
  title: string
  listPrice: number | null
  mainImageUrl?: string
  listMetrics?: ListMetrics
  element: Element
}

export const UNLIMITED_CATEGORY = '不限类目'

export const DRAFT_STORAGE_KEY = 'mjgd_ai_auto_select_draft_v1'

export const CARD_STATUS_LABELS: Record<AutoSelectCardStatus, string> = {
  waiting_ai: '等待 AI 处理',
  ai_processing: 'AI 处理中',
  ai_success: 'AI 处理成功',
}

export const OUTCOME_STATUS_LABELS: Record<AutoSelectOutcomeFilter, string> = {
  in_collect_box: '已存入采集箱',
  listed: '已上架',
}

export const VARIANT_LIMIT_EXCEEDED_LABEL = '变体数量超限'

export type CardStatusBadge = {
  key: string
  label: string
}

export function createDraftItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/** 卡片右上角展示的状态徽章：有业务结果时仅展示业务标签 */
export function getCardStatusBadges(
  item: AiAutoSelectDraftItem,
  maxVariantExecutionCount?: number,
): CardStatusBadge[] {
  const badges: CardStatusBadge[] = []
  const hasOutcome = Boolean(item.inCollectBox || item.isListed)

  // 变体数超过当前生效上限时展示警告徽章，与等待帮填等状态可并存
  if (
    maxVariantExecutionCount != null &&
    isVariantCountOverLimit(getSkuVariantCount(item), maxVariantExecutionCount)
  ) {
    badges.push({ key: 'variant_limit_exceeded', label: VARIANT_LIMIT_EXCEEDED_LABEL })
  }

  if (item.cardStatus === 'waiting_ai' || item.cardStatus === 'ai_processing') {
    badges.push({ key: item.cardStatus, label: CARD_STATUS_LABELS[item.cardStatus] })
  } else if (!hasOutcome && item.cardStatus === 'ai_success') {
    badges.push({ key: 'ai_success', label: CARD_STATUS_LABELS.ai_success })
  }

  if (item.inCollectBox) {
    badges.push({ key: 'in_collect_box', label: OUTCOME_STATUS_LABELS.in_collect_box })
  }
  if (item.isListed) {
    badges.push({ key: 'listed', label: OUTCOME_STATUS_LABELS.listed })
  }

  // 流程步骤失败专用徽章，与 ai_success 等业务态并存
  const failures = item.aiStepFailures ?? []
  failures.forEach((failureKey) => {
    badges.push({
      key: `step_failure_${failureKey}`,
      label: AI_STEP_FAILURE_LABELS[failureKey],
    })
  })

  return badges
}

/** 草稿条目展示/回写用标题：优先 transformed.product_name，回退 item.title */
export function resolveDraftItemTitle(
  item: { title?: string | null; transformed?: TransformedGoodsData | Record<string, unknown> | null },
): string {
  const transformed = item.transformed as TransformedGoodsData | null | undefined
  return (
    String(transformed?.global_data?.product_name ?? '').trim() ||
    String(item.title ?? '').trim()
  )
}

/** 是否已完成 AI 帮填（批量帮填时跳过，避免重复提交 AI 任务） */
export function isAutoSelectAiFillDone(item: AiAutoSelectDraftItem): boolean {
  if (item.cardStatus === 'ai_success' || item.inCollectBox || item.isListed) {
    return true
  }
  const publicData = item.editState?.aiResultPublicFeatureData
  const hasPublicAi =
    publicData != null &&
    typeof publicData === 'object' &&
    Object.keys(publicData).length > 0
  const hasVariantAi =
    Array.isArray(item.editState?.aiResultJsonList) &&
    item.editState.aiResultJsonList.length > 0
  return hasPublicAi || hasVariantAi
}

/** 帮填任务已提交但草稿尚无有效 AI 结果，等待轮询恢复 */
export function isAwaitingAiFillRecover(item: AiAutoSelectDraftItem): boolean {
  if (item.cardStatus !== 'ai_processing') return false
  return !isAutoSelectAiFillDone(item)
}

/** 是否满足上架 Ozon 条件（AI 帮填完成且非处理中） */
export function isOzonSubmitReady(item: AiAutoSelectDraftItem): boolean {
  if (item.cardStatus === 'ai_processing') return false
  return isAutoSelectAiFillDone(item)
}

/** 合并业务结果字段：Runner 与结果页双写时保留已达成 outcome，避免回退 */
export function mergeDraftItemOutcome(
  local: AiAutoSelectDraftItem | undefined,
  incoming: AiAutoSelectDraftItem,
): AiAutoSelectDraftItem {
  if (!local) return incoming
  const isListed = Boolean(local.isListed || incoming.isListed)
  const inCollectBox = Boolean(local.inCollectBox || incoming.inCollectBox)
  let ozonListingFailures = incoming.ozonListingFailures ?? local.ozonListingFailures
  if (isListed) {
    ozonListingFailures = undefined
  }
  return {
    ...incoming,
    isListed: isListed || undefined,
    inCollectBox: inCollectBox || undefined,
    ozonListingFailures,
  }
}

/** Runner 推送草稿时与结果页内存合并，防止 isListed 等业务态被旧 Runner 副本覆盖 */
export function mergeDraftWithItemOutcomes(
  localDraft: AiAutoSelectDraft | null,
  incomingDraft: AiAutoSelectDraft,
): AiAutoSelectDraft {
  if (!localDraft || localDraft.sessionId !== incomingDraft.sessionId) return incomingDraft
  const localById = new Map(localDraft.items.map((item) => [item.id, item]))
  const items = incomingDraft.items.map((item) => mergeDraftItemOutcome(localById.get(item.id), item))
  return { ...incomingDraft, items }
}
