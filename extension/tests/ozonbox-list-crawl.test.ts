import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertOzonboxProcessCardProductResponse } from '../lib/ozonbox/contract'
import {
  DEFAULT_OZON_LIST_COLLECT_VARIANTS,
  DEFAULT_OZON_LIST_TARGET,
  assertOzonListCrawlProcessConfig,
  assertOzonListCrawlStartConfig,
  createDefaultOzonListCrawlStartConfig,
} from '../lib/ozonbox/list-crawl-contract'
import {
  canonicalOzonProductUrl,
  extractOzonListSku,
  hasReachedOzonListTarget,
  normalizeOzonListTarget,
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

assert.equal(DEFAULT_OZON_LIST_TARGET, 100)
assert.equal(DEFAULT_OZON_LIST_COLLECT_VARIANTS, false)
assert.deepEqual(createDefaultOzonListCrawlStartConfig(), {
  target: 100,
  collectVariants: false,
  selectionRuleIds: [],
})
assert.equal(normalizeOzonListTarget(undefined), 100)
assert.equal(normalizeOzonListTarget(0), 100)
assert.equal(normalizeOzonListTarget(3.9), 3)
assert.equal(normalizeOzonListTarget('12'), 12)
assert.equal(hasReachedOzonListTarget(4, 5), false)
assert.equal(hasReachedOzonListTarget(5, 5), true)
assert.equal(hasReachedOzonListTarget(6, 5), true)

assert.deepEqual(assertOzonListCrawlProcessConfig({
  collectVariants: false,
  selectionRuleIds: [7, 9],
}), {
  collectVariants: false,
  selectionRuleIds: [7, 9],
})
assert.deepEqual(assertOzonListCrawlStartConfig({
  target: 100,
  collectVariants: true,
  selectionRuleIds: [7],
}), {
  target: 100,
  collectVariants: true,
  selectionRuleIds: [7],
})
assert.throws(() => assertOzonListCrawlProcessConfig(undefined), /商品处理配置必须是对象/)
assert.throws(() => assertOzonListCrawlProcessConfig({ selectionRuleIds: [] }), /明确是否采集 SKU 变体/)
assert.throws(() => assertOzonListCrawlProcessConfig({ collectVariants: false }), /明确选择选品规则/)
assert.throws(() => assertOzonListCrawlProcessConfig({ collectVariants: false, selectionRuleIds: [1, 1] }), /不能重复/)
assert.throws(() => assertOzonListCrawlProcessConfig({ collectVariants: false, selectionRuleIds: [0] }), /正整数/)
assert.throws(() => assertOzonListCrawlStartConfig({ collectVariants: false, selectionRuleIds: [] }), /目标采集数目必须是正整数/)
assert.throws(() => assertOzonListCrawlStartConfig({ target: 0, collectVariants: false, selectionRuleIds: [] }), /目标采集数目必须是正整数/)

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
  reason: 'no-selected-rules',
  sku: '2957860286',
  matchedRuleIds: [],
  created: 0,
  skipped: 0,
}, '2957860286'), {
  success: true,
  outcome: 'skipped',
  reason: 'no-selected-rules',
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
  'start: (config: OzonListCrawlStartConfig) => void',
  'config: OzonListCrawlProcessConfig',
  'const products = new Map<string, OzonListCardIdentity>()',
  'const key = identityKey(identity)',
  'if (processing) return processing',
  'const result = await options.processCardProduct(identity, {',
  'collectVariants: config.collectVariants',
  'selectionRuleIds: [...config.selectionRuleIds]',
  "if (result.outcome === 'saved')",
  'skipped.add(key)',
  'pending.delete(key)\n        failed.add(key)',
  'failed.add(key)',
  'const added = scan()',
  'if (pending.size > 0) await processOnce(config)',
  'while (!disposed && pending.size > 0 && !hasReachedOzonListTarget(saved.size, config.target))',
  'if (hasReachedOzonListTarget(saved.size, config.target)) clearSurplusPending()',
  '目标进度 ${state.saved}/${state.target}',
  '已到达列表底部，成功上报 ${saved.size}/${config.target}',
  'for (const key of failed) pending.add(key)',
]) {
  assert.ok(crawlerSource.includes(contract), `列表采集队列契约缺失：${contract}`)
}
for (const rejectedDiscoveryLimit of [
  'scan(config.maxItems)',
  'products.size >= maxItems',
  'products.size >= config.maxItems',
  'JSON.stringify(activeConfig)',
]) {
  assert.ok(!crawlerSource.includes(rejectedDiscoveryLimit), `发现数量仍错误占用成功目标：${rejectedDiscoveryLimit}`)
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

console.log('Ozon list crawl fixtures passed: exact identities, successful-report target semantics and retry queue contracts')