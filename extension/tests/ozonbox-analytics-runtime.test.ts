import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analyticsPageForUrl } from '../lib/ozonbox/analytics-card'
import {
  analyticsLoadStatus,
  buildAnalyticsDoc,
} from '../lib/ozonbox/analytics-view'
import {
  buildOzonFloatingPanelShadow,
  OZON_AUTH_POLL_INTERVAL_MS,
  OZON_AUTH_POLL_TIMEOUT_MS,
  OZON_FLOATING_PANEL_HOST_ID,
  OZON_PANEL_DRAG_RELEASE_DELAY_MS,
  OZON_PANEL_DRAG_THRESHOLD_PX,
  OZON_SELLER_RECHECK_DELAY_MS,
  parseCollectAndSaveResult,
  parseSellerCookiesResponse,
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
assert.equal(OZON_AUTH_POLL_INTERVAL_MS, 2_000)
assert.equal(OZON_AUTH_POLL_TIMEOUT_MS, 30_000)
assert.equal(OZON_PANEL_DRAG_THRESHOLD_PX, 5)
assert.equal(OZON_PANEL_DRAG_RELEASE_DELAY_MS, 100)
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
  '.sidebar{position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;width:144px;flex-direction:column;align-items:stretch;padding-bottom:8px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px oklch(96.7% .003 264.542),0 0 16px 4px rgba(238,19,27,.2)',
  '.sidebar-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px 0}',
  '.sidebar-brand{display:flex;align-items:center;flex-wrap:nowrap}',
  '.brand-logo{display:block;width:20px;height:20px;margin-right:8px;object-fit:contain}',
  '.brand-name{font-size:14px;line-height:20px;white-space:nowrap}',
  '.collapse{display:flex;align-items:center;justify-content:center;width:14px;height:14px;padding:0;border:1px solid #eab308',
  'transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:.15s',
  '.collapse-icon{display:inline-flex;font-size:7px;line-height:0}',
  '.collapse-icon svg{display:inline-block;width:1em;height:1em;fill:currentColor}',
  '.authenticated-actions{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:8px 20px 0}',
  '.ant-btn{outline:none;position:relative;display:inline-block;font-weight:400;white-space:nowrap;text-align:center;background-image:none;background-color:transparent;border:1px solid transparent;cursor:pointer;transition:all .2s cubic-bezier(.645,.045,.355,1);user-select:none;touch-action:manipulation;line-height:1.5714285714285714;color:#000000e0;font-size:14px;height:32px;padding:4px 15px;border-radius:6px}',
  '.ant-btn.ant-btn-round{border-radius:32px;padding-inline-start:16px;padding-inline-end:16px}',
  '.ant-btn-default{background:#fff;border-color:#d9d9d9',
  '.ant-btn-primary{color:#fff;background:#1677ff',
  '.ant-btn-primary.ant-btn-dangerous{background:#ff4d4f',
  '.ant-btn-amber{color:#fff!important;background:#f59e0b!important;border-color:#f59e0b!important',
  '.ant-switch{position:relative;display:inline-block;box-sizing:border-box;min-width:44px;height:22px;padding:0;overflow:hidden',
  '.ant-switch-handle{position:absolute;top:2px;inset-inline-start:2px;width:18px;height:18px',
  '.ant-switch[aria-checked="true"]{background:#1677ff}',
  '.login-actions{padding:20px}',
  '.ant-tooltip{position:absolute;right:calc(100% + 8px);top:50%;z-index:999999;width:max-content;max-width:250px',
  '.launcher{position:fixed;z-index:9999;width:64px;height:64px;padding:12px',
  'box-shadow:0 0 16px 4px rgba(238,19,27,.6)',
  'cursor:move;transition:all .3s;touch-action:none',
  '.launcher img{display:block;width:40px;height:40px;object-fit:contain',
  'class="sidebar fixed bottom-5 right-5 bg-white rounded-xl z-[2147483647] flex flex-col items-stretch shadow-[0_0_16px_4px_rgba(238,19,27,0.2)] ring ring-gray-100 w-36 transition-all duration-300 pb-2"',
  'class="brand-name text-sm">鲸智 AI',
  'id="ozon-panel-collapse"',
  '<span class="collapse-icon" aria-hidden="true"><svg viewBox="64 64 896 896" focusable="false"><path fill="currentColor" d="M872 474H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h720c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8z"></path></svg></span>',
  'class="authenticated-actions px-5 pt-2 flex flex-col items-center justify-center gap-2" id="ozon-panel-actions" hidden',
  'class="ant-btn ant-btn-link ant-btn-block ant-btn-round" id="ozon-open-seller" type="button">打开OZON后台',
  'class="ant-btn ant-btn-primary ant-btn-dangerous ant-btn-block ant-btn-round" id="ozon-one-click-listing" type="button" data-page="detail">一键上架',
  'class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" id="ozon-profit-calculator" type="button">计算利润',
  'class="ant-btn ant-btn-default ant-btn-amber ant-btn-block ant-btn-round" id="ozon-pricing-tool" type="button">定价工具',
  'class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" id="ozon-bind-cookie" type="button" aria-busy="false">绑定Cookie',
  'class="ant-btn ant-btn-default ant-btn-block ant-btn-round" id="ozon-selection-settings" type="button">设置选品',
  'id="ozon-list-card-switch" type="button" role="switch" aria-label="隐藏列表分析卡片" aria-checked="false"><span class="ant-switch-handle"></span><span class="ant-switch-inner"><span class="ant-switch-inner-checked">隐藏卡片</span>',
  'id="ozon-detail-card-switch" type="button" role="switch" aria-label="显示商品详情分析卡片" aria-checked="true"><span class="ant-switch-handle"></span><span class="ant-switch-inner"><span class="ant-switch-inner-checked">其它卡片</span>',
  'class="ant-btn ant-btn-link ant-btn-sm" id="ozon-enter-erp" type="button">进入ERP',
  'class="login-actions p-5" id="ozon-panel-login-actions" hidden',
  'class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" id="ozon-panel-login" type="button">请登录',
  'class="ant-btn ant-btn-link ant-btn-block ant-btn-round" id="ozon-panel-login-help" type="button" aria-describedby="ozon-panel-login-tooltip">登录有问题？',
  'role="tooltip">1.关闭浏览器重新打开<br>2.卸载插件重新安装<br>3.仍然无法登录请联系客服',
  'class="launcher fixed bg-white rounded-full shadow-[0_0_16px_4px_rgba(238,19,27,0.6)] z-[9999] p-3 flex items-center justify-center transition-all duration-300 cursor-move" id="ozon-panel-launcher"',
  'class="ant-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="ozon-tool-dialog-title" aria-describedby="ozon-tool-dialog-content"',
  'width="40px" draggable="false" alt="鲸智 AI" style="pointer-events:none;user-select:none"',
]) {
  assert.ok(floatingPanel.includes(expectedMarkup), `浮窗缺少复刻标记：${expectedMarkup}`)
}
for (const rejectedMarkup of [
  '.action{',
  '.sr-only{',
  'ozon-seller-status',
  'width:72px;height:22px',
  '<span class="switch-label">',
  '<span aria-hidden="true">−</span>',
]) {
  assert.ok(!floatingPanel.includes(rejectedMarkup), `浮窗仍包含旧自创标记：${rejectedMarkup}`)
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
assert.deepEqual(snapOzonPanelPositionToNearestEdge({ right: 218, bottom: 218 }, 500, 500), {
  right: 426,
  bottom: 218,
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

assert.deepEqual(parseSellerCookiesResponse({ cookies: [] }), [])
const sellerCookie = {
  domain: '.seller.ozon.ru',
  expirationDate: 1_800_000_000,
  hostOnly: false,
  httpOnly: true,
  name: 'session',
  path: '/',
  sameSite: 'lax',
  secure: true,
  session: false,
  storeId: '0',
  value: 'factual-cookie-value',
}
assert.deepEqual(parseSellerCookiesResponse({ cookies: [sellerCookie] }), [sellerCookie])
assert.throws(() => parseSellerCookiesResponse({ error: ' denied ' }), /denied/)
assert.throws(() => parseSellerCookiesResponse(null), /无效响应/)
assert.throws(() => parseSellerCookiesResponse({ cookies: [null] }), /无效响应/)

const backgroundSource = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8')
const contentSource = readFileSync(new URL('../entrypoints/ozon.content.ts', import.meta.url), 'utf8')
const floatingPanelSource = readFileSync(new URL('../lib/ozonbox/floating-panel.ts', import.meta.url), 'utf8')
assert.ok(backgroundSource.includes("type === 'OZONBOX_COLLECT_AND_SAVE_CURRENT_PRODUCT'"))
assert.ok(backgroundSource.includes('collectAndSaveOzonProduct(request.tabId ?? sender.tab?.id)'))
assert.ok(backgroundSource.includes('handleProductScraped(toSelectionProduct(collected))'))
assert.ok(backgroundSource.includes("type === 'OZONBOX_GET_SELLER_COOKIES'"))
assert.ok(backgroundSource.includes('browser.cookies.getAll({ url: `${OZON_SELLER_ORIGIN}/` })'))
assert.ok(contentSource.includes("request.type !== 'COLLECT_PRODUCT'"))
assert.ok(contentSource.includes('persistLauncherPosition: (launcherPosition) => persistState({ launcherPosition })'))
assert.ok(contentSource.includes('persistCardVisibility: (visibility) => persistState(visibility)'))
assert.ok(!floatingPanelSource.includes('browser.action.openPopup'))
assert.ok(!floatingPanelSource.includes('Cookie 已绑定'))
assert.ok(floatingPanelSource.includes("type: 'OZONBOX_GET_SELLER_COOKIES'"))
assert.ok(floatingPanelSource.includes("{ type: 'PANEL_ERP_OPEN', route: '/' }"))
assert.ok(floatingPanelSource.includes('window.location.reload()'))

assert.equal(analyticsLoadStatus({}), '已加载')
assert.equal(analyticsLoadStatus({
  ozonboxSellerVariantPackageError: 'variant endpoint unavailable',
}), '已加载；Seller 变体包裹参数读取失败：variant endpoint unavailable')
assert.equal(analyticsLoadStatus({
  ozonboxSellerVariantPackageError: 'variant endpoint unavailable',
  ozonboxPackageFactsError: 'backend unavailable',
}), '已加载；Seller 变体包裹参数读取失败：variant endpoint unavailable；后端包裹事实读取失败：backend unavailable')

console.log('Ozon runtime fixtures passed: floating panel, Seller contract, request deduplication and routes')