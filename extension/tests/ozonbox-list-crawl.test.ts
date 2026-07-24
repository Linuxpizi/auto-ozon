import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertOzonboxProcessCardProductResponse } from '../lib/ozonbox/contract'
import {
  canonicalOzonProductUrl,
  extractOzonListSku,
  ozonListCardIdentityFromHref,
} from '../lib/ozonbox/list-crawl'

const baseUrl = 'https://www.ozon.ru/search/?text=cable'

assert.equal(extractOzonListSku('/product/usb-cable-2957860286/?from=search#reviews', baseUrl), '2957860286')
assert.equal(extractOzonListSku('https://m.ozon.ru/product/mobile-card-67890/', baseUrl), '67890')
assert.equal(extractOzonListSku('https://www.ozon.ru/product/no-positive-sku-0/', baseUrl), '')
assert.equal(extractOzonListSku('http://www.ozon.ru/product/insecure-12345/', baseUrl), '')
assert.equal(extractOzonListSku('https://example.com/product/external-12345/', baseUrl), '')
assert.equal(extractOzonListSku('/category/not-a-product-12345/', baseUrl), '')
assert.equal(extractOzonListSku('not a product URL', baseUrl), '')
assert.equal(
  canonicalOzonProductUrl('/product/usb-cable-2957860286/?from=search#reviews', baseUrl),
  'https://www.ozon.ru/product/usb-cable-2957860286/',
)

assert.deepEqual(ozonListCardIdentityFromHref(
  '/product/usb-cable-2957860286/?from=search#reviews',
  baseUrl,
), {
  sku: '2957860286',
  sourceUrl: 'https://www.ozon.ru/product/usb-cable-2957860286/',
})
assert.equal(ozonListCardIdentityFromHref('https://example.com/product/external-12345/', baseUrl), null)

const savedResult = {
  success: true,
  outcome: 'saved',
  sku: '2957860286',
  matchedRuleIds: [7, 9],
  created: 1,
  skipped: 0,
} as const
assert.deepEqual(assertOzonboxProcessCardProductResponse(savedResult, '2957860286'), savedResult)
assert.deepEqual(assertOzonboxProcessCardProductResponse({
  success: true,
  outcome: 'skipped',
  reason: 'no-enabled-rules',
  sku: '2957860286',
  matchedRuleIds: [],
  created: 0,
  skipped: 0,
}, '2957860286'), {
  success: true,
  outcome: 'skipped',
  reason: 'no-enabled-rules',
  sku: '2957860286',
  matchedRuleIds: [],
  created: 0,
  skipped: 0,
})
assert.throws(() => assertOzonboxProcessCardProductResponse({ success: false, error: ' auth required ' }), /auth required/)
assert.throws(() => assertOzonboxProcessCardProductResponse(savedResult, '67890'), /请求 SKU 不一致/)
assert.throws(() => assertOzonboxProcessCardProductResponse({ ...savedResult, outcome: 'skipped' }), /缺少有效原因/)

const crawlerSource = readFileSync(new URL('../lib/ozonbox/list-crawl.ts', import.meta.url), 'utf8')
for (const contract of [
  'startOzonListCrawlController(options: OzonListCrawlOptions)',
  'const products = new Map<string, OzonListCardIdentity>()',
  'const key = identityKey(identity)',
  'if (processing) return processing',
  'const result = await options.processCardProduct(identity)',
  "if (result.outcome === 'saved')",
  'skipped.add(key)',
  'pending.delete(key)\n        failed.add(key)',
  'failed.add(key)',
  'while (!disposed && pending.size > 0)',
  'await processOnce()',
  'if (pending.size > 0) await processOnce()',
]) {
  assert.ok(crawlerSource.includes(contract), `列表采集队列契约缺失：${contract}`)
}
for (const rejectedSparseContract of [
  'OzonListProductRecord',
  'mergeOzonListProduct',
  "action: 'syncOzonListProducts'",
  'promoJoined',
  'originalPrice',
]) {
  assert.ok(!crawlerSource.includes(rejectedSparseContract), `列表爬虫仍包含稀疏上报契约：${rejectedSparseContract}`)
}

console.log('Ozon list crawl fixtures passed: exact identities, process results and retry queue contracts')