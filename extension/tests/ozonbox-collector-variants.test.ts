import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'
import {
  readDomBrand,
  readFactualBrand,
  readFactualTags,
  readOfferSelector,
  readOfferSelectorGraph,
  readOzonVariantFacts,
} from '../lib/ozonbox/collector'
import type { OzonboxCollectedProduct } from '../lib/ozonbox/contract'
import { retainExactRequestedSkuVariant } from '../lib/ozonbox/list-crawl-product'
import { toSelectionProduct } from '../lib/ozonbox/selection-product'
import {
  analyticsBrandForExactSku,
  analyticsItemForExactSku,
  collectedProductAnalyticsSku,
  mergeExactSkuAnalyticsBrand,
  normalizeAnalyticsItem,
  normalizeSellerVariantPackage,
} from '../lib/ozonbox/seller-analytics'
import { assertCompleteProduct } from '../lib/utils/product-data'

const CURRENT_PRODUCT_ID = '2957860286'
const ALTERNATE_PRODUCT_ID = '2957859292'
const CURRENT_URL = `https://www.ozon.ru/product/current-${CURRENT_PRODUCT_ID}/`
const ALTERNATE_URL = `https://www.ozon.ru/product/alternate-${ALTERNATE_PRODUCT_ID}/`

const brandSpecs = [{ name: 'Brand', value: 'Spec Brand' }]
assert.equal(readFactualBrand(' JSON-LD Brand ', brandSpecs), 'JSON-LD Brand')
assert.equal(readFactualBrand({ name: ' Structured Brand ' }, brandSpecs), 'Structured Brand')

for (const name of ['Brand', ' Бренд: ', '品牌：', 'Ｂｒａｎｄ ：']) {
  assert.equal(readFactualBrand(undefined, [{ name, value: ' Exact Brand ' }]), 'Exact Brand')
}

assert.equal(readFactualBrand(undefined, [
  { name: 'Brand name', value: 'Near Match' },
  { name: 'Бренд товара', value: 'Near Match' },
  { name: '品牌名称', value: 'Near Match' },
  { name: 'Seller', value: 'Not a Brand' },
]), undefined)
assert.equal(readFactualBrand(undefined, [{ name: 'Brand', value: '' }]), undefined)

assert.deepEqual(readFactualTags([
  { name: ' Тематика： ', value: ' Подарок на день рождения ' },
  { name: 'Стиль', value: 'Минимализм, скандинавский' },
  { name: '适用场景', value: 'Дом / офис' },
  { name: 'Theme', value: '  подарок   на день рождения  ' },
]), [
  'Подарок на день рождения',
  'Минимализм, скандинавский',
  'Дом / офис',
])
assert.deepEqual(readFactualTags([
  { name: 'Брендовая тематика', value: 'Near match' },
  { name: 'Промо-метка', value: 'Хит продаж' },
  { name: 'Название', value: 'Theme words in product title' },
  { name: 'Продавец', value: 'Seller marketing label' },
  { name: 'Style guide', value: 'Near match' },
  { name: 'Стиль', value: '' },
]), [])

function brandFixture(body: string): Document {
  return parseHTML(`<!doctype html><html><body>${body}</body></html>`).document
}

assert.equal(readDomBrand(brandFixture(`
  <div data-widget="webBrandName"><a href="/brand/acme-123/"><span> ACME </span></a></div>
  <a href="/brand/fallback-456/">Fallback Brand</a>
`)), 'ACME')
assert.equal(readDomBrand(brandFixture(`
  <div data-widget="webBrandName"><span><strong> Widget Brand </strong></span></div>
`)), 'Widget Brand')
assert.equal(readDomBrand(brandFixture(`
  <a href="https://www.ozon.ru/brand/fallback-456/"><em>Fallback Brand</em></a>
`)), 'Fallback Brand')
assert.equal(readDomBrand(brandFixture(`
  <div data-widget="webBrandName"><span>   </span></div>
  <a href="/brand/fallback-456/">Fallback Brand</a>
`)), 'Fallback Brand')
assert.equal(readDomBrand(brandFixture(`
  <h1>Title Brand</h1>
  <a href="/seller/not-a-brand/">Seller Brand</a>
`)), undefined)

const REQUESTED_ANALYTICS_SKU = '2268446233'
const exactAnalyticsData = {
  items: [
    { sku: '9999999999', brand: 'Wrong first-row brand' },
    {
      sku: Number(REQUESTED_ANALYTICS_SKU),
      title: 'Title must not become brand',
      sellerName: 'Seller must not become brand',
      promoLabel: 'Promo must not become brand',
      metrics: { brandName: ' Exact analytics brand ' },
    },
  ],
}
assert.equal(analyticsItemForExactSku(exactAnalyticsData, REQUESTED_ANALYTICS_SKU)?.sku, 2268446233)
assert.equal(analyticsBrandForExactSku(exactAnalyticsData, REQUESTED_ANALYTICS_SKU), 'Exact analytics brand')
assert.equal(analyticsItemForExactSku({ items: [{ sku: '9999999999', brand: 'Wrong brand' }] }, REQUESTED_ANALYTICS_SKU), null)
assert.equal(analyticsBrandForExactSku({
  result: { items: [{ skuName: REQUESTED_ANALYTICS_SKU, sellerName: 'Not a brand', title: 'Not a brand' }] },
}, REQUESTED_ANALYTICS_SKU), undefined)
assert.equal(analyticsItemForExactSku({ items: [{ skuName: 'SKU 2268446233', brand: 'Unproven' }] }, REQUESTED_ANALYTICS_SKU), null)

const pdpBrandProduct = { brand: 'PDP factual brand', productId: REQUESTED_ANALYTICS_SKU }
assert.equal(mergeExactSkuAnalyticsBrand(pdpBrandProduct, exactAnalyticsData, REQUESTED_ANALYTICS_SKU), pdpBrandProduct)
assert.deepEqual(
  mergeExactSkuAnalyticsBrand({ productId: REQUESTED_ANALYTICS_SKU, brand: null }, exactAnalyticsData, REQUESTED_ANALYTICS_SKU),
  { productId: REQUESTED_ANALYTICS_SKU, brand: 'Exact analytics brand' },
)
assert.equal(collectedProductAnalyticsSku({ sku: 'not-numeric', productId: REQUESTED_ANALYTICS_SKU }), REQUESTED_ANALYTICS_SKU)
assert.equal(collectedProductAnalyticsSku({ sku: REQUESTED_ANALYTICS_SKU, productId: '9999999999' }), '9999999999')

assert.deepEqual(normalizeSellerVariantPackage({
  item: { depth: 119, width: 110, height: 16, weight: 16 },
}), {
  dimension_mm: { length: 119, width: 110, height: 16 },
  weight_g: 16,
  packageFacts: {
    packageWeightG: 16,
    packageDepthMm: 119,
    packageWidthMm: 110,
    packageHeightMm: 16,
    packagePhysicalProvenance: {
      packageWeightG: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.weight',
      },
      packageDepthMm: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.depth',
      },
      packageWidthMm: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.width',
      },
      packageHeightMm: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.height',
      },
    },
  },
})
assert.deepEqual(normalizeSellerVariantPackage({
  item: { depth: '119', width: '110', height: '16', weight: '16' },
}), {
  dimension_mm: { length: 119, width: 110, height: 16 },
  weight_g: 16,
  packageFacts: {
    packageWeightG: 16,
    packageDepthMm: 119,
    packageWidthMm: 110,
    packageHeightMm: 16,
    packagePhysicalProvenance: {
      packageWeightG: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.weight',
      },
      packageDepthMm: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.depth',
      },
      packageWidthMm: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.width',
      },
      packageHeightMm: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.height',
      },
    },
  },
})
assert.deepEqual(normalizeSellerVariantPackage({
  item: { depth: 119, width: 110, weight: 16 },
}), {
  weight_g: 16,
  packageFacts: {
    packageWeightG: 16,
    packageDepthMm: 119,
    packageWidthMm: 110,
    packagePhysicalProvenance: {
      packageWeightG: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.weight',
      },
      packageDepthMm: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.depth',
      },
      packageWidthMm: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.width',
      },
    },
  },
})
const partialSellerPackage = normalizeSellerVariantPackage({ item: { weight: 77, width: 88 } })
assert.equal('dimension_mm' in partialSellerPackage, false)
assert.deepEqual(partialSellerPackage, {
  weight_g: 77,
  packageFacts: {
    packageWeightG: 77,
    packageWidthMm: 88,
    packagePhysicalProvenance: {
      packageWeightG: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.weight',
      },
      packageWidthMm: {
        source: 'ozon_seller_variant_package',
        sourcePath: 'seller.create-bundle-by-variant-id.item.width',
      },
    },
  },
})
assert.deepEqual(normalizeAnalyticsItem({ depth: 119, width: 110, height: 16, weight: 16 }), {
  depth: 119,
  width: 110,
  height: 16,
  weight: 16,
})

function aspectsFixture(currentValue: string, targetValue: string, targetProductId: string, fromSku: string): Document {
  const { document } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <div data-widget="webAspects" class="pdp_a6e">
          <div class="pdp_ha1 pdp_ba4">
            <div class="pdp_h1a">
              <div class="pdp_k9"><span>Объем, мл:</span></div>
              <div class="pdp_q5">
                <div class="pdp_q7">
                  <a
                    href="/product/target-${targetProductId}/?from_sku=${fromSku}"
                    class="pdp_f3 pdp_f2"
                  >${targetValue}</a>
                </div>
                <div class="pdp_q7">
                  <div class="pdp_f3 pdp_f4 pdp_f2">${currentValue}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section data-widget="skuShelfGoods">
          <a href="/product/recommendation-9999999999/?from_sku=${fromSku}">Recommendation</a>
        </section>
      </body>
    </html>
  `)
  return document
}

const currentPage = readOfferSelector(
  aspectsFixture('3', '2.9', ALTERNATE_PRODUCT_ID, CURRENT_PRODUCT_ID),
  CURRENT_PRODUCT_ID,
  CURRENT_URL,
)

assert.equal(currentPage.hasWidgets, true)
assert.deepEqual(currentPage.currentAttrs, { 'Объем, мл': '3' })
assert.deepEqual(currentPage.unresolvedProductIds, [])
assert.deepEqual(currentPage.links.map(({ productId }) => productId), [ALTERNATE_PRODUCT_ID])
assert.deepEqual(currentPage.variants.map(({ productId, variantAttrs }) => ({ productId, variantAttrs })), [{
  productId: ALTERNATE_PRODUCT_ID,
  variantAttrs: { 'Объем, мл': '2.9' },
}])

const alternatePage = readOfferSelector(
  aspectsFixture('2.9', '3', CURRENT_PRODUCT_ID, ALTERNATE_PRODUCT_ID),
  ALTERNATE_PRODUCT_ID,
  ALTERNATE_URL,
)

assert.deepEqual(alternatePage.currentAttrs, { 'Объем, мл': '2.9' })
assert.deepEqual(alternatePage.unresolvedProductIds, [])
assert.deepEqual(alternatePage.links.map(({ productId }) => productId), [CURRENT_PRODUCT_ID])
assert.deepEqual(alternatePage.variants.map(({ productId, variantAttrs }) => ({ productId, variantAttrs })), [{
  productId: CURRENT_PRODUCT_ID,
  variantAttrs: { 'Объем, мл': '3' },
}])

const closedProductIds = new Set([
  CURRENT_PRODUCT_ID,
  ...currentPage.links.map(({ productId }) => productId),
  ...alternatePage.links.map(({ productId }) => productId),
])
assert.deepEqual([...closedProductIds].sort(), [ALTERNATE_PRODUCT_ID, CURRENT_PRODUCT_ID].sort())

function multiDimensionFixture(): Document {
  const { document } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <div data-widget="webAspects">
          <div>
            <span>Мощность, Вт: 1000</span>
            <a href="/product/alternate-${ALTERNATE_PRODUCT_ID}/">1500</a>
          </div>
          <div>
            <span>Цвет: Белый</span>
            <a href="/product/alternate-${ALTERNATE_PRODUCT_ID}/">Черный</a>
          </div>
        </div>
      </body>
    </html>
  `)
  return document
}

const multiDimensionPage = readOfferSelector(
  multiDimensionFixture(),
  CURRENT_PRODUCT_ID,
  CURRENT_URL,
)

assert.deepEqual(multiDimensionPage.currentAttrs, {
  'Мощность, Вт': '1000',
  'Цвет': 'Белый',
})
assert.deepEqual(multiDimensionPage.unresolvedProductIds, [])
assert.deepEqual(multiDimensionPage.variants.map(({ productId, variantAttrs }) => ({ productId, variantAttrs })), [{
  productId: ALTERNATE_PRODUCT_ID,
  variantAttrs: {
    'Мощность, Вт': '1500',
    'Цвет': 'Черный',
  },
}])

function unresolvedSourceDimensionFixture(): Document {
  const { document } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <div data-widget="webAspects">
          <a href="/product/alternate-${ALTERNATE_PRODUCT_ID}/">
            <img src="https://cdn.example/wc500/alternate.jpg">
          </a>
        </div>
      </body>
    </html>
  `)
  return document
}

const unresolvedSourceDimensionPage = readOfferSelector(
  unresolvedSourceDimensionFixture(),
  CURRENT_PRODUCT_ID,
  CURRENT_URL,
)

assert.deepEqual(unresolvedSourceDimensionPage.variants, [])
assert.deepEqual(unresolvedSourceDimensionPage.unresolvedProductIds, [ALTERNATE_PRODUCT_ID])
assert.deepEqual(unresolvedSourceDimensionPage.links.map(({ productId }) => productId), [ALTERNATE_PRODUCT_ID])

function unresolvedGraphRootFixture(): Document {
  const { document } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <div data-widget="webAspects"><span>Мощность, Вт: 1000</span></div>
        <div data-widget="webOfferSelector">
          <a href="/product/alternate-${ALTERNATE_PRODUCT_ID}/">
            <img src="https://cdn.example/wc500/alternate.jpg">
          </a>
        </div>
      </body>
    </html>
  `)
  return document
}

const targetHtml = `
  <!doctype html>
  <html>
    <body>
      <div data-widget="webAspects">
        <div>
          <span>Мощность, Вт: 1500</span>
          <a href="/product/current-${CURRENT_PRODUCT_ID}/">1000</a>
        </div>
      </div>
    </body>
  </html>
`

const fetchedUrls: string[] = []
const unresolvedGraph = await readOfferSelectorGraph(
  unresolvedGraphRootFixture(),
  CURRENT_PRODUCT_ID,
  CURRENT_URL,
  {
    fetchPage: async (url) => {
      fetchedUrls.push(url)
      return { ok: true, status: 200, url: ALTERNATE_URL, text: async () => targetHtml }
    },
    parseHtml: (html) => parseHTML(html).document,
  },
)

assert.deepEqual(fetchedUrls, [ALTERNATE_URL])
assert.deepEqual(unresolvedGraph.currentAttrs, { 'Мощность, Вт': '1000' })
assert.deepEqual(
  unresolvedGraph.variants
    .filter(({ productId }) => productId === ALTERNATE_PRODUCT_ID)
    .map(({ variantAttrs }) => variantAttrs),
  [{ 'Мощность, Вт': '1500' }],
)

await assert.rejects(
  readOfferSelectorGraph(
    unresolvedGraphRootFixture(),
    CURRENT_PRODUCT_ID,
    CURRENT_URL,
    {
      fetchPage: async () => ({
        ok: true,
        status: 200,
        url: 'https://www.ozon.ru/product/wrong-9999999999/',
        text: async () => targetHtml,
      }),
      parseHtml: (html) => parseHTML(html).document,
    },
  ),
  /详情页跳转到了不同商品 9999999999/,
)

await assert.rejects(
  readOfferSelectorGraph(
    unresolvedGraphRootFixture(),
    CURRENT_PRODUCT_ID,
    CURRENT_URL,
    {
      fetchPage: async () => ({
        ok: true,
        status: 200,
        url: ALTERNATE_URL,
        text: async () => '<!doctype html><html><body><h1>Target without selector</h1></body></html>',
      }),
      parseHtml: (html) => parseHTML(html).document,
    },
  ),
  /未提供可核验的变体选择器/,
)

function richVariantFixture(): Document {
  const { document } = parseHTML(`
    <!doctype html>
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "productID": "${CURRENT_PRODUCT_ID}",
            "sku": " SKU-RICH-1 ",
            "name": "Rich factual SKU",
            "image": [
              "https://cdn.example/wc500/gallery-1.jpg",
              "/media/gallery-2.jpg"
            ],
            "video": [
              { "contentUrl": "https://cdn.example/video/product.mp4" }
            ],
            "additionalProperty": [
              { "name": "Размер упаковки, см", "value": "30 x 20 x 10 см" },
              { "name": "Вес товара с упаковкой", "value": "1.25 кг" },
              { "name": "Материал", "value": "Сталь" },
              { "name": "Тематика", "value": "Подарок на день рождения" },
              { "name": "Стиль", "value": "Минимализм, скандинавский" }
            ],
            "offers": {
              "@type": "Offer",
              "productId": "${CURRENT_PRODUCT_ID}",
              "sku": "SKU-RICH-1",
              "offerId": "OFFER-RICH-1",
              "price": "1299.00",
              "availability": "https://schema.org/OutOfStock",
              "url": "${CURRENT_URL}?from_sku=source",
              "image": "https://cdn.example/wc500/offer.jpg"
            }
          }
        </script>
      </head>
      <body>
        <h1>Подарочный хит для дома</h1>
        <a href="/seller/theme-store/">Theme Store</a>
        <div data-widget="promoBadge">Хит продаж</div>
        <div data-widget="webPrice">
          <span class="price">1 299 ₽</span>
          <del>1 699 ₽</del>
        </div>
        <div data-widget="webGallery">
          <img src="https://cdn.example/wc500/gallery-1.jpg">
          <img src="/media/gallery-3.jpg">
        </div>
        <video src="https://cdn.example/video/dom.mp4">
          <source src="/media/source.webm">
        </video>
        <div data-widget="webCharacteristics">
          <dl>
            <dt>Цвет</dt><dd>Черный</dd>
            <dt>适用场景</dt><dd>Дом / офис</dd>
          </dl>
        </div>
      </body>
    </html>
  `)
  return document
}

const richVariant = readOzonVariantFacts(
  richVariantFixture(),
  CURRENT_PRODUCT_ID,
  `${CURRENT_URL}?from_sku=source#reviews`,
  { 'Объем, мл': '3' },
)

assert.deepEqual(richVariant, {
  productId: CURRENT_PRODUCT_ID,
  sku: 'SKU-RICH-1',
  offerId: 'OFFER-RICH-1',
  price: 1299,
  oldPrice: 1699,
  stock: 0,
  images: [
    'https://cdn.example/wc1000/offer.jpg',
    'https://cdn.example/wc1000/gallery-1.jpg',
    'https://www.ozon.ru/media/gallery-2.jpg',
    'https://www.ozon.ru/media/gallery-3.jpg',
  ],
  video: 'https://cdn.example/video/product.mp4',
  videos: [
    'https://cdn.example/video/product.mp4',
    'https://cdn.example/video/dom.mp4',
    'https://www.ozon.ru/media/source.webm',
  ],
  sourceUrl: CURRENT_URL,
  supplierAttrs: [
    { label: 'Объем, мл', value: '3' },
    { name: 'Размер упаковки, см', value: '30 x 20 x 10 см' },
    { name: 'Вес товара с упаковкой', value: '1.25 кг' },
    { name: 'Материал', value: 'Сталь' },
    { name: 'Тематика', value: 'Подарок на день рождения' },
    { name: 'Стиль', value: 'Минимализм, скандинавский' },
    { name: 'Цвет', value: 'Черный' },
    { name: '适用场景', value: 'Дом / офис' },
  ],
  variantAttrs: { 'Объем, мл': '3' },
  packageWeightG: 1250,
  packageDepthMm: 300,
  packageWidthMm: 200,
  packageHeightMm: 100,
  packagePhysicalProvenance: {
    packageWeightG: {
      source: 'ozon_pdp_characteristic',
      sourcePath: 'pdp.characteristics[Вес товара с упаковкой]',
    },
    packageDepthMm: {
      source: 'ozon_pdp_characteristic',
      sourcePath: 'pdp.characteristics[Размер упаковки, см]',
    },
    packageWidthMm: {
      source: 'ozon_pdp_characteristic',
      sourcePath: 'pdp.characteristics[Размер упаковки, см]',
    },
    packageHeightMm: {
      source: 'ozon_pdp_characteristic',
      sourcePath: 'pdp.characteristics[Размер упаковки, см]',
    },
  },
})

const richVariantTags = readFactualTags(richVariant.supplierAttrs)
assert.deepEqual(richVariantTags, [
  'Подарок на день рождения',
  'Минимализм, скандинавский',
  'Дом / офис',
])

const exactIdentityVariants = [
  { ...richVariant, id: '101', productId: '201', sku: '301', offerId: '401' },
  { ...richVariant, id: '102', productId: '202', sku: '302', offerId: '402' },
  { ...richVariant, id: '103', productId: '203', sku: '303', offerId: '403' },
]
const exactVariantProduct: OzonboxCollectedProduct = {
  source: 'OZON',
  sourceUrl: CURRENT_URL,
  productId: CURRENT_PRODUCT_ID,
  recordName: 'Exact requested SKU fixture',
  sku: '301',
  title: 'Exact requested SKU fixture',
  description: 'Facts outside variants must survive filtering',
  images: richVariant.images,
  price: 1299,
  specs: richVariant.supplierAttrs,
  variantsData: exactIdentityVariants,
  variantAttrIds: [101],
  status: 'draft',
}

for (const [requestedSku, expectedVariant] of [
  ['101', exactIdentityVariants[0]],
  ['202', exactIdentityVariants[1]],
  ['303', exactIdentityVariants[2]],
] as const) {
  const retained = retainExactRequestedSkuVariant(exactVariantProduct, requestedSku)
  assert.notEqual(retained, exactVariantProduct)
  assert.notEqual(retained.variantsData, exactVariantProduct.variantsData)
  assert.deepEqual(retained.variantsData, [expectedVariant])
  assert.equal(retained.title, exactVariantProduct.title)
  assert.equal(retained.description, exactVariantProduct.description)
  assert.equal(retained.specs, exactVariantProduct.specs)
}
assert.equal(exactVariantProduct.variantsData.length, 3)
assert.deepEqual(exactVariantProduct.variantsData, exactIdentityVariants)
assert.throws(() => retainExactRequestedSkuVariant(exactVariantProduct, '401'), /缺少当前 SKU 401 的真实变体/)
assert.throws(() => retainExactRequestedSkuVariant(exactVariantProduct, '999'), /缺少当前 SKU 999 的真实变体/)

const richOzonMetrics = {
  sku: 'SKU-RICH-1',
  articleNumber: 'ARTICLE-RICH-1',
  brand: 'Factual Brand',
  category: 'Электроника > Аксессуары',
  promotions: ['Скидка продавца'],
  paidPromotion: 'Нет',
  monthlyRevenue: 123456,
  monthlySales: 120,
  turnoverDynamics: '+12%',
  followersCount: 45,
  minPrice: 1199,
  maxPrice: 1699,
  rfbsCommission: 18,
  fbpCommission: 22,
  conversionRate: 4.5,
  volumeCm3: 6000,
  lengthMm: 300,
  widthMm: 200,
  heightMm: 100,
  weightG: 1250,
  packageWeightG: 1400,
  packageLengthMm: 320,
  packageWidthMm: 220,
  packageHeightMm: 120,
  warehouse: 'Москва',
  warehouseId: 'WH-RICH-1',
  logisticsType: 'FBO',
  deliveryMethod: 'Курьер',
  deliveryRegion: 'Россия',
  deliveryDays: 3,
  listedAt: '2026-07-22T00:00:00.000Z',
  missingFields: [],
}

const normalizedProduct = assertCompleteProduct(toSelectionProduct({
  source: 'OZON',
  sourceUrl: CURRENT_URL,
  productId: CURRENT_PRODUCT_ID,
  recordName: 'Rich factual SKU',
  sku: 'SKU-RICH-1',
  title: 'Rich factual SKU',
  titleRu: 'Богатая фактическая карточка',
  description: 'Structured PDP description',
  descriptionRu: 'Описание карточки на русском языке',
  brand: 'Factual Brand',
  categoryPath: 'Электроника > Аксессуары',
  categoryId: 12345,
  descriptionCategoryId: 67890,
  typeId: 24680,
  images: richVariant.images,
  price: 1299,
  discount: '-23%',
  stock: 'Осталось 5 штук',
  warehouse: 'Москва',
  warehouseId: 'WH-RICH-1',
  logisticsType: 'FBO',
  deliveryMethod: 'Курьер',
  deliveryRegion: 'Россия',
  deliveryDays: 3,
  ozonMetrics: richOzonMetrics,
  specs: richVariant.supplierAttrs,
  tags: richVariantTags,
  variantsData: [richVariant],
  variantAttrIds: [101, 101, 0, -4, 202, Number.NaN],
  status: 'draft',
}))

assert.equal(normalizedProduct.brand, 'Factual Brand')
assert.equal(normalizedProduct.category, 'Электроника > Аксессуары')
assert.equal(normalizedProduct.recordName, 'Rich factual SKU')
assert.equal(normalizedProduct.selectedSku, 'SKU-RICH-1')
assert.equal(normalizedProduct.titleRu, 'Богатая фактическая карточка')
assert.equal(normalizedProduct.description, 'Structured PDP description')
assert.equal(normalizedProduct.descriptionRu, 'Описание карточки на русском языке')
assert.equal(normalizedProduct.collectionStatus, 'draft')
assert.equal(normalizedProduct.ozonCategoryPathId, 12345)
assert.equal(normalizedProduct.ozonCategoryId, 67890)
assert.equal(normalizedProduct.ozonTypeId, 24680)
assert.deepEqual(normalizedProduct.variantAttrIds, [101, 202])
assert.deepEqual(normalizedProduct.ozonMetrics, richOzonMetrics)
assert.equal(normalizedProduct.warehouse, 'Москва')
assert.equal(normalizedProduct.warehouseId, 'WH-RICH-1')
assert.equal(normalizedProduct.logisticsType, 'FBO')
assert.equal(normalizedProduct.deliveryMethod, 'Курьер')
assert.equal(normalizedProduct.deliveryRegion, 'Россия')
assert.equal(normalizedProduct.deliveryDays, 3)
assert.equal(normalizedProduct.discount, '-23%')
assert.equal(normalizedProduct.stock, 'Осталось 5 штук')
assert.deepEqual(normalizedProduct.videoUrls, [
  'https://cdn.example/video/product.mp4',
  'https://cdn.example/video/dom.mp4',
  'https://www.ozon.ru/media/source.webm',
])
assert.deepEqual(normalizedProduct.colorList, ['Черный'])
assert.deepEqual(normalizedProduct.facts, richVariant.supplierAttrs.map((item) => ({
  ...item,
  name: item.name ?? item.label,
  value: item.value,
  sourcePath: 'Ozon PDP characteristics',
  provenance: {
    source: 'ozon_pdp_characteristic',
    sourcePath: 'Ozon PDP characteristics',
  },
})).filter((item) => typeof item.name === 'string'))
assert.deepEqual(normalizedProduct.tags, [
  'Подарок на день рождения',
  'Минимализм, скандинавский',
  'Дом / офис',
])
assert.deepEqual(normalizedProduct.skuList, [{ sku: 'SKU-RICH-1', barcode: '' }])
assert.equal('brand' in normalizedProduct.skuList[0]!, false)
assert.deepEqual(normalizedProduct.variants, [{
  sku: 'SKU-RICH-1',
  values: [{ name: 'Объем, мл', value: '3' }],
  price: 1299,
  oldPrice: 1699,
  stock: 0,
  images: richVariant.images,
  imageUrl: richVariant.images[0],
  videoUrls: richVariant.videos,
  packageWeightG: 1250,
  packageDepthMm: 300,
  packageWidthMm: 200,
  packageHeightMm: 100,
  packagePhysicalProvenance: richVariant.packagePhysicalProvenance,
  sourceUrl: CURRENT_URL,
  productId: CURRENT_PRODUCT_ID,
  offerId: 'OFFER-RICH-1',
  supplierAttrs: richVariant.supplierAttrs,
  variantAttrs: { 'Объем, мл': '3' },
  sourcePath: 'Ozon PDP offer selector / structured data',
}])
assert.deepEqual(normalizedProduct.packageFacts, {
  packageWeightG: 1250,
  packageDepthMm: 300,
  packageWidthMm: 200,
  packageHeightMm: 100,
  packagePhysicalProvenance: richVariant.packagePhysicalProvenance,
})
assert.deepEqual(normalizedProduct.specList, [{
  package_weight_g: 1250,
  package_depth_mm: 300,
  package_width_mm: 200,
  package_height_mm: 100,
  package_physical_provenance: richVariant.packagePhysicalProvenance,
}])
for (const itemField of ['weight_g', 'depth_mm', 'width_mm', 'height_mm']) {
  assert.equal(itemField in normalizedProduct.specList[0]!, false)
}

const productAttributeFact = {
  attributeId: 85,
  values: [{ dictionaryValueId: 971082, value: 'Черный', localized: { ru: 'Черный' } }],
  scope: 'product' as const,
  recognized: true,
  publishable: true,
  provenance: {
    source: 'ozon_pdp_structured_data' as const,
    sourcePath: 'pdp.ozonAttributes[85]',
    raw: { attributeName: 'Цвет' },
  },
  extraStructuredMetadata: { complex: false },
}
const skuAttributeFact = {
  attributeId: 9048,
  values: [{ value: '3 мл', rawValue: 3 }],
  unit: 'мл',
  scope: 'sku' as const,
  complexGroupId: 'volume-group',
  recognized: true,
  publishable: true,
  provenance: {
    source: 'ozon_pdp_structured_data' as const,
    sourcePath: 'pdp.variants[SKU-FIDELITY].ozonAttributes[9048]',
  },
}
const fidelityVariant = {
  ...richVariant,
  productId: `${CURRENT_PRODUCT_ID}1`,
  sku: 'SKU-FIDELITY',
  offerId: 'OFFER-FIDELITY',
  weight: 999,
  depth: 998,
  width: 997,
  height: 996,
  packageWeightG: 1500,
  packageDepthMm: 310,
  packageWidthMm: 210,
  packageHeightMm: 110,
  packagePhysicalProvenance: {
    packageWeightG: { source: 'ozon_seller_analytics', sourcePath: 'analytics.exactSku.packageWeightG' },
    packageDepthMm: { source: 'ozon_seller_analytics', sourcePath: 'analytics.exactSku.packageDepthMm' },
    packageWidthMm: { source: 'ozon_seller_analytics', sourcePath: 'analytics.exactSku.packageWidthMm' },
    packageHeightMm: { source: 'ozon_seller_analytics', sourcePath: 'analytics.exactSku.packageHeightMm' },
  },
  videos: [...(richVariant.videos ?? []), 'https://cdn.example/video/sku-fidelity.mp4'],
  ozonAttributeFacts: [skuAttributeFact],
  unknownVariantPayload: { seller: { warehouseCode: 'WH-LOSSLESS' } },
}
const factualText = {
  name: 'Пользовательский факт',
  value: 'Должен сохраниться только как текстовый факт',
  confidence: 0.91,
  raw: { localizedName: 'Custom fact', flags: ['display-only'] },
  provenance: {
    source: 'ozon_pdp_characteristic' as const,
    sourcePath: 'pdp.characteristics[Пользовательский факт]',
  },
}
const fidelityProduct = assertCompleteProduct(toSelectionProduct({
  source: 'OZON',
  sourceUrl: CURRENT_URL,
  productId: `${CURRENT_PRODUCT_ID}1`,
  recordName: 'Lossless fidelity fixture',
  sku: 'SKU-FIDELITY',
  title: 'Lossless fidelity fixture',
  images: richVariant.images,
  price: 1299,
  specs: [],
  textFacts: [factualText],
  packageFacts: {
    packageWeightG: 1500,
    packageDepthMm: 310,
    packageWidthMm: 210,
    packageHeightMm: 110,
    packagePhysicalProvenance: fidelityVariant.packagePhysicalProvenance,
  },
  ozonAttributeFacts: [productAttributeFact],
  variantsData: [fidelityVariant],
  variantAttrIds: [9048],
  status: 'draft',
}))
assert.deepEqual(fidelityProduct.packageFacts, {
  packageWeightG: 1500,
  packageDepthMm: 310,
  packageWidthMm: 210,
  packageHeightMm: 110,
  packagePhysicalProvenance: fidelityVariant.packagePhysicalProvenance,
})
assert.deepEqual(fidelityProduct.specList, [{
  package_weight_g: 1500,
  package_depth_mm: 310,
  package_width_mm: 210,
  package_height_mm: 110,
  package_physical_provenance: fidelityVariant.packagePhysicalProvenance,
}])
assert.deepEqual(fidelityProduct.facts, [factualText])
assert.deepEqual(fidelityProduct.ozonAttributeFacts, [productAttributeFact])
assert.deepEqual(fidelityProduct.variants[0]?.ozonAttributeFacts, [skuAttributeFact])
assert.deepEqual(fidelityProduct.variants[0]?.videoUrls, fidelityVariant.videos)
assert.equal(fidelityProduct.ozonAttributeFacts?.some((fact) => fact.attributeId === 85), true)
assert.equal(fidelityProduct.ozonAttributeFacts?.some((fact) => JSON.stringify(fact).includes(factualText.value)), false)

const explicitUnknownSourceVariant = {
  ...fidelityVariant,
  productId: `${CURRENT_PRODUCT_ID}2`,
  sku: 'SKU-UNKNOWN-SOURCE',
  offerId: 'OFFER-UNKNOWN-SOURCE',
  packageWeightG: 700,
  packageDepthMm: 170,
  packageWidthMm: 80,
  packageHeightMm: 40,
  packagePhysicalProvenance: undefined,
}
const explicitUnknownSourceProduct = assertCompleteProduct(toSelectionProduct({
  source: 'OZON',
  sourceUrl: CURRENT_URL,
  productId: `${CURRENT_PRODUCT_ID}2`,
  sku: 'SKU-UNKNOWN-SOURCE',
  title: 'Explicit package facts without asserted source',
  images: richVariant.images,
  price: 1299,
  specs: [],
  variantsData: [explicitUnknownSourceVariant],
  variantAttrIds: [],
  status: 'draft',
}))
assert.deepEqual(explicitUnknownSourceProduct.packageFacts, {
  packageWeightG: 700,
  packageDepthMm: 170,
  packageWidthMm: 80,
  packageHeightMm: 40,
})
assert.equal('package_physical_provenance' in explicitUnknownSourceProduct.specList[0]!, false)

assert.throws(() => toSelectionProduct({
  source: 'OZON',
  sourceUrl: CURRENT_URL,
  productId: `${CURRENT_PRODUCT_ID}3`,
  sku: 'SKU-CONFLICT',
  title: 'Conflicting duplicate SKU package facts',
  images: richVariant.images,
  price: 1299,
  specs: [],
  variantsData: [
    {
      ...fidelityVariant,
      productId: `${CURRENT_PRODUCT_ID}3`,
      sku: 'SKU-CONFLICT',
      offerId: 'OFFER-CONFLICT',
      packageDepthMm: 310,
    },
    {
      ...fidelityVariant,
      productId: `${CURRENT_PRODUCT_ID}3`,
      sku: 'SKU-CONFLICT',
      offerId: 'OFFER-CONFLICT',
      packageDepthMm: 311,
    },
  ],
  variantAttrIds: [],
  status: 'draft',
}), /SKU-CONFLICT 对应了冲突的包装物理字段 packageDepthMm/)

const malformedVariantAttrProduct = toSelectionProduct({
  source: 'OZON',
  sourceUrl: CURRENT_URL,
  productId: `${CURRENT_PRODUCT_ID}9`,
  title: 'Malformed optional metadata',
  images: richVariant.images,
  price: 1299,
  specs: [],
  variantsData: [{ ...richVariant, productId: `${CURRENT_PRODUCT_ID}9` }],
  variantAttrIds: 'not-an-array' as unknown as number[],
  status: 'draft',
})
assert.equal('variantAttrIds' in malformedVariantAttrProduct, false)

console.log('Ozon fixtures passed: selector closure, per-SKU facts and factual tags survive normalization')