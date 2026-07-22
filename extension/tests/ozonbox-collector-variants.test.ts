import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'
import { readDomBrand, readFactualBrand, readOfferSelector, readOfferSelectorGraph, readOzonVariantFacts } from '../lib/ozonbox/collector'
import { toSelectionProduct } from '../lib/ozonbox/selection-product'
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
              { "name": "Материал", "value": "Сталь" }
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
    { name: 'Цвет', value: 'Черный' },
  ],
  variantAttrs: { 'Объем, мл': '3' },
  depth: 300,
  width: 200,
  height: 100,
  weight: 1250,
})

const normalizedProduct = assertCompleteProduct(toSelectionProduct({
  source: 'OZON',
  sourceUrl: CURRENT_URL,
  productId: CURRENT_PRODUCT_ID,
  recordName: 'Rich factual SKU',
  sku: 'SKU-RICH-1',
  title: 'Rich factual SKU',
  brand: 'Factual Brand',
  categoryPath: 'Электроника > Аксессуары',
  images: richVariant.images,
  price: 1299,
  specs: richVariant.supplierAttrs,
  variantsData: [richVariant],
  variantAttrIds: [],
  status: 'draft',
}))

assert.equal(normalizedProduct.brand, 'Factual Brand')
assert.equal(normalizedProduct.category, 'Электроника > Аксессуары')
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
  weight: 1250,
  depth: 300,
  width: 200,
  height: 100,
  sourceUrl: CURRENT_URL,
  productId: CURRENT_PRODUCT_ID,
  offerId: 'OFFER-RICH-1',
  supplierAttrs: richVariant.supplierAttrs,
  variantAttrs: { 'Объем, мл': '3' },
  sourcePath: 'Ozon PDP offer selector / structured data',
}])

console.log('Ozon variant fixtures passed: selector closure and rich per-SKU facts survive normalization')