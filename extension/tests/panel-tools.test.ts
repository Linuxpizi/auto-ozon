import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { OzonboxCollectedProduct } from '../lib/ozonbox/contract'
import { panelRuleColorInputValue, sanitizePanelRuleColor } from '../lib/ozonbox/floating-panel-tools'
import {
  isPanelToolRequest,
  requirePanelToolData,
  type PanelListingDraftInput,
  type PanelPricingInput,
  type PanelSelectionRuleInput,
} from '../lib/ozonbox/panel-tools-contract'
import {
  buildMockListingPreview,
  createMockRule,
  deleteMockRule,
  listMockRules,
  prepareMockListingDraft,
  runMockPricing,
  submitMockListingDraft,
  toggleMockRule,
  updateMockRule,
} from '../lib/ozonbox/panel-tools-mock'

const storage = new Map<string, unknown>()
Object.assign(globalThis, {
  browser: {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storage.get(key) }),
        set: async (values: Record<string, unknown>) => {
          Object.entries(values).forEach(([key, value]) => storage.set(key, value))
        },
      },
    },
  },
})

const pricingInput: PanelPricingInput = {
  mode: 'suggest',
  costCny: 100,
  shippingCny: 20,
  packagingCny: 5,
  exchangeRate: 12,
  ozonCommissionPct: 15,
  logisticsCommissionPct: 5,
  targetMarginPct: 30,
  minMarginPct: 15,
  competitorPriceRub: 2_500,
  minPriceRub: 1_800,
  maxPriceRub: 2_400,
}

assert.ok(isPanelToolRequest({ type: 'PANEL_SETTINGS_GET' }))
assert.ok(isPanelToolRequest({ type: 'PANEL_PRICING_RUN', input: pricingInput }))
assert.ok(isPanelToolRequest({ type: 'PANEL_ERP_OPEN', route: '/upload-management' }))
assert.ok(!isPanelToolRequest({ type: 'PANEL_ERP_OPEN', route: '/admin' }))
assert.ok(!isPanelToolRequest({ type: 'PANEL_SELECTION_TOGGLE', id: 0, enabled: true }))
assert.ok(!isPanelToolRequest({ type: 'PANEL_PRICING_RUN', input: { ...pricingInput, exchangeRate: Number.NaN } }))
assert.ok(!isPanelToolRequest({
  type: 'PANEL_SELECTION_CREATE',
  input: {
    name: '非法条件',
    tag: '测试',
    autoFavorite: false,
    sort: 1,
    enabled: true,
    conditions: { brandOption: 0, unknownMetric: 1 },
  },
}))

assert.deepEqual(requirePanelToolData<number>({ success: true, mode: 'mock', data: 7 }), { mode: 'mock', data: 7 })
assert.throws(
  () => requirePanelToolData({ success: false, mode: 'real', error: '后端不可用' }),
  /后端不可用/,
)
assert.throws(() => requirePanelToolData({ success: true, mode: 'fallback', data: 1 }), /无效响应/)

const suggested = runMockPricing(pricingInput)
assert.deepEqual(runMockPricing(pricingInput), suggested)
assert.equal(suggested.mode, 'suggest')
assert.equal(suggested.priceRub, 2_400)
assert.equal(suggested.costTotalRub, 1_500)
assert.equal(suggested.commissionRub, 480)
assert.equal(suggested.profitRub, 420)

const evaluated = runMockPricing({ ...pricingInput, mode: 'evaluate', salePriceRub: 2_000 })
assert.equal(evaluated.priceRub, 2_000)
assert.equal(evaluated.profitRub, 100)
assert.throws(
  () => runMockPricing({ ...pricingInput, mode: 'evaluate', salePriceRub: 0 }),
  /销售价/,
)

assert.equal(sanitizePanelRuleColor('#A1b2C3'), '#A1b2C3')
assert.equal(sanitizePanelRuleColor('red'), undefined)
assert.equal(sanitizePanelRuleColor(''), undefined)
assert.equal(panelRuleColorInputValue(undefined), '#ffffff')
assert.equal(panelRuleColorInputValue('#00aa11'), '#00aa11')

const exactSelectionInput: PanelSelectionRuleInput = {
  name: '完整规则',
  tag: '完整',
  autoFavorite: false,
  sort: 100,
  enabled: true,
  conditions: {
    brandOption: 2,
    soldCountMin: 1, soldCountMax: 2, soldSumMin: 3, soldSumMax: 4,
    priceMin: 5, priceMax: 6, weightMin: 7, weightMax: 8,
    listedDaysMin: 9, listedDaysMax: 10, salesDynamicsMin: 11, salesDynamicsMax: 12,
    drrMin: 13, drrMax: 14, daysInPromoMin: 15, daysInPromoMax: 16,
    discountMin: 17, discountMax: 18, promoRevenueShareMin: 19, promoRevenueShareMax: 20,
    daysWithTrafaretsMin: 21, daysWithTrafaretsMax: 22,
    qtyViewPdpMin: 23, qtyViewPdpMax: 24, convToCartPdpMin: 25, convToCartPdpMax: 26,
    sessionCountSearchMin: 27, sessionCountSearchMax: 28,
    convToCartSearchMin: 29, convToCartSearchMax: 30,
    convViewToOrderMin: 31, convViewToOrderMax: 32, salesSchema: 'FBO',
    cancelRateMin: 33, cancelRateMax: 34, sellerCountMin: 35, sellerCountMax: 36,
    minimumPriceFollowMin: 37.5, minimumPriceFollowMax: 38.5,
  },
}
assert.ok(isPanelToolRequest({ type: 'PANEL_SELECTION_CREATE', input: exactSelectionInput }))
assert.ok(!isPanelToolRequest({
  type: 'PANEL_SELECTION_CREATE',
  input: { ...exactSelectionInput, conditions: { ...exactSelectionInput.conditions, avgOrdersOnAccDaysMin: 1 } },
}))

storage.clear()
assert.deepEqual((await listMockRules()).map(rule => rule.id), [1001, 1002])
storage.set('jingzhi_ai_panel_mock_selection_rules', [{
  ...exactSelectionInput,
  id: 2001,
  color: 'invalid',
  conditions: { ...exactSelectionInput.conditions, avgGmvOnAccDaysMax: 999 },
  updatedAt: '2026-01-03T00:00:00.000Z',
}])
const migratedRules = await listMockRules()
assert.equal(migratedRules[0]?.id, 2001)
assert.equal(migratedRules[0]?.color, undefined)
assert.ok(!('avgGmvOnAccDaysMax' in (migratedRules[0]?.conditions ?? {})))
storage.clear()
const ruleInput: PanelSelectionRuleInput = {
  name: '确定性规则',
  tag: '测试',
  color: '#00aa11',
  autoFavorite: true,
  sort: 5,
  enabled: true,
  conditions: { brandOption: 1, priceMin: 800, priceMax: 1800 },
}
const created = await createMockRule(ruleInput)
assert.equal(created.id, 1003)
assert.equal(created.updatedAt, '1970-01-01T00:00:00.000Z')
assert.deepEqual((await listMockRules()).map(rule => rule.id), [1003, 1001, 1002])
assert.equal((await toggleMockRule(created.id, false)).enabled, false)
const updated = await updateMockRule(created.id, { ...ruleInput, name: '已更新' })
assert.equal(updated.name, '已更新')
assert.deepEqual(await deleteMockRule(created.id), { deleted: true })
await assert.rejects(deleteMockRule(created.id), /不存在/)

const product: OzonboxCollectedProduct = {
  source: 'OZON',
  sourceUrl: 'https://www.ozon.ru/product/example-12345/',
  productId: '12345',
  recordName: '事实商品',
  title: '事实商品',
  brand: '鲸智测试品牌',
  images: ['https://cdn.example/main.jpg'],
  price: 1_999,
  specs: [],
  variantsData: [{
    sku: 'SKU-RED',
    price: 1_899,
    oldPrice: 2_199,
    images: ['https://cdn.example/red.jpg'],
    supplierSpecText: '红色 / 1 件',
    supplierAttrs: [],
    variantAttrs: { 颜色: '红色' },
  }],
  variantAttrIds: [],
  descriptionCategoryId: 17028922,
  typeId: 97078085,
  status: 'draft',
}
const preview = buildMockListingPreview(product)
assert.equal(preview.productId, '12345')
assert.equal(preview.variants[0]?.sku, 'SKU-RED')
assert.equal(preview.variants[0]?.name, '红色 / 1 件')
assert.equal(preview.stores[0]?.usable, true)
assert.match(preview.stores[0]?.name || '', /不会访问 Ozon/)

const draftInput: PanelListingDraftInput = {
  storeId: preview.stores[0]!.id,
  productId: preview.productId,
  sourceUrl: preview.sourceUrl,
  title: preview.title,
  brand: preview.brand,
  offerId: 'JZ-12345',
  descriptionCategoryId: preview.descriptionCategoryId!,
  typeId: preview.typeId!,
  categoryName: '测试分类',
  variants: preview.variants,
  followSourceImages: true,
  watermarkEnabled: false,
  randomizeImages: false,
  modelImagesEnabled: false,
  floatingPriceEnabled: false,
}
const draft = prepareMockListingDraft(draftInput)
assert.equal(draft.status, 'ready')
assert.equal(draft.selectedVariantCount, 1)
assert.match(draft.warnings.join(' '), /不会写入后端或 Ozon/)
assert.throws(
  () => prepareMockListingDraft({
    ...draftInput,
    variants: draftInput.variants.map(variant => ({ ...variant, selected: false })),
  }),
  /至少选择一个真实变体/,
)

const submitted = submitMockListingDraft(draft.draftId)
assert.equal(submitted.simulated, true)
assert.equal(submitted.externalSubmitted, false)
assert.equal(submitted.taskId, `MOCK-${draft.draftId}`)
assert.match(submitted.message, /未向 Ozon 发送任何请求/)

const backgroundSource = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8')
const selectionUiSource = readFileSync(new URL('../lib/ozonbox/floating-panel-tools.ts', import.meta.url), 'utf8')
assert.ok(backgroundSource.includes('requireAuthentication: false'))
assert.ok(backgroundSource.includes('enrichFromSeller: false'))
assert.ok(backgroundSource.includes("case 'PANEL_LISTING_PREPARE'"))
assert.ok(backgroundSource.includes("case 'PANEL_LISTING_SUBMIT'"))
assert.ok(backgroundSource.indexOf("case 'PANEL_LISTING_PREPARE'") < backgroundSource.indexOf("case 'PANEL_LISTING_SUBMIT'"))
for (const label of ['规则名称', '标签', '自动收藏', '是否启用', '优先级', '更新时间', '操作']) {
  assert.ok(selectionUiSource.includes(label), `missing exact selection label: ${label}`)
}
assert.ok(selectionUiSource.includes('保存设置(规则生效)'))
assert.ok(selectionUiSource.includes('>确定</button>'))
assert.ok(selectionUiSource.includes("const PANEL_SELECTION_RULES_STORAGE_KEY = 'jingzhi_ai_product_selection_rules'"))
assert.ok(!/["']productSelectionRules["']/.test(selectionUiSource))

console.log('Panel tools fixtures passed: contracts, deterministic MOCK, safe colors and truthful listing boundary')