import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { OzonboxCollectedProduct } from '../lib/ozonbox/contract'
import { validatedErpBaseUrl } from '../lib/ozonbox/erp-url'
import { panelPricingFrameUrl, panelRuleColorInputValue, sanitizePanelRuleColor } from '../lib/ozonbox/floating-panel-tools'
import {
  isPanelToolRequest,
  requirePanelToolData,
  type PanelListingDraftInput,
  type PanelPricingContext,
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
    runtime: {
      getURL: (path: string) => `chrome-extension://test-extension/${path.replace(/^\//, '')}`,
    },
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

assert.equal(validatedErpBaseUrl(' https://erp.example.com/// '), 'https://erp.example.com')
assert.throws(() => validatedErpBaseUrl(''), /请先配置 ERP Web 地址/)
assert.throws(() => validatedErpBaseUrl('not-a-url'), /ERP Web 地址格式无效/)
assert.throws(() => validatedErpBaseUrl('ftp://erp.example.com'), /只支持 http\/https/)
assert.throws(
  () => validatedErpBaseUrl('https://user:pass@erp.example.com'),
  /不能包含凭据、查询参数或锚点/,
)
assert.throws(() => validatedErpBaseUrl('https://erp.example.com?x=1'), /不能包含凭据、查询参数或锚点/)
assert.throws(() => validatedErpBaseUrl('https://erp.example.com/#/x'), /不能包含凭据、查询参数或锚点/)

const pricingContext: PanelPricingContext = {
  route: 'calculate2',
  sku: 'SKU-事实/01',
  productName: '事实商品 & 专用款',
  sellPrice: 1_999.5,
  packageWeight: 850,
  packageLength: 320,
  packageWidth: 210,
  packageHeight: 95,
  packageVolumeCm3: 6_384,
  rfbsRate: [15.5],
  categoryIds: [17028922, 97078085],
}

function pricingUrlFacts(url: string): { route: string; params: URLSearchParams } {
  const parsed = new URL(url)
  assert.equal(parsed.protocol, 'chrome-extension:')
  assert.equal(parsed.hostname, 'test-extension')
  assert.equal(parsed.pathname, '/panel-pricing.html')
  const match = parsed.hash.match(/^#\/(calculate2|calculate)\?(.*)$/)
  assert.ok(match, `invalid pricing page hash: ${parsed.hash}`)
  return { route: match[1]!, params: new URLSearchParams(match[2]!) }
}

const profitFrameUrl = panelPricingFrameUrl('calculate2', pricingContext)
const profitFacts = pricingUrlFacts(profitFrameUrl)
assert.equal(profitFacts.route, 'calculate2')
assert.equal(profitFacts.params.get('sku'), pricingContext.sku)
assert.equal(profitFacts.params.get('product_name'), pricingContext.productName)
assert.equal(profitFacts.params.get('sell_price'), String(pricingContext.sellPrice))
assert.equal(profitFacts.params.get('package_weight'), String(pricingContext.packageWeight))
assert.equal(profitFacts.params.get('package_length'), String(pricingContext.packageLength))
assert.equal(profitFacts.params.get('package_width'), String(pricingContext.packageWidth))
assert.equal(profitFacts.params.get('package_height'), String(pricingContext.packageHeight))
assert.equal(profitFacts.params.get('package_volume'), String(pricingContext.packageVolumeCm3))
assert.deepEqual(JSON.parse(profitFacts.params.get('rfbs_rate') ?? '[]'), pricingContext.rfbsRate)
assert.deepEqual(JSON.parse(profitFacts.params.get('category_ids') ?? '[]'), pricingContext.categoryIds)

const suggestedPriceContext: PanelPricingContext = { ...pricingContext, route: 'calculate' }
const pricingFrameUrl = panelPricingFrameUrl('calculate', suggestedPriceContext)
const pricingFacts = pricingUrlFacts(pricingFrameUrl)
assert.equal(pricingFacts.route, 'calculate')
assert.notEqual(pricingFrameUrl, profitFrameUrl)
assert.throws(
  () => panelPricingFrameUrl('calculate', pricingContext),
  /定价页面与商品事实路由不一致/,
)

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
assert.ok(isPanelToolRequest({ type: 'PANEL_LISTING_PREVIEW' }))
assert.ok(isPanelToolRequest({ type: 'PANEL_LISTING_PREVIEW', product }))
assert.ok(!isPanelToolRequest({
  type: 'PANEL_LISTING_PREVIEW',
  product: { ...product, productId: '0' },
}))
assert.ok(isPanelToolRequest({ type: 'PANEL_LISTING_PREPARE', input: draftInput }))
assert.ok(isPanelToolRequest({ type: 'PANEL_LISTING_PREPARE', input: draftInput, product }))
assert.ok(!isPanelToolRequest({
  type: 'PANEL_LISTING_PREPARE',
  input: draftInput,
  product: { ...product, variantsData: [] },
}))
assert.ok(isPanelToolRequest({ type: 'PANEL_PRICING_CONTEXT', route: 'calculate' }))
assert.ok(isPanelToolRequest({ type: 'PANEL_PRICING_CONTEXT', route: 'calculate2', product }))
assert.ok(!isPanelToolRequest({
  type: 'PANEL_PRICING_CONTEXT',
  route: 'calculate',
  product: { ...product, productId: '0' },
}))
assert.ok(!isPanelToolRequest({ type: 'PANEL_PRICING_CONTEXT', route: 'calculate3', product }))
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
const panelToolsSource = readFileSync(new URL('../lib/ozonbox/floating-panel-tools.ts', import.meta.url), 'utf8')
const floatingPanelSource = readFileSync(new URL('../lib/ozonbox/floating-panel.ts', import.meta.url), 'utf8')
const pricingPageSource = readFileSync(new URL('../entrypoints/panel-pricing/main.ts', import.meta.url), 'utf8')
assert.ok(backgroundSource.includes('requireAuthentication: false'))
assert.ok(backgroundSource.includes('enrichFromSeller: false'))
assert.ok(backgroundSource.includes("case 'PANEL_LISTING_PREPARE'"))
assert.ok(backgroundSource.includes("case 'PANEL_LISTING_SUBMIT'"))
assert.ok(backgroundSource.indexOf("case 'PANEL_LISTING_PREPARE'") < backgroundSource.indexOf("case 'PANEL_LISTING_SUBMIT'"))
assert.ok(backgroundSource.includes("from '@/lib/ozonbox/erp-url'"))
assert.ok(!backgroundSource.includes('function validatedErpBaseUrl'))
const explicitProductIndex = backgroundSource.indexOf(
  'if (product !== undefined) return Promise.resolve(assertOzonboxCollectedProduct(product))',
)
const currentTabFallbackIndex = backgroundSource.indexOf(
  'return collectOzonProductInTab(tabId, options)',
  explicitProductIndex,
)
assert.ok(
  explicitProductIndex >= 0 && explicitProductIndex < currentTabFallbackIndex,
  'an explicit collected product must be validated and returned before current-tab collection is considered',
)
const exactCardCollectionFacts = [
  'const identity = exactCardProductIdentity(request)',
  'return withExactCardProductTab(identity, async (tabId) => {',
  'const temporaryTab = await browser.tabs.create({ url: identity.sourceUrl, active: false })',
  'await waitForExactOzonProductTab(temporaryTabId, identity.sku)',
  'const product = await collectOzonProductInTab(tabId)',
  'requireExactLoadedProductUrl(finalTab.url, identity.sku)',
  'return assertExactCollectedCardIdentity(product, identity.sku)',
  'finally {',
  'await browser.tabs.remove(temporaryTabId)',
  "type === 'OZONBOX_COLLECT_CARD_PRODUCT'",
  'collectExactCardProduct(request).then((product) => {',
]
for (const fact of exactCardCollectionFacts) {
  assert.ok(backgroundSource.includes(fact), `exact card collection is missing: ${fact}`)
}
assert.ok(backgroundSource.includes('collectedProductForRequest(request.product, tabId, {'))
assert.ok(backgroundSource.includes('const product = await collectedProductForRequest(request.product, tabId)'))
assert.ok(backgroundSource.includes('const product = await collectedProductForRequest(request.product, tabId, mode === \'mock\''))
assert.ok(backgroundSource.includes('factualPricingContext(product, request.route)'))
assert.ok(!backgroundSource.includes('listingProductForRequest'))
assert.ok(floatingPanelSource.includes("panelTools.openListing({ source: listingButton })"))
assert.ok(floatingPanelSource.includes("panelTools.openPricing('calculate2', { source: profitButton })"))
assert.ok(floatingPanelSource.includes("panelTools.openPricing('calculate', { source: pricingButton })"))
assert.ok(floatingPanelSource.includes('openListingForProduct: (product) => panelTools.openListing({ product })'))
assert.ok(floatingPanelSource.includes('openPricingForProduct: (route, product) => panelTools.openPricing(route, { product })'))
assert.ok(panelToolsSource.includes("from './erp-url'"))
assert.ok(panelToolsSource.includes("type: 'PANEL_SETTINGS_GET'"))
assert.ok(panelToolsSource.includes("type: 'PANEL_PRICING_CONTEXT'"))
assert.ok(panelToolsSource.includes("? { type: 'PANEL_PRICING_CONTEXT', route, product: options.product }"))
assert.ok(panelToolsSource.includes(": { type: 'PANEL_PRICING_CONTEXT', route }"))
for (const key of [
  'sku',
  'product_name',
  'sell_price',
  'package_weight',
  'package_length',
  'package_width',
  'package_height',
  'package_volume',
  'rfbs_rate',
  'category_ids',
]) {
  assert.ok(panelToolsSource.includes(`${key}:`), `missing exact pricing query key: ${key}`)
}
const openPricingStart = panelToolsSource.indexOf('const openPricing =')
const openPricingEnd = panelToolsSource.indexOf('const openSelectionEditor =', openPricingStart)
assert.ok(openPricingStart >= 0 && openPricingEnd > openPricingStart)
const openPricingSource = panelToolsSource.slice(openPricingStart, openPricingEnd)
assert.ok(!openPricingSource.includes('PANEL_SETTINGS_GET'))
assert.ok(!openPricingSource.includes('erpBaseUrl'))
assert.ok(!openPricingSource.includes('validatedErpBaseUrl'))
assert.ok(openPricingSource.includes('panelPricingFrameUrl(route, contextResponse.data)'))
assert.ok(backgroundSource.includes('const baseUrl = validatedErpBaseUrl(current.erpBaseUrl)'), 'genuine ERP navigation must retain centralized URL validation')
assert.ok(panelToolsSource.includes('#/${route}?${params.toString()}'))
assert.ok(panelToolsSource.includes("browser.runtime.getURL('/panel-pricing.html')"))
for (const queryKey of ['sku', 'product_name', 'package_volume']) {
  assert.ok(pricingPageSource.includes(`params.get('${queryKey}')`), `pricing page must read ${queryKey}`)
}
for (const label of ['商品名称', 'SKU', '包装体积']) {
  assert.ok(pricingPageSource.includes(label), `pricing page must visibly render ${label}`)
}
assert.ok(pricingPageSource.includes('data-calculator="profit"'))
assert.ok(pricingPageSource.includes('data-calculator="pricing"'))
assert.ok(pricingPageSource.includes('<button type="submit">计算利润</button>'))
assert.ok(pricingPageSource.includes('<button type="submit">计算建议售价</button>'))
assert.ok(panelToolsSource.includes('frameborder="0"'))
assert.ok(panelToolsSource.includes('allow="fullscreen"'))
assert.ok(panelToolsSource.includes('z-index:2147483647'))
assert.ok(panelToolsSource.includes("const DRAWER_WIDTH_KEY = 'drawerWidth'"))
assert.ok(panelToolsSource.includes("const LEGACY_DRAWER_WIDTH_KEY = 'jingzhi_ai_panel_pricing_drawer_width'"))
assert.ok(panelToolsSource.includes('const DEFAULT_DRAWER_WIDTH = 500'))
assert.ok(panelToolsSource.includes('const MIN_DRAWER_WIDTH = 300'))
assert.ok(panelToolsSource.includes("[DRAWER_WIDTH_KEY]: String(legacyWidth)"))
assert.ok(panelToolsSource.includes("[DRAWER_WIDTH_KEY]: String(Math.round(surface.getBoundingClientRect().width))"))
assert.ok(panelToolsSource.includes("setHeader('一键上架到OZON', '', false, false, true)"))
assert.ok(panelToolsSource.includes('type PanelListingDraftResult,'))
assert.ok(panelToolsSource.includes('let listingDraft: PanelListingDraftResult | undefined'))
assert.ok(panelToolsSource.indexOf('const token = open(options.source)') < panelToolsSource.indexOf('listingDraft = undefined'))
assert.ok(panelToolsSource.indexOf('listingDraft = undefined') < panelToolsSource.indexOf("setHeader('一键上架到OZON', '', false, false, true)"))
assert.ok(panelToolsSource.includes('.jz-surface.listing{width:70%;max-width:none;padding:20px 24px;border:0;border-radius:8px;'))
assert.ok(panelToolsSource.includes('注意：请先选择上架货币，再批量设置价格，如果你选择了多个店铺，请确保所选的店铺货币一致，最终上架货币以店铺设置为准。表格左侧的勾选框只做批量删除变体用途。'))

for (const label of [
  '选择店铺',
  '品牌',
  '图片顺序',
  '上架方式',
  '水印',
  '合并变体',
  '浮动价格',
]) {
  assert.ok(panelToolsSource.includes(label), `listing top form should render ${label}`)
}
for (const value of ['copy', 'none', 'shuffle', 'main_fixed', 'hand', 'api']) {
  assert.ok(panelToolsSource.includes(`<option value="${value}"`), `listing top form should retain option value ${value}`)
}
for (const label of ['复制当前品牌', '无品牌', '不处理', '随机打乱', '主图不变,其余打乱', '防侵权跟卖', '强制跟卖']) {
  assert.ok(panelToolsSource.includes(`>${label}</option>`), `listing top form should retain option label ${label}`)
}

const listingColgroupStart = panelToolsSource.indexOf('<colgroup><col style="width:60px">')
const listingColgroupEnd = panelToolsSource.indexOf('</colgroup>', listingColgroupStart)
assert.ok(listingColgroupStart >= 0 && listingColgroupEnd > listingColgroupStart)
assert.equal(
  panelToolsSource.slice(listingColgroupStart, listingColgroupEnd).match(/<col\b/g)?.length,
  13,
  'listing variants table should preserve all 13 reference columns',
)
const listingHeaderStart = panelToolsSource.indexOf('<thead><tr>', listingColgroupEnd)
const listingHeaderEnd = panelToolsSource.indexOf('</thead>', listingHeaderStart)
assert.ok(listingHeaderStart >= 0 && listingHeaderEnd > listingHeaderStart)
const listingHeaderSource = panelToolsSource.slice(listingHeaderStart, listingHeaderEnd)
for (const label of [
  '序号',
  '主图',
  '变体',
  'SKU',
  '货号',
  '原售价',
  '我的售价',
  '我的划线价',
  '自定义重量(g)',
  '包装尺寸(mm)(选填)',
  '条形码(FBP)(选填)',
  '操作',
]) {
  assert.ok(listingHeaderSource.includes(label), `listing table should render ${label}`)
}
for (const label of ['货源价格', '货源链接', '货源备注', '显示所有SKU', '上架货币', '一键上架至OZON', '取消']) {
  assert.ok(panelToolsSource.includes(label), `listing source/footer should render ${label}`)
}

for (const action of [
  'listing-shops-toggle',
  'listing-shops-done',
  'listing-model-random',
  'listing-select-all',
  'listing-select-invert',
  'listing-delete-selected',
  'listing-row-delete',
  'listing-page',
  'listing-popover',
  'listing-popover-close',
  'listing-offer-apply',
  'listing-price-apply',
  'listing-old-price-apply',
  'listing-weight-first',
  'listing-dimensions-first',
  'listing-barcode-generate',
  'listing-cancel',
]) {
  assert.ok(panelToolsSource.includes(`data-action="${action}"`), `listing should render ${action}`)
}
for (const action of [
  'listing-shops-toggle',
  'listing-shops-done',
  'listing-model-random',
  'listing-select-all',
  'listing-select-invert',
  'listing-delete-selected',
  'listing-row-delete',
  'listing-page',
  'listing-popover',
  'listing-popover-close',
  'listing-offer-apply',
  'listing-price-apply',
  'listing-old-price-apply',
  'listing-weight-first',
  'listing-dimensions-first',
  'listing-barcode-generate',
  'listing-cancel',
]) {
  assert.ok(panelToolsSource.includes(`action === '${action}'`), `listing should handle ${action}`)
}
for (const ariaLabel of ['货号生成设置', '批量设置售价', '批量设置划线价']) {
  assert.ok(panelToolsSource.includes(`aria-label="${ariaLabel}"`), `listing popover should expose ${ariaLabel}`)
}

assert.ok(panelToolsSource.includes('priceInput: string'))
assert.ok(panelToolsSource.includes('oldPriceInput: string'))
assert.ok(panelToolsSource.includes("querySelector<HTMLInputElement>('[data-field=\"priceRub\"]')?.value.trim()"))
assert.ok(panelToolsSource.includes("querySelector<HTMLInputElement>('[data-field=\"oldPriceRub\"]')?.value.trim()"))
assert.ok(panelToolsSource.includes('value="${escapeHtml(row.priceInput)}"'))
assert.ok(panelToolsSource.includes('value="${escapeHtml(row.oldPriceInput)}"'))
assert.ok(panelToolsSource.includes('priceRub: row.priceRub'))
assert.ok(panelToolsSource.includes('oldPriceRub: row.oldPriceRub'))
assert.ok(panelToolsSource.includes('selected: true'))

assert.ok(panelToolsSource.includes('data-form="listing" novalidate'))
assert.ok(panelToolsSource.includes('listingRows.forEach((row, index) => {'))
assert.ok(panelToolsSource.includes('listingPage = Math.floor(index / LISTING_PAGE_SIZE) + 1'))
assert.ok(panelToolsSource.includes('listingPopover = undefined'))
assert.ok(panelToolsSource.includes('renderListingForm(preview)'))
assert.ok(panelToolsSource.includes('`[data-listing-row="${CSS.escape(row.key)}"]`'))
assert.ok(panelToolsSource.includes("const activeForm = required<HTMLFormElement>(body, 'form[data-form=\"listing\"]')"))
assert.ok(panelToolsSource.includes("element.classList.add('invalid')"))
assert.ok(panelToolsSource.includes('element.focus()'))
for (const message of ['货号不能为空', '售价不能为空', '请输入有效的划线价', '划线价必须大于售价']) {
  assert.ok(panelToolsSource.includes(message), `listing validation should retain ${message}`)
}

assert.ok(panelToolsSource.includes("root.addEventListener('input'"))
assert.ok(panelToolsSource.includes("target.name === 'shopSearch'"))
assert.ok(panelToolsSource.includes("querySelectorAll<HTMLElement>('[data-shop-option]')"))
assert.ok(panelToolsSource.includes("root.addEventListener('change'"))
for (const name of ['offerRule', 'batchPriceMode', 'batchOldPriceMode', 'currency', 'brand', 'imageOrder', 'followType', 'watermarkId', 'showAllSku']) {
  assert.ok(panelToolsSource.includes(`target.name === '${name}'`), `listing change handler should persist ${name}`)
}

assert.ok(panelToolsSource.includes("type: 'PANEL_LISTING_PREVIEW'"))
assert.ok(panelToolsSource.includes('let listingProduct: OzonboxCollectedProduct | undefined'))
const listingProductAssignmentIndex = panelToolsSource.indexOf('listingProduct = options.product')
const explicitPreviewRequestIndex = panelToolsSource.indexOf(
  "? { type: 'PANEL_LISTING_PREVIEW', product: listingProduct }",
  listingProductAssignmentIndex,
)
const omittedPreviewRequestIndex = panelToolsSource.indexOf(
  ": { type: 'PANEL_LISTING_PREVIEW' }",
  explicitPreviewRequestIndex,
)
const explicitPrepareRequestIndex = panelToolsSource.indexOf(
  "? { type: 'PANEL_LISTING_PREPARE', input, product: listingProduct }",
  explicitPreviewRequestIndex,
)
const omittedPrepareRequestIndex = panelToolsSource.indexOf(
  ": { type: 'PANEL_LISTING_PREPARE', input }",
  explicitPrepareRequestIndex,
)
assert.ok(
  listingProductAssignmentIndex >= 0
    && listingProductAssignmentIndex < explicitPreviewRequestIndex
    && explicitPreviewRequestIndex < omittedPreviewRequestIndex
    && omittedPreviewRequestIndex < explicitPrepareRequestIndex
    && explicitPrepareRequestIndex < omittedPrepareRequestIndex,
  'one modal-scoped selected product must feed both PREVIEW and PREPARE while detail mode may omit it',
)
assert.ok(
  (panelToolsSource.match(/listingProduct = undefined/g) ?? []).length >= 3,
  'generic open, close, and stop must clear stale selected-card product context',
)
const prepareRequestIndex = panelToolsSource.indexOf(
  'requestPanelTool<PanelListingDraftResult>(prepareRequest)',
  explicitPrepareRequestIndex,
)
const draftAssignmentIndex = panelToolsSource.indexOf('listingDraft = response.data', prepareRequestIndex)
const draftRenderIndex = panelToolsSource.indexOf('renderListingDraft(response.data)', draftAssignmentIndex)
assert.ok(
  prepareRequestIndex >= 0 && prepareRequestIndex < draftAssignmentIndex && draftAssignmentIndex < draftRenderIndex,
  'listing form should prepare, retain, then render the draft',
)
const confirmHandlerIndex = panelToolsSource.indexOf("action === 'listing-confirm' && listingDraft")
const submitHandlerIndex = panelToolsSource.indexOf("action === 'listing-submit' && listingDraft")
const draftIdIndex = panelToolsSource.indexOf('const draftId = listingDraft.draftId', submitHandlerIndex)
const submitRequestIndex = panelToolsSource.indexOf("type: 'PANEL_LISTING_SUBMIT'", draftIdIndex)
assert.ok(confirmHandlerIndex >= 0 && confirmHandlerIndex < submitHandlerIndex)
assert.ok(
  submitHandlerIndex < draftIdIndex && draftIdIndex < submitRequestIndex,
  'listing submit should require the explicitly confirmed prepared draft',
)
assert.ok(panelToolsSource.includes("categoryName: ''"))
assert.ok(!panelToolsSource.includes('categoryName: `Ozon ${'))
for (const label of ['显示所有SKU：', '>是</span>', '>否</span>', '上架货币：', '选择币种', '一键上架至OZON', '>取消</button>']) {
  assert.ok(panelToolsSource.includes(label), `missing exact listing label: ${label}`)
}
for (const [label, value] of [
  ['[¥]人民币', 'CNY'],
  ['[₽]俄罗斯卢布', 'RUB'],
  ['[$]美元', 'USD'],
  ['[€]欧元', 'EUR'],
  ['[Br]白俄罗斯卢布', 'BYN'],
  ['[₸]哈萨克斯坦坚戈', 'KZT'],
]) {
  assert.ok(panelToolsSource.includes(`{ label: '${label}', value: '${value}' }`), `missing exact listing currency: ${value}`)
}
assert.ok(panelToolsSource.includes("throw new Error(value ? '上架货币无效' : '请选择上架货币')"))
assert.ok(panelToolsSource.includes('currency: listingCurrencyFromForm(form)'))
assert.ok(panelToolsSource.includes("listingShowAllSku = form.has('showAllSku')"))
assert.ok(panelToolsSource.includes('showAllSku: listingShowAllSku'))
assert.ok(panelToolsSource.includes("surface.classList.contains('selection') || surface.classList.contains('drawer') || surface.classList.contains('listing')"))

for (const cssFact of [
  '.jz-tools.selection-open{overflow:auto}',
  '.jz-tools.selection-open .jz-tools-backdrop{position:fixed;background:#00000073;backdrop-filter:none}',
  '.jz-surface.selection{top:100px;width:900px;max-width:calc(100vw - 32px);max-height:none;padding:20px 24px;',
  '.jz-selection-content{padding:16px 0}',
  '.jz-selection-footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:12px}',
  '.jz-selection-layer{position:fixed;inset:0;z-index:4;overflow:auto}',
  '.jz-selection-editor-mask{position:fixed;inset:0;background:#00000073}',
  '.jz-selection-editor{position:relative;width:600px;max-width:calc(100vw - 32px);margin:100px auto 24px;padding:20px 24px;',
  '.jz-selection-editor-body{max-height:70vh;padding:16px 0;overflow-y:auto}',
  '.jz-selection-editor-footer{display:flex;justify-content:flex-end;gap:12px;margin-top:12px}',
]) {
  assert.ok(panelToolsSource.includes(cssFact), `missing exact selection modal CSS: ${cssFact}`)
}

for (const iconPath of [
  'M482 152h60q8 0 8 8v704q0 8-8 8h-60q-8 0-8-8V160q0-8 8-8z',
  'M192 474h672q8 0 8 8v60q0 8-8 8H160q-8 0-8-8v-60q0-8 8-8z',
  'M799.86 166.31c.02 0 .04.02.08.06l57.69 57.7c.04.03.05.05.06.08a.12.12 0 010 .06c0 .03-.02.05-.06.09L569.93 512l287.7 287.7c.04.04.05.06.06.09a.12.12 0 010 .07c0 .02-.02.04-.06.08l-57.7 57.69c-.03.04-.05.05-.07.06a.12.12 0 01-.07 0c-.03 0-.05-.02-.09-.06L512 569.93l-287.7 287.7c-.04.04-.06.05-.09.06a.12.12 0 01-.07 0c-.02 0-.04-.02-.08-.06l-57.69-57.7c-.04-.03-.05-.05-.06-.07a.12.12 0 010-.07c0-.03.02-.05.06-.09L454.07 512l-287.7-287.7c-.04-.04-.05-.06-.06-.09a.12.12 0 010-.07c0-.02.02-.04.06-.08l57.7-57.69c.03-.04.05-.05.07-.06a.12.12 0 01.07 0c.03 0 .05.02.09.06L512 454.07l287.7-287.7c.04-.04.06-.05.09-.06a.12.12 0 01.07 0z',
  'M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z',
  'M464 336a48 48 0 1096 0 48 48 0 10-96 0zm72 112h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8V456c0-4.4-3.6-8-8-8z',
]) {
  assert.ok(panelToolsSource.includes(iconPath), `missing exact selection icon path: ${iconPath.slice(0, 24)}`)
}
assert.ok(panelToolsSource.includes('.jz-selection-close-icon{display:none;width:1em;height:1em;margin:auto;font-size:16px}'))
assert.ok(panelToolsSource.includes('.jz-surface.selection .jz-selection-close-icon,.jz-selection-editor .jz-selection-close-icon{display:block}'))
assert.ok(panelToolsSource.includes('.jz-surface.selection .jz-close-text{display:none}'))
assert.ok(!/(?:^|})\.jz-close-text\{display:none}/m.test(panelToolsSource))

assert.ok(panelToolsSource.includes('<span class="jz-selection-count">共 ${selectionRules.length} 条规则</span>'))
assert.ok(panelToolsSource.includes('${plusOutlinedIconHtml()}<span>新增规则</span>'))
const selectionColumnMarkup = '<colgroup><col style="width:200px"><col style="width:120px"><col style="width:120px"><col style="width:120px"><col style="width:100px"><col style="width:150px"><col style="width:150px"></colgroup><thead><tr><th>规则名称</th><th class="center">标签</th><th class="center">自动收藏</th><th class="center">是否启用</th><th class="center">优先级</th><th class="center">更新时间</th><th class="center">操作</th></tr></thead>'
assert.ok(panelToolsSource.includes(selectionColumnMarkup))
for (const tableCssFact of [
  '.jz-selection-table-wrap{overflow:visible;border-top:1px solid #f0f0f0;border-inline-start:1px solid #f0f0f0}',
  '.jz-selection-table th,.jz-selection-table td{position:relative;padding:8px;border-inline-end:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;',
  '.jz-selection-table th{background:#fafafa;',
  '.jz-selection-table tbody tr:hover>td{background:#fafafa}',
  '.jz-selection-empty{padding:48px 16px!important;color:#00000040;text-align:center!important}',
]) {
  assert.ok(panelToolsSource.includes(tableCssFact), `missing exact small bordered selection table CSS: ${tableCssFact}`)
}

for (const switchFact of [
  '.jz-selection-switch{position:relative;display:inline-block;min-width:44px;height:22px;',
  '.jz-selection-switch-handle{position:absolute;top:2px;left:2px;width:18px;height:18px;',
  '.jz-selection-switch.on .jz-selection-switch-handle{left:calc(100% - 20px)}',
  '.jz-selection-switch-inner{display:block;height:100%;padding-right:9px;padding-left:24px;',
  '.jz-selection-switch.on .jz-selection-switch-inner{padding-right:24px;padding-left:9px}',
  "${rule.enabled ? '启用' : '禁用'}",
]) {
  assert.ok(panelToolsSource.includes(switchFact), `missing exact selection switch fact: ${switchFact}`)
}
assert.ok(panelToolsSource.includes('class="jz-button small link" type="button" data-action="selection-edit"'))
assert.ok(panelToolsSource.includes('class="jz-button small link dangerous" type="button" data-action="selection-delete"'))

const popconfirmCancel = '<button class="jz-button small" type="button" data-action="selection-delete-cancel">取消</button>'
const popconfirmConfirm = '<button class="jz-button small primary" type="button" data-action="selection-delete-confirm" data-id="${rule.id}">确定</button>'
assert.ok(panelToolsSource.includes('<div class="jz-selection-popover-title">确认删除</div>'))
assert.ok(panelToolsSource.includes('<div class="jz-selection-popover-desc">确定要删除这个规则吗？删除后无法恢复。</div>'))
assert.ok(panelToolsSource.indexOf(popconfirmCancel) < panelToolsSource.indexOf(popconfirmConfirm))

assert.ok(panelToolsSource.includes("${editingRule ? '编辑选品规则' : '新增选品规则'}"))
assert.ok(panelToolsSource.includes('<footer class="jz-selection-editor-footer"><button class="jz-button" type="button" data-action="selection-editor-cancel">取消</button><button class="jz-button primary" type="submit" form="jz-selection-editor-form">${editingRule ? \'保存\' : \'确定\'}</button></footer>'))
assert.ok(panelToolsSource.includes('<footer class="jz-selection-footer"><button class="jz-button" type="button" data-action="selection-main-cancel">取消</button><button class="jz-button primary" type="button" data-action="selection-save">保存设置(规则生效)</button></footer>'))

const priorityMarkup = '<label class="jz-form-label" for="jz-selection-sort">优先级</label><div class="jz-form-control"><div class="jz-priority-row"><input class="jz-input" id="jz-selection-sort" name="sort" type="number" min="0" max="100" step="1" placeholder="请输入优先级"'
assert.ok(panelToolsSource.includes(priorityMarkup))
assert.ok(!panelToolsSource.includes('<label class="jz-form-label required" for="jz-selection-sort">优先级</label>'))
assert.ok(panelToolsSource.includes("const sort = Number(String(form.get('sort') ?? '').trim())"))
assert.ok(panelToolsSource.includes("if (!Number.isInteger(sort) || sort < 0 || sort > 100) throw new Error('优先级范围为0-100')"))
assert.ok(panelToolsSource.includes('title="注：这里优先级的意思是指当应用了多条规则时，&#10;卡片背景颜色以优先级高的规则为准。&#10;如果不理解请保持默认即可"'))
assert.ok(panelToolsSource.includes('<span>数值越大优先匹配</span>${infoCircleOutlinedIconHtml()}'))

assert.ok(panelToolsSource.includes('title="选择卡片背景颜色" aria-label="卡片背景颜色"'))
assert.ok(panelToolsSource.includes("${escapeHtml(color ?? '不设置')}"))
assert.ok(panelToolsSource.includes("${color ? selectionColorClearButtonHtml() : ''}"))
assert.ok(panelToolsSource.includes('data-action="selection-color-clear">清除</button>'))
assert.ok(panelToolsSource.includes("const PANEL_SELECTION_RULES_STORAGE_KEY = 'jingzhi_ai_product_selection_rules'"))
assert.ok(!/["']productSelectionRules["']/.test(panelToolsSource))
const enabledRulesIndex = panelToolsSource.indexOf('const enabledRules = selectionRules.filter(rule => rule.enabled)')
const selectionStorageIndex = panelToolsSource.indexOf('void browser.storage.local.set({ [PANEL_SELECTION_RULES_STORAGE_KEY]: enabledRules })')
const selectionReloadIndex = panelToolsSource.indexOf('window.location.reload()', selectionStorageIndex)
assert.ok(enabledRulesIndex >= 0 && enabledRulesIndex < selectionStorageIndex)
assert.ok(selectionStorageIndex >= 0 && selectionStorageIndex < selectionReloadIndex)

console.log('Panel tools fixtures passed: contracts, deterministic MOCK, exact selection UI and truthful listing boundary')