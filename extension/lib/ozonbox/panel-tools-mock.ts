import type { OzonboxCollectedProduct } from './contract'
import type {
  PanelListingDraftInput,
  PanelListingDraftResult,
  PanelListingPreview,
  PanelListingSubmitResult,
  PanelPricingInput,
  PanelPricingResult,
  PanelSelectionRule,
  PanelSelectionRuleInput,
} from './panel-tools-contract'
import { isPanelToolRequest } from './panel-tools-contract'
import { buildPanelListingPreview } from './panel-tools-listing'

const MOCK_RULES_KEY = 'jingzhi_ai_panel_mock_selection_rules'

const DEFAULT_RULES: PanelSelectionRule[] = [
  {
    id: 1001,
    name: '高潜新品',
    tag: '新品',
    color: '#1677ff',
    autoFavorite: true,
    sort: 10,
    enabled: true,
    conditions: { brandOption: 2, priceMin: 500, priceMax: 5000, soldCountMin: 20, sellerCountMax: 8 },
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 1002,
    name: '低竞争利润款',
    tag: '利润',
    color: '#f59e0b',
    autoFavorite: false,
    sort: 20,
    enabled: false,
    conditions: { brandOption: 0, priceMin: 1000, sellerCountMax: 5, minimumPriceFollowMin: 15 },
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
]

const SELECTION_NUMBER_FIELDS = [
  'soldCountMin', 'soldCountMax', 'soldSumMin', 'soldSumMax',
  'priceMin', 'priceMax', 'weightMin', 'weightMax',
  'listedDaysMin', 'listedDaysMax', 'salesDynamicsMin', 'salesDynamicsMax',
  'drrMin', 'drrMax', 'daysInPromoMin', 'daysInPromoMax',
  'discountMin', 'discountMax', 'promoRevenueShareMin', 'promoRevenueShareMax',
  'daysWithTrafaretsMin', 'daysWithTrafaretsMax',
  'qtyViewPdpMin', 'qtyViewPdpMax', 'convToCartPdpMin', 'convToCartPdpMax',
  'sessionCountSearchMin', 'sessionCountSearchMax',
  'convToCartSearchMin', 'convToCartSearchMax',
  'convViewToOrderMin', 'convViewToOrderMax', 'cancelRateMin', 'cancelRateMax',
  'sellerCountMin', 'sellerCountMax',
  'minimumPriceFollowMin', 'minimumPriceFollowMax',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeStoredRule(value: unknown): PanelSelectionRule | undefined {
  if (!isRecord(value) || !isRecord(value.conditions)) return undefined
  const conditions: Record<string, unknown> = { brandOption: value.conditions.brandOption }
  for (const key of SELECTION_NUMBER_FIELDS) {
    const field = value.conditions[key]
    if (typeof field === 'number' && Number.isFinite(field)) conditions[key] = field
  }
  if (value.conditions.salesSchema === '' || value.conditions.salesSchema === 'FBO' || value.conditions.salesSchema === 'FBS') {
    conditions.salesSchema = value.conditions.salesSchema
  }
  const input = {
    name: typeof value.name === 'string' ? value.name.trim() : value.name,
    tag: typeof value.tag === 'string' ? value.tag.trim() : value.tag,
    ...(typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color) ? { color: value.color } : {}),
    autoFavorite: value.autoFavorite,
    sort: value.sort,
    enabled: value.enabled,
    conditions,
  }
  const request: unknown = { type: 'PANEL_SELECTION_CREATE', input }
  if (!isPanelToolRequest(request) || request.type !== 'PANEL_SELECTION_CREATE') return undefined
  if (!Number.isInteger(value.id) || Number(value.id) <= 0 || typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) return undefined
  return { ...request.input, id: Number(value.id), updatedAt: value.updatedAt }
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits
  return Math.round((value + Number.EPSILON) * scale) / scale
}

export function runMockPricing(input: PanelPricingInput): PanelPricingResult {
  const costTotalCny = Math.max(0, finite(input.costCny) + finite(input.shippingCny) + finite(input.packagingCny))
  const exchangeRate = finite(input.exchangeRate, 12.5) > 0 ? input.exchangeRate : 12.5
  const costTotalRub = costTotalCny * exchangeRate
  const commissionRate = Math.min(.5, Math.max(0, (finite(input.ozonCommissionPct) + finite(input.logisticsCommissionPct)) / 100))
  let priceRub: number
  if (input.mode === 'evaluate') {
    if (!input.salePriceRub || input.salePriceRub <= 0) throw new Error('评估利润时必须填写大于 0 的销售价')
    priceRub = input.salePriceRub
  } else {
    const targetMarkup = Math.max(0, finite(input.targetMarginPct)) / 100
    priceRub = Math.ceil(costTotalRub * (1 + targetMarkup) / Math.max(.5, 1 - commissionRate))
    if (input.competitorPriceRub > 0) priceRub = Math.min(priceRub, Math.round(input.competitorPriceRub * .99))
    const protectedPrice = Math.ceil(costTotalRub * (1 + Math.max(0, input.minMarginPct) / 100) / Math.max(.5, 1 - commissionRate))
    priceRub = Math.max(priceRub, protectedPrice)
    if (input.minPriceRub > 0) priceRub = Math.max(priceRub, input.minPriceRub)
    if (input.maxPriceRub > 0) priceRub = Math.min(priceRub, input.maxPriceRub)
  }
  const commissionRub = priceRub * commissionRate
  const profitRub = priceRub - commissionRub - costTotalRub
  return {
    mode: input.mode,
    costTotalCny: round(costTotalCny),
    costTotalRub: round(costTotalRub),
    priceRub: round(priceRub),
    oldPriceRub: round(priceRub * 1.2),
    marginPct: costTotalRub > 0 ? round(profitRub / costTotalRub * 100) : 0,
    profitRub: round(profitRub),
    commissionRub: round(commissionRub),
    breakdown: {
      goodsCostRub: round(Math.max(0, input.costCny) * exchangeRate),
      shippingRub: round(Math.max(0, input.shippingCny) * exchangeRate),
      packagingRub: round(Math.max(0, input.packagingCny) * exchangeRate),
      commissionRatePct: round(commissionRate * 100),
    },
  }
}

async function readRules(): Promise<PanelSelectionRule[]> {
  const stored = (await browser.storage.local.get(MOCK_RULES_KEY))[MOCK_RULES_KEY]
  if (!Array.isArray(stored)) return DEFAULT_RULES.map(rule => ({ ...rule, conditions: { ...rule.conditions } }))
  const rules = stored.map(sanitizeStoredRule).filter((rule): rule is PanelSelectionRule => rule !== undefined)
  await writeRules(rules)
  return rules
}

async function writeRules(rules: PanelSelectionRule[]): Promise<void> {
  await browser.storage.local.set({ [MOCK_RULES_KEY]: rules })
}

export async function listMockRules(): Promise<PanelSelectionRule[]> {
  return (await readRules()).sort((left, right) => left.sort - right.sort || left.id - right.id)
}

export async function createMockRule(input: PanelSelectionRuleInput): Promise<PanelSelectionRule> {
  const rules = await readRules()
  const id = Math.max(1000, ...rules.map(rule => rule.id)) + 1
  const rule = { ...input, id, conditions: { ...input.conditions }, updatedAt: new Date(0).toISOString() }
  await writeRules([...rules, rule])
  return rule
}

export async function updateMockRule(id: number, input: PanelSelectionRuleInput): Promise<PanelSelectionRule> {
  const rules = await readRules()
  const index = rules.findIndex(rule => rule.id === id)
  if (index < 0) throw new Error('MOCK 选品规则不存在')
  const rule = { ...input, id, conditions: { ...input.conditions }, updatedAt: new Date(0).toISOString() }
  rules[index] = rule
  await writeRules(rules)
  return rule
}

export async function toggleMockRule(id: number, enabled: boolean): Promise<PanelSelectionRule> {
  const rules = await readRules()
  const rule = rules.find(item => item.id === id)
  if (!rule) throw new Error('MOCK 选品规则不存在')
  rule.enabled = enabled
  rule.updatedAt = new Date(0).toISOString()
  await writeRules(rules)
  return rule
}

export async function deleteMockRule(id: number): Promise<{ deleted: boolean }> {
  const rules = await readRules()
  const next = rules.filter(rule => rule.id !== id)
  if (next.length === rules.length) throw new Error('MOCK 选品规则不存在')
  await writeRules(next)
  return { deleted: true }
}

export function buildMockListingPreview(product: OzonboxCollectedProduct): PanelListingPreview {
  return buildPanelListingPreview(
    product,
    [{ id: 9001, name: 'MOCK 演示店铺（不会访问 Ozon）', usable: true }],
    ['图片跟随与随机排序', '水印', '模特图', '浮动定价'],
  )
}

export function prepareMockListingDraft(input: PanelListingDraftInput): PanelListingDraftResult {
  const selected = input.variants.filter(variant => variant.selected)
  if (!selected.length) throw new Error('至少选择一个真实变体')
  if (!input.storeId) throw new Error('请选择店铺')
  const numericProductId = Number.parseInt(input.productId, 10)
  return {
    draftId: Number.isSafeInteger(numericProductId) ? 700000 + numericProductId % 100000 : 700001,
    status: input.descriptionCategoryId > 0 && input.typeId > 0 ? 'ready' : 'draft',
    offerId: input.offerId,
    selectedVariantCount: selected.length,
    warnings: ['MOCK 草稿仅保存在确定性模拟流程中，不会写入后端或 Ozon。', '图片变换字段仅作预览，不会声称已执行。'],
  }
}

export function submitMockListingDraft(draftId: number): PanelListingSubmitResult {
  return {
    draftId,
    simulated: true,
    externalSubmitted: false,
    taskId: `MOCK-${draftId}`,
    message: 'MOCK 已完成提交交互模拟；未向 Ozon 发送任何请求。',
  }
}