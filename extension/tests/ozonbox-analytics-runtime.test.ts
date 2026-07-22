import assert from 'node:assert/strict'
import { analyticsPageForUrl } from '../lib/ozonbox/analytics-card'
import { analyticsLoadStatus } from '../lib/ozonbox/analytics-view'
import { SuccessfulRequestCache } from '../lib/ozonbox/successful-request-cache'

const cache = new SuccessfulRequestCache<string, number | null>()
let loadCount = 0
let resolveFirst: ((value: number) => void) | undefined
const firstLoad = () => {
  loadCount += 1
  return new Promise<number>((resolve) => {
    resolveFirst = resolve
  })
}
const firstRequest = cache.get('same-sku', firstLoad)
const duplicateRequest = cache.get('same-sku', firstLoad)
assert.equal(firstRequest, duplicateRequest)
assert.equal(loadCount, 0)
await Promise.resolve()
assert.equal(loadCount, 1)
resolveFirst?.(16)
assert.equal(await firstRequest, 16)
assert.equal(await cache.get('same-sku', async () => 99), 16)
assert.equal(loadCount, 1)

assert.equal(await cache.get('same-sku', async () => {
  loadCount += 1
  return 119
}, true), 119)
assert.equal(loadCount, 2)

let rejectedLoadCount = 0
await assert.rejects(cache.get('retryable-error', async () => {
  rejectedLoadCount += 1
  throw new Error('temporary failure')
}), /temporary failure/)
assert.equal(await cache.get('retryable-error', async () => {
  rejectedLoadCount += 1
  return null
}), null)
assert.equal(await cache.get('retryable-error', async () => 110), null)
assert.equal(rejectedLoadCount, 2)

assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/product/example-2957860286/'), {
  kind: 'detail',
  sku: '2957860286',
})
assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/search/?text=cable'), { kind: 'list' })
assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/category/electronics-15500/'), { kind: 'list' })
assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/'), { kind: 'other' })
assert.deepEqual(analyticsPageForUrl('not a URL'), { kind: 'other' })

assert.equal(analyticsLoadStatus({}), '已加载')
assert.equal(analyticsLoadStatus({
  ozonboxSellerVariantPackageError: 'variant endpoint unavailable',
}), '已加载；Seller 变体包裹参数读取失败：variant endpoint unavailable')
assert.equal(analyticsLoadStatus({
  ozonboxSellerVariantPackageError: 'variant endpoint unavailable',
  ozonboxPackageFactsError: 'backend unavailable',
}), '已加载；Seller 变体包裹参数读取失败：variant endpoint unavailable；后端包裹事实读取失败：backend unavailable')

console.log('Ozon analytics runtime fixtures passed: request deduplication, route classification and error status')