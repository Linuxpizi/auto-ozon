import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'
import { readOfferSelector, readOzonVariantFacts } from '../lib/ozonbox/collector'
import { toSelectionProduct } from '../lib/ozonbox/selection-product'
import { assertCompleteProduct } from '../lib/utils/product-data'

const CURRENT_PRODUCT_ID = '2957860286'
const ALTERNATE_PRODUCT_ID = '2957859292'
const CURRENT_URL = `https://www.ozon.ru/product/current-${CURRENT_PRODUCT_ID}/`
const ALTERNATE_URL = `https://www.ozon.ru/product/alternate-${ALTERNATE_PRODUCT_ID}/`

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
  images: richVariant.images,
  price: 1299,
  specs: richVariant.supplierAttrs,
  variantsData: [richVariant],
  variantAttrIds: [],
  status: 'draft',
}))

assert.deepEqual(normalizedProduct.skuList, [{ sku: 'SKU-RICH-1', barcode: '' }])
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