const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadTs(relativeFile, stubs = {}) {
  const file = path.resolve(__dirname, relativeFile)
  const source = fs.readFileSync(file, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(stubs, specifier)) return stubs[specifier]
    throw new Error(`Unexpected require ${specifier} from ${relativeFile}`)
  }
  Function('module', 'exports', 'require', output)(module, module.exports, localRequire)
  return module.exports
}

function loadWidgetState() {
  return loadTs('../features/ozon-tools/content/utils/ozonList/ozonWidgetState.ts')
}

function loadCollector() {
  return loadTs(
    '../features/ozon-tools/content/utils/ozonList/ozonMetricCollector.ts',
    { './ozonWidgetState': loadWidgetState() },
  )
}

function loadPackagingParser() {
  return loadTs('../features/ozon-tools/content/utils/ozonList/ozonPackagingParser.ts')
}

function loadCrawlSkuApi() {
  return loadTs(
    '../features/ozon-tools/content/utils/ozonBatchCrawl/crawlSkuApi.ts',
    {
      '../../../utils/api': { apiService: {} },
      '../../../utils/api-config': { API_CONFIG: { LOCAL_API_BASE_URL: '' } },
      './requestRateLimiter': {
        shopsClawlerLimiter: { acquire: async () => {} },
        newClawlerLimiter: { acquire: async () => {} },
      },
      '../ozonList/ozonWidgetState': loadWidgetState(),
    },
  )
}

test('buildOzonEntrypointUrl only targets the supplied Ozon origin', () => {
  const collector = loadCollector()
  assert.equal(
    collector.buildOzonEntrypointUrl('/product/123/', 'https://ozon.kz'),
    'https://ozon.kz/api/entrypoint-api.bx/page/json/v2?url=%2Fproduct%2F123%2F',
  )
})

test('parseWidgetState decodes nested JSON and rejects malformed text', () => {
  const collector = loadCollector()
  assert.deepEqual(collector.parseWidgetState(JSON.stringify(JSON.stringify({ title: '商品' }))), {
    title: '商品',
  })
  assert.equal(collector.parseWidgetState('{bad json'), null)
})

test('other-offers parser supports object and repeatedly encoded widget states', () => {
  const api = loadCrawlSkuApi()
  const sellers = [{ sku: 1001, price: { price: '1 299 ₽' } }]

  assert.deepEqual(api.pickSellersFromOtherOffersWidgetStates({
    'webSellerList-object': { sellers },
  }), sellers)
  assert.deepEqual(api.pickSellersFromOtherOffersWidgetStates({
    'webSellerList-encoded': JSON.stringify(JSON.stringify({ sellers })),
  }), sellers)
})

test('other-offers parser distinguishes a verified empty list from an unknown response', () => {
  const api = loadCrawlSkuApi()
  assert.deepEqual(api.pickSellersFromOtherOffersWidgetStates({
    'webSellerList-empty': JSON.stringify({ sellers: [] }),
  }), [])
  assert.equal(api.pickSellersFromOtherOffersWidgetStates({
    'unrelated-widget': JSON.stringify({ items: [] }),
  }), null)
  assert.equal(api.pickSellersFromOtherOffersWidgetStates({
    'webSellerList-malformed': '{bad json',
  }), null)
})

test('parseCharacteristics follows short/long structure and removes duplicates', () => {
  const collector = loadCollector()
  const state = JSON.stringify({
    characteristics: [{
      short: [{ name: 'Бренд', values: [{ text: 'ACME' }] }],
      long: [
        { name: 'Вес в упаковке', values: [{ text: '450 г' }] },
        { name: 'Бренд', values: [{ text: 'ACME' }] },
      ],
    }],
  })
  assert.deepEqual(collector.parseCharacteristics({ 'webCharacteristics-1': state }), [
    { name: 'Бренд', values: ['ACME'] },
    { name: 'Вес в упаковке', values: ['450 г'] },
  ])
})

test('collectOzonSkuMetrics collects public fields without inventing aggregate metrics', async () => {
  const collector = loadCollector()
  global.window = { location: { hostname: 'www.ozon.ru', pathname: '/product/test-12345/' } }
  global.document = {
    documentElement: { innerHTML: '<script>{"hierarchy":"Электроника\\u002FАксессуары"}</script>' },
  }

  const page1 = {
    widgetStates: {
      'webProductHeading-1': JSON.stringify({ title: 'Тестовый товар' }),
      'webPrice-1': JSON.stringify({
        price: '1 199 ₽',
        originalPrice: '1 599 ₽',
        discount: '-25%',
      }),
      'webReviewProductScore-1': JSON.stringify({ score: 4.8, reviewsCount: 321 }),
      'webCharacteristics-1': JSON.stringify({
        characteristics: [{
          short: [{ name: 'Бренд', values: [{ text: 'ACME' }] }],
          long: [],
        }],
      }),
    },
  }
  const page2 = { widgetStates: {} }
  let calls = 0
  global.fetch = async () => {
    const body = calls++ === 0 ? page1 : page2
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => body,
    }
  }

  const data = await collector.collectOzonSkuMetrics('12345')
  assert.equal(data.article, '12345')
  assert.equal(data.brand, 'ACME')
  assert.equal(data.catname, 'Электроника > Аксессуары')
  assert.equal(data.title, 'Тестовый товар')
  assert.equal(data.currentPrice, '1 199 ₽')
  assert.equal(data.originalPrice, '1 599 ₽')
  assert.equal(data.currentDiscount, '-25%')
  assert.equal(data.rating, '4.8')
  assert.equal(data.reviewCount, '321')
  assert.equal(data.page2Loaded, true)
  assert.equal(data.metricSource, 'ozon')
  assert.equal(data.monthsales, undefined)
  assert.equal(data.gmvSum, undefined)
  assert.equal(data.views, undefined)
  assert.equal(data.avgprice, undefined)
  assert.equal(calls, 2)
})

test('a failed Page2 request is not permanently cached and can be retried', async () => {
  const collector = loadCollector()
  global.window = { location: { hostname: 'www.ozon.ru', pathname: '/category/test/' } }
  global.document = { documentElement: { innerHTML: '' } }

  let calls = 0
  global.fetch = async () => {
    calls += 1
    const isPage2 = calls % 2 === 0
    if (isPage2 && calls === 2) {
      return {
        ok: false,
        status: 503,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      }
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ widgetStates: {} }),
    }
  }

  const first = await collector.collectOzonSkuMetrics('retry-sku')
  assert.equal(first.page2Loaded, false)
  const second = await collector.collectOzonSkuMetrics('retry-sku')
  assert.equal(second.page2Loaded, true)
  assert.equal(calls, 4)
})

test('packaging parser recognizes common Russian labels and normalizes mm/g', () => {
  const parser = loadPackagingParser()
  assert.deepEqual(parser.parsePackagingAttrs([
    { name: 'Глубина транспортной упаковки', values: ['21 см'] },
    { name: 'Ширина упаковки', values: ['120 мм'] },
    { name: 'Высота упаковки', values: ['0,035 м'] },
    { name: 'Масса в упаковке', values: ['0,45 кг'] },
    { name: 'Предметные теги', values: ['лето, путешествия'] },
  ]), {
    length: '210',
    width: '120',
    height: '35',
    weight: '450',
    subjectTags: 'лето, путешествия',
  })
})

test('list pages do not reuse the current directory hierarchy as a product category', async () => {
  const collector = loadCollector()
  global.window = { location: { hostname: 'www.ozon.ru', pathname: '/category/electronics/' } }
  global.document = {
    documentElement: { innerHTML: '<script>{"hierarchy":"错误目录\\u002F不能回填"}</script>' },
  }
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ widgetStates: {} }),
  })

  const data = await collector.collectOzonSkuMetrics('list-sku')
  assert.equal(data.catname, undefined)
})