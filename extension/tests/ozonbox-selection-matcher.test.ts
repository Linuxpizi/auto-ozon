import assert from 'node:assert/strict'
import type { OzonboxCollectedProduct } from '../lib/ozonbox/contract'
import type { PanelSelectionConditions, PanelSelectionRule } from '../lib/ozonbox/panel-tools-contract'
import {
  buildOzonSelectionCandidate,
  finiteMetric,
  isRecognizedBrand,
  matchesSelectionRule,
  matchSelectionRules,
  type OzonSelectionCandidate,
} from '../lib/ozonbox/selection-matcher'

const product: OzonboxCollectedProduct = {
  source: 'OZON',
  sourceUrl: 'https://www.ozon.ru/product/factual-product-12345/',
  productId: '12345',
  recordName: '事实商品',
  sku: '12345',
  title: '事实商品',
  brand: 'PDP 品牌',
  images: ['https://cdn.example/product.jpg'],
  price: 1_100,
  specs: [],
  variantsData: [],
  variantAttrIds: [],
  ozonMetrics: {
    sku: '12345', articleNumber: 'A-1', brand: '', category: '', promotions: [], paidPromotion: '',
    monthlyRevenue: 0, monthlySales: 0, turnoverDynamics: '', followersCount: 0,
    minPrice: 0, maxPrice: 0, rfbsCommission: 0, fbpCommission: 0, conversionRate: 0,
    volumeCm3: 0, lengthMm: 0, widthMm: 0, heightMm: 0, weightG: 850,
    packageWeightG: 900, packageLengthMm: 0, packageWidthMm: 0, packageHeightMm: 0,
    warehouse: '', warehouseId: '', logisticsType: '', deliveryMethod: '', deliveryRegion: '', deliveryDays: 0,
    listedAt: '', missingFields: [],
  },
  status: 'draft',
}

function rule(
  id: number,
  conditions: Partial<PanelSelectionConditions> = {},
  options: Partial<PanelSelectionRule> = {},
): PanelSelectionRule {
  return {
    id,
    name: `规则 ${id}`,
    tag: `R${id}`,
    autoFavorite: false,
    sort: id,
    enabled: true,
    conditions: { brandOption: 2, ...conditions },
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...options,
  }
}

const completeCandidate: OzonSelectionCandidate = {
  brand: 'Acme', soldCount: 10, soldSumCny: 2_000, priceCny: 100,
  weightG: 850, listedDays: 30, salesDynamics: 12, drr: 5,
  daysInPromo: 8, discount: 15, promoRevenueShare: 25, daysWithTrafarets: 4,
  qtyViewPdp: 1_000, convToCartPdp: 9, sessionCountSearch: 500,
  convToCartSearch: 7, convViewToOrder: 3, salesSchema: 'FBO', cancelRate: 2,
  sellerCount: 2, hasExplicitNoSellers: false, minimumPriceFollowRub: 950,
}

assert.equal(finiteMetric(undefined), undefined)
assert.equal(finiteMetric(null), undefined)
assert.equal(finiteMetric(''), undefined)
assert.equal(finiteMetric('暂无数据'), undefined)
assert.equal(finiteMetric('1 234,50 ₽'), 1234.5)
assert.equal(finiteMetric('12.5%'), 12.5)
assert.equal(finiteMetric(Number.NaN), undefined)

const candidate = buildOzonSelectionCandidate({
  product,
  analytics: {
    brand: '分析品牌不应覆盖 PDP',
    metrics: {
      sumOrders: '10', sumGmv: '22 000 ₽', gmvGrowthRate: '12.5%', ads_share: 5,
      promo_days: 8, promoDiscount: '15%', promoConvRate: 25, trafaretDays: 4,
      hits_view_pdp: 1_000, conv_tocart_pdp: 9, hits_view_search: 500,
      conv_tocart_search: 7, conversion: 3, sellModel: 'FBO', returnsRate: 2,
      createdAt: '2026-06-24T12:00:00.000Z',
    },
  },
  rubToCny: 1 / 11,
  sellerOffers: {
    sellerCount: 2,
    hasExplicitNoSellers: false,
    minimumPriceFollowRub: 950,
    maximumPriceFollowRub: 1_050,
  },
  now: new Date('2026-07-24T12:00:00.000Z'),
})

assert.equal(candidate.brand, 'PDP 品牌')
assert.equal(candidate.soldCount, 10)
assert.equal(candidate.soldSumCny, 2_000)
assert.equal(candidate.priceCny, 100)
assert.equal(candidate.weightG, 850)
assert.equal(candidate.listedDays, 30)
assert.equal(candidate.salesDynamics, 12.5)
assert.equal(candidate.minimumPriceFollowRub, 950)
assert.deepEqual(candidate, {
  ...completeCandidate,
  brand: 'PDP 品牌',
  salesDynamics: 12.5,
})

const explicitDays = buildOzonSelectionCandidate({
  product: { ...product, brand: null },
  analytics: { brandName: '分析品牌', days_in_stock: 9, createdAt: '2020-01-01' },
  rubToCny: 0,
})
assert.equal(explicitDays.brand, '分析品牌')
assert.equal(explicitDays.listedDays, 9)
assert.equal(explicitDays.priceCny, undefined)
assert.equal(explicitDays.soldSumCny, undefined)

assert.equal(isRecognizedBrand('Acme'), true)
for (const marker of [undefined, '', ' -- ', '暂无数据', '无', '无品牌', 'БЕЗ БРЕНДА']) {
  assert.equal(isRecognizedBrand(marker), false)
}

const allConditions: PanelSelectionConditions = {
  brandOption: 1,
  soldCountMin: 10, soldCountMax: 10,
  soldSumMin: 2_000, soldSumMax: 2_000,
  priceMin: 100, priceMax: 100,
  weightMin: 850, weightMax: 850,
  listedDaysMin: 30, listedDaysMax: 30,
  salesDynamicsMin: 12, salesDynamicsMax: 13,
  drrMin: 5, drrMax: 5,
  daysInPromoMin: 8, daysInPromoMax: 8,
  discountMin: 15, discountMax: 15,
  promoRevenueShareMin: 25, promoRevenueShareMax: 25,
  daysWithTrafaretsMin: 4, daysWithTrafaretsMax: 4,
  qtyViewPdpMin: 1_000, qtyViewPdpMax: 1_000,
  convToCartPdpMin: 9, convToCartPdpMax: 9,
  sessionCountSearchMin: 500, sessionCountSearchMax: 500,
  convToCartSearchMin: 7, convToCartSearchMax: 7,
  convViewToOrderMin: 3, convViewToOrderMax: 3,
  salesSchema: 'FBO',
  cancelRateMin: 2, cancelRateMax: 2,
  sellerCountMin: 2, sellerCountMax: 2,
  minimumPriceFollowMin: 950, minimumPriceFollowMax: 950,
}
assert.equal(matchesSelectionRule(completeCandidate, rule(1, allConditions)), true)
assert.equal(matchesSelectionRule({ ...completeCandidate, drr: undefined }, rule(1, allConditions)), false)
assert.equal(matchesSelectionRule({ ...completeCandidate, soldCount: 9 }, rule(1, allConditions)), false)
assert.equal(matchesSelectionRule(completeCandidate, rule(1, allConditions, { enabled: false })), false)

assert.equal(matchesSelectionRule({ ...completeCandidate, brand: '无品牌' }, rule(2, { brandOption: 0 })), true)
assert.equal(matchesSelectionRule({ ...completeCandidate, brand: undefined }, rule(2, { brandOption: 1 })), false)
assert.equal(matchesSelectionRule({ ...completeCandidate, salesSchema: undefined }, rule(3, { salesSchema: 'FBS' })), true)
assert.equal(matchesSelectionRule({ ...completeCandidate, salesSchema: 'rFBS' }, rule(3, { salesSchema: 'FBS' })), true)
assert.equal(matchesSelectionRule({ ...completeCandidate, salesSchema: 'FBO' }, rule(3, { salesSchema: 'FBS' })), false)

const noSellerRule = rule(4, { sellerCountMin: 0, sellerCountMax: 0 })
assert.equal(matchesSelectionRule({ ...completeCandidate, sellerCount: 0, hasExplicitNoSellers: true }, noSellerRule), true)
assert.equal(matchesSelectionRule({ ...completeCandidate, sellerCount: 0, hasExplicitNoSellers: false }, noSellerRule), false)
assert.equal(matchesSelectionRule({ ...completeCandidate, sellerCount: undefined, hasExplicitNoSellers: false }, noSellerRule), false)
assert.equal(matchesSelectionRule(
  { ...completeCandidate, sellerCount: 0, hasExplicitNoSellers: true },
  rule(5, { sellerCountMin: 0, sellerCountMax: 2 }),
), true)

const matches = matchSelectionRules(completeCandidate, [
  rule(30, { soldCountMin: 999 }, { sort: 1 }),
  rule(20, { priceMin: 50 }, { sort: 5 }),
  rule(10, { soldCountMin: 1 }, { sort: 5 }),
  rule(40, {}, { sort: 0, enabled: false }),
])
assert.deepEqual(matches.map(item => item.id), [10, 20])
assert.deepEqual(matchSelectionRules(completeCandidate, [rule(1, {}, { enabled: false })]), [])

// Follow-minimum thresholds are raw RUB. Converting this value to CNY would fail this assertion.
assert.equal(matchesSelectionRule(completeCandidate, rule(6, {
  minimumPriceFollowMin: 900,
  minimumPriceFollowMax: 1_000,
})), true)

console.log('ozonbox selection matcher tests passed')