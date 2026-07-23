import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analyticsPageForUrl } from '../lib/ozonbox/analytics-card'
import {
  analyticsLoadStatus,
  buildAnalyticsDoc,
} from '../lib/ozonbox/analytics-view'
import {
  buildOzonFloatingPanelShadow,
  OZON_FLOATING_PANEL_HOST_ID,
  OZON_PANEL_DRAG_THRESHOLD_PX,
  OZON_SELLER_RECHECK_DELAY_MS,
  parseCollectAndSaveResult,
  sellerInteractionErrorState,
} from '../lib/ozonbox/floating-panel'
import {
  clampOzonPanelPosition,
  DEFAULT_OZON_PANEL_POSITION,
  DEFAULT_OZON_PANEL_STATE,
  OZON_PANEL_LAUNCHER_SIZE_PX,
  OZON_PANEL_STORAGE_KEY,
  OZON_PANEL_VIEWPORT_MARGIN_PX,
  parseOzonPanelState,
  snapOzonPanelPositionToNearestEdge,
} from '../lib/ozonbox/panel-storage'
import {
  companyIdFromSellerCookie,
  OZON_COMPANY_ID_COOKIE_NAME,
  OZON_COMPANY_ID_COOKIE_MISSING_MESSAGE,
  OZON_SELLER_DASHBOARD_URL,
  OZON_SELLER_ORIGIN,
  requireOzonCompanyId,
} from '../lib/ozonbox/seller-session'
import { SuccessfulRequestCache } from '../lib/ozonbox/successful-request-cache'

assert.equal(OZON_SELLER_ORIGIN, 'https://seller.ozon.ru')
assert.equal(OZON_SELLER_DASHBOARD_URL, 'https://seller.ozon.ru/app/dashboard/main')
assert.equal(OZON_COMPANY_ID_COOKIE_NAME, 'sc_company_id')
assert.equal(OZON_FLOATING_PANEL_HOST_ID, 'jingzhi-ai-ozon-floating-panel')
assert.equal(OZON_SELLER_RECHECK_DELAY_MS, 5_000)
assert.equal(OZON_PANEL_DRAG_THRESHOLD_PX, 5)
assert.equal(OZON_PANEL_STORAGE_KEY, 'jingzhi_ai_ozon_panel_state')
assert.equal(OZON_PANEL_LAUNCHER_SIZE_PX, 64)
assert.equal(OZON_PANEL_VIEWPORT_MARGIN_PX, 10)
assert.equal(companyIdFromSellerCookie({ value: ' 123456 ' }), '123456')
assert.equal(requireOzonCompanyId('987654'), '987654')
assert.throws(() => companyIdFromSellerCookie(null), /未找到 sc_company_id Cookie/)
assert.throws(() => companyIdFromSellerCookie({ value: '0' }), /company ID 必须是真实的正整数/)
assert.throws(() => companyIdFromSellerCookie({ value: 'seller-123' }), /company ID 必须是真实的正整数/)
assert.equal(
  sellerInteractionErrorState(new Error(OZON_COMPANY_ID_COOKIE_MISSING_MESSAGE), true).showCookieFailure,
  true,
)
assert.equal(
  sellerInteractionErrorState(new Error(OZON_COMPANY_ID_COOKIE_MISSING_MESSAGE), false).showCookieFailure,
  false,
)
assert.deepEqual(sellerInteractionErrorState(new Error('未找到已打开的 Ozon 卖家后台标签页'), true), {
  message: '未找到已打开的 Ozon 卖家后台标签页',
  showCookieFailure: false,
})

const floatingPanel = buildOzonFloatingPanelShadow('chrome-extension://fixture/brand-logo.png')
for (const expectedMarkup of [
  '.panel{position:fixed;right:20px;bottom:20px;width:144px;padding:0 0 8px',
  'border-radius:12px;box-shadow:0 0 16px 4px rgba(238,19,27,.2)',
  '.header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px 0}',
  '.brand-logo{display:block;width:20px;height:20px;margin-right:8px',
  '.brand-name{overflow:hidden;color:#24262c;font-size:14px',
  '.collapse{display:flex;align-items:center;justify-content:center;width:14px;height:14px',
  '.actions{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:8px;padding:8px 20px 0}',
  '.launcher{position:fixed;width:64px;height:64px;padding:12px',
  'box-shadow:0 0 16px 4px rgba(238,19,27,.6)',
  'cursor:move;transition:all 300ms ease',
  '.launcher img{display:block;width:40px;height:40px',
  'class="brand-name">鲸智 AI',
  'id="ozon-panel-collapse"',
  'id="ozon-panel-launcher"',
  'id="ozon-open-seller" type="button">打开OZON后台',
  'id="ozon-one-click-listing" type="button" data-page="detail">一键上架',
  'id="ozon-profit-calculator" type="button">计算利润',
  'id="ozon-pricing-tool" type="button">定价工具',
  'id="ozon-bind-cookie" type="button" aria-busy="false">绑定Cookie',
  'id="ozon-selection-settings" type="button">设置选品',
  'id="ozon-list-card-control" data-page="list"><span>隐藏卡片</span>',
  'id="ozon-detail-card-control" data-page="detail"><span>其它卡片</span>',
  'id="ozon-enter-erp" type="button">进入ERP',
  'id="ozon-seller-status" role="status" aria-live="polite"',
  'id="ozon-tool-dialog" role="dialog" aria-modal="true"',
  'aria-labelledby="ozon-tool-dialog-title" aria-describedby="ozon-tool-dialog-content"',
  'width="40" draggable="false" alt="鲸智 AI" style="pointer-events:none;user-select:none"',
]) {
  assert.ok(floatingPanel.includes(expectedMarkup), `浮窗缺少复刻标记：${expectedMarkup}`)
}
const orderedControlIds = [
  'ozon-open-seller',
  'ozon-one-click-listing',
  'ozon-profit-calculator',
  'ozon-pricing-tool',
  'ozon-bind-cookie',
  'ozon-selection-settings',
  'ozon-list-card-control',
  'ozon-detail-card-control',
  'ozon-enter-erp',
]
for (let index = 1; index < orderedControlIds.length; index += 1) {
  assert.ok(
    floatingPanel.indexOf(`id="${orderedControlIds[index - 1]}"`)
      < floatingPanel.indexOf(`id="${orderedControlIds[index]}"`),
    `浮窗控件顺序错误：${orderedControlIds[index - 1]} 应位于 ${orderedControlIds[index]} 之前`,
  )
}
const analyticsDoc = buildAnalyticsDoc('detail', 'chrome-extension://fixture/brand-logo.png')
assert.ok(!analyticsDoc.includes('打开OZON后台'))
assert.ok(!analyticsDoc.includes('绑定Cookie'))
assert.ok(!analyticsDoc.includes('登录卖家'))
assert.ok(!analyticsDoc.includes('刷新状态'))

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
assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/highlight/sale-1/'), { kind: 'list' })
assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/seller/example-1/'), { kind: 'list' })
assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/brand/example-1/'), { kind: 'list' })
assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/publisher/example-1/'), { kind: 'list' })
assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/'), { kind: 'list' })
assert.deepEqual(analyticsPageForUrl('https://www.ozon.ru/cart'), { kind: 'other' })
assert.deepEqual(analyticsPageForUrl('not a URL'), { kind: 'other' })

assert.deepEqual(parseOzonPanelState({
  launcherPosition: { right: 81, bottom: 92 },
  listCardsHidden: true,
  detailCardsVisible: false,
}), {
  launcherPosition: { right: 81, bottom: 92 },
  listCardsHidden: true,
  detailCardsVisible: false,
})
assert.deepEqual(parseOzonPanelState({
  launcherPosition: { right: Number.NaN, bottom: 12 },
  listCardsHidden: 'yes',
}), DEFAULT_OZON_PANEL_STATE)
const firstDefaultState = parseOzonPanelState(null)
firstDefaultState.launcherPosition.right = 999
assert.deepEqual(parseOzonPanelState(null).launcherPosition, DEFAULT_OZON_PANEL_POSITION)
assert.deepEqual(clampOzonPanelPosition({ right: -5, bottom: 999 }, 500, 400), {
  right: 10,
  bottom: 326,
})
assert.deepEqual(clampOzonPanelPosition({ right: 200, bottom: 180 }, 50, 40), {
  right: 10,
  bottom: 10,
})
assert.deepEqual(snapOzonPanelPositionToNearestEdge({ right: 18, bottom: 160 }, 500, 400), {
  right: 10,
  bottom: 160,
})
assert.deepEqual(snapOzonPanelPositionToNearestEdge({ right: 420, bottom: 160 }, 500, 400), {
  right: 426,
  bottom: 160,
})
assert.deepEqual(snapOzonPanelPositionToNearestEdge({ right: 200, bottom: 16 }, 500, 400), {
  right: 200,
  bottom: 10,
})
assert.deepEqual(snapOzonPanelPositionToNearestEdge({ right: 200, bottom: 322 }, 500, 400), {
  right: 200,
  bottom: 326,
})

assert.deepEqual(parseCollectAndSaveResult({ success: true, created: 2, skipped: 1 }), {
  success: true,
  created: 2,
  skipped: 1,
})
assert.deepEqual(parseCollectAndSaveResult({ success: false, error: ' auth required ' }), {
  success: false,
  error: 'auth required',
})
assert.throws(() => parseCollectAndSaveResult({ success: true, created: -1, skipped: 0 }), /无效的保存数量/)
assert.throws(() => parseCollectAndSaveResult({ success: false }), /未返回原因/)
assert.throws(() => parseCollectAndSaveResult(null), /无效响应/)

const backgroundSource = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8')
const contentSource = readFileSync(new URL('../entrypoints/ozon.content.ts', import.meta.url), 'utf8')
assert.ok(backgroundSource.includes("type === 'OZONBOX_COLLECT_AND_SAVE_CURRENT_PRODUCT'"))
assert.ok(backgroundSource.includes('collectAndSaveOzonProduct(request.tabId ?? sender.tab?.id)'))
assert.ok(backgroundSource.includes('handleProductScraped(toSelectionProduct(collected))'))
assert.ok(contentSource.includes("request.type !== 'COLLECT_PRODUCT'"))
assert.ok(contentSource.includes('persistLauncherPosition: (launcherPosition) => persistState({ launcherPosition })'))
assert.ok(contentSource.includes('persistCardVisibility: (visibility) => persistState(visibility)'))

assert.equal(analyticsLoadStatus({}), '已加载')
assert.equal(analyticsLoadStatus({
  ozonboxSellerVariantPackageError: 'variant endpoint unavailable',
}), '已加载；Seller 变体包裹参数读取失败：variant endpoint unavailable')
assert.equal(analyticsLoadStatus({
  ozonboxSellerVariantPackageError: 'variant endpoint unavailable',
  ozonboxPackageFactsError: 'backend unavailable',
}), '已加载；Seller 变体包裹参数读取失败：variant endpoint unavailable；后端包裹事实读取失败：backend unavailable')

console.log('Ozon runtime fixtures passed: floating panel, Seller contract, request deduplication and routes')