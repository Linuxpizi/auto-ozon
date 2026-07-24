import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analyticsPageForUrl, cardProductContext } from '../lib/ozonbox/analytics-card'
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
  parseSellerCookieBindResponse,
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
  'class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" id="ozon-start-list-crawl" type="button" data-page="list">启动爬取',
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
  'ozon-start-list-crawl',
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
const analyticsLogoUrl = 'chrome-extension://fixture/brand-logo.png'
const detailAnalyticsDoc = buildAnalyticsDoc('detail', analyticsLogoUrl)
const liteAnalyticsDoc = buildAnalyticsDoc('lite', analyticsLogoUrl)
for (const controlText of ['打开OZON后台', '绑定Cookie', '登录卖家', '刷新状态']) {
  assert.ok(!detailAnalyticsDoc.includes(controlText))
  assert.ok(!liteAnalyticsDoc.includes(controlText))
}
for (const listVisualContract of [
  'class="card mz-widget-cate"',
  'padding:10px',
  'border-radius:20px',
  'background:linear-gradient(to bottom,#fff5f5 0%,#fff 70%,#fff 100%)',
  'box-shadow:0 20px 12px -16px rgba(0,30,85,.1),0 8px 24px 18px rgba(0,30,85,.05)',
  '.list{display:flex;flex-direction:column;gap:6px;padding:8px;min-height:100px}',
  'font-size:13px;line-height:1.35',
  `src="${analyticsLogoUrl}"`,
]) {
  assert.ok(liteAnalyticsDoc.includes(listVisualContract), `列表指标卡缺少源项目视觉契约：${listVisualContract}`)
}
assert.ok(!detailAnalyticsDoc.includes('mz-widget-cate'))
assert.ok(!detailAnalyticsDoc.includes('linear-gradient(to bottom,#fff5f5 0%,#fff 70%,#fff 100%)'))
assert.ok(detailAnalyticsDoc.includes('.card{border:1px solid #e6eef7;border-radius:12px;'))
assert.ok(detailAnalyticsDoc.includes('background:#fff'))

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

const fakeCard = (hrefs: Array<string | null>): ParentNode => ({
  querySelectorAll: () => hrefs.map((href) => ({
    getAttribute: (name: string) => name === 'href' ? href : null,
  })),
}) as unknown as ParentNode

assert.deepEqual(cardProductContext(
  fakeCard(['/cart', 'javascript:void(0)', '/product/factual-card-2957860286/?from=search#reviews']),
  'https://www.ozon.ru/search/?text=cable',
), {
  sku: '2957860286',
  sourceUrl: 'https://www.ozon.ru/product/factual-card-2957860286/',
})
assert.deepEqual(cardProductContext(
  fakeCard(['https://seller.ozon.ru/app/product/not-storefront-12345/', 'https://m.ozon.ru/product/mobile-card-67890/']),
  'https://www.ozon.ru/category/electronics-15500/',
), {
  sku: '67890',
  sourceUrl: 'https://m.ozon.ru/product/mobile-card-67890/',
})
for (const hrefs of [
  [null, '', '/cart'],
  ['http://www.ozon.ru/product/insecure-12345/'],
  ['https://example.com/product/external-12345/'],
  ['https://www.ozon.ru/product/no-positive-sku-0/'],
  ['https://www.ozon.ru/category/not-a-product-12345/'],
  ['not a valid product URL'],
]) {
  assert.equal(cardProductContext(fakeCard(hrefs), 'https://www.ozon.ru/search/'), undefined)
}

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

assert.deepEqual(parseSellerCookieBindResponse({
  success: true,
  clientId: ' 123456 ',
  cookieCount: 7,
}), {
  success: true,
  clientId: '123456',
  cookieCount: 7,
})
assert.throws(() => parseSellerCookieBindResponse({ error: ' upload denied ' }), /upload denied/)
assert.throws(() => parseSellerCookieBindResponse({ success: true, clientId: '', cookieCount: 1 }), /无效响应/)
assert.throws(() => parseSellerCookieBindResponse({ success: true, clientId: '123456', cookieCount: -1 }), /无效响应/)
assert.throws(() => parseSellerCookieBindResponse(null), /无效响应/)

const backgroundSource = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8')
const contentSource = readFileSync(new URL('../entrypoints/ozon.content.ts', import.meta.url), 'utf8')
const floatingPanelSource = readFileSync(new URL('../lib/ozonbox/floating-panel.ts', import.meta.url), 'utf8')
const analyticsCardsSource = readFileSync(new URL('../lib/ozonbox/analytics-card.ts', import.meta.url), 'utf8')
const analyticsViewSource = readFileSync(new URL('../lib/ozonbox/analytics-view.ts', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../lib/utils/api.ts', import.meta.url), 'utf8')
assert.ok(backgroundSource.includes("type === 'OZONBOX_COLLECT_AND_SAVE_CURRENT_PRODUCT'"))
assert.ok(backgroundSource.includes('collectAndSaveOzonProduct(request.tabId ?? sender.tab?.id)'))
assert.ok(backgroundSource.includes('handleProductScraped(toSelectionProduct(collected))'))
// Legacy GET remains available for compatibility, but the user action must use
// the authenticated persistence flow below rather than treating a local read as binding.
assert.ok(backgroundSource.includes("type === 'OZONBOX_GET_SELLER_COOKIES'"))
assert.ok(backgroundSource.includes('browser.cookies.getAll({ url: `${OZON_SELLER_ORIGIN}/` })'))
assert.ok(backgroundSource.includes("type === 'OZONBOX_BIND_SELLER_COOKIES'"))
assert.ok(backgroundSource.includes('const companyCookie = await browser.cookies.get({'))
assert.ok(backgroundSource.includes('name: OZON_COMPANY_ID_COOKIE_NAME'))
assert.ok(backgroundSource.includes('const clientId = companyIdFromSellerCookie(companyCookie)'))
assert.ok(backgroundSource.includes("browser.cookies.getAll({ domain: 'ozon.ru' })"))
assert.ok(backgroundSource.includes("browser.cookies.getAll({ domain: 'sso.ozon.ru' })"))
assert.ok(backgroundSource.includes('cookies.map(cookie => `${cookie.name}=${cookie.value}`).join(\'; \')'))
assert.ok(backgroundSource.includes('await bindOzonSellerCookies({'))
assert.ok(backgroundSource.includes('ssoCookie: serializeCookies(ssoCookies)'))
assert.ok(backgroundSource.includes('cookieCount: ozonCookies.length + ssoCookies.length'))
assert.ok(backgroundSource.includes('bindSellerCookies().then(sendResponse).catch((error: unknown) => {'))
assert.ok(backgroundSource.includes("type === 'OZONBOX_PROCESS_CARD_PRODUCT'"))
assert.ok(backgroundSource.includes('processExactCardProduct(request).then(sendResponse)'))
assert.ok(contentSource.includes('persistLauncherPosition: (launcherPosition) => persistState({ launcherPosition })'))
assert.ok(contentSource.includes('persistCardVisibility: (visibility) => persistState(visibility)'))
assert.ok(contentSource.includes("type: 'OZONBOX_COLLECT_CARD_PRODUCT'"))
assert.ok(contentSource.includes('sku,'))
assert.ok(contentSource.includes('sourceUrl,'))
assert.ok(contentSource.includes('const collectCardProduct = async ({ sku, sourceUrl }: OzonCardProductContext)'))
assert.ok(contentSource.includes('return assertOzonboxCollectedProduct(response.data)'))
assert.equal(contentSource.match(/type: 'OZONBOX_COLLECT_CARD_PRODUCT'/g)?.length, 1)
assert.ok(contentSource.includes('const product = await collectCardProduct(context)'))
assert.ok(contentSource.includes('requireFloatingPanel().openListingForProduct(product)'))
assert.ok(contentSource.includes("requireFloatingPanel().openPricingForProduct('calculate2', product)"))
assert.ok(contentSource.includes("requireFloatingPanel().openPricingForProduct('calculate', product)"))
assert.ok(contentSource.includes("import { startOzonListCrawlController } from '@/lib/ozonbox/list-crawl'"))
assert.ok(contentSource.includes("type: 'OZONBOX_PROCESS_CARD_PRODUCT'"))
assert.ok(contentSource.includes('return assertOzonboxProcessCardProductResponse(response, sku)'))
assert.ok(contentSource.includes('listCrawler = startOzonListCrawlController({ processCardProduct: processListCardProduct })'))
assert.ok(contentSource.includes('onStartListCrawl: () => listCrawler?.start()'))
assert.ok(contentSource.includes('listCrawler?.stop()'))
assert.ok(contentSource.includes('listCrawler?.reconcile()'))
assert.ok(!floatingPanelSource.includes('browser.action.openPopup'))
assert.ok(floatingPanelSource.includes("type: 'OZONBOX_BIND_SELLER_COOKIES'"))
assert.ok(!floatingPanelSource.includes("type: 'OZONBOX_GET_SELLER_COOKIES'"))
assert.ok(floatingPanelSource.includes("title: 'Cookie 已绑定'"))
assert.ok(floatingPanelSource.includes('已安全绑定 ${result.cookieCount} 个 Cookie'))
const bindResponseStart = floatingPanelSource.indexOf('const result = parseSellerCookieBindResponse(await browser.runtime.sendMessage({')
const bindSuccessDialogStart = floatingPanelSource.indexOf("title: 'Cookie 已绑定'", bindResponseStart)
assert.ok(bindResponseStart >= 0 && bindSuccessDialogStart > bindResponseStart, '只有真实绑定 API 成功后才能显示成功提示')
assert.ok(floatingPanelSource.includes("{ type: 'PANEL_ERP_OPEN', route: '/' }"))
assert.ok(floatingPanelSource.includes('window.location.reload()'))
assert.ok(floatingPanelSource.includes('panelTools.openListing({ source: listingButton })'))
assert.ok(floatingPanelSource.includes("panelTools.openPricing('calculate2', { source: profitButton })"))
assert.ok(floatingPanelSource.includes("panelTools.openPricing('calculate', { source: pricingButton })"))
assert.ok(floatingPanelSource.includes("startListCrawlButton.hidden = page.kind !== 'list'"))
assert.ok(floatingPanelSource.includes('void options.onStartListCrawl?.()'))
assert.ok(floatingPanelSource.includes('openListingForProduct: (product) => panelTools.openListing({ product })'))
assert.ok(floatingPanelSource.includes('openPricingForProduct: (route, product) => panelTools.openPricing(route, { product })'))

assert.ok(apiSource.includes("return settings.apiBaseUrl.replace(/\\/+$/, '').replace(/\\/api$/, '')"))
assert.ok(apiSource.includes("normalized === 'localhost'"))
assert.ok(apiSource.includes("normalized === '127.0.0.1'"))
assert.ok(apiSource.includes("normalized === '::1'"))
assert.ok(apiSource.includes("normalized === '[::1]'"))
assert.ok(apiSource.includes('if (sensitiveLoopbackOnly) requireLoopbackApiBaseUrl(baseUrl)'))
const loopbackGuardStart = apiSource.indexOf('if (sensitiveLoopbackOnly) requireLoopbackApiBaseUrl(baseUrl)')
const authReadStart = apiSource.indexOf('const session = await getAuthSession()', loopbackGuardStart)
const fetchStart = apiSource.indexOf('await fetch(`${baseUrl}/api${path}`', authReadStart)
assert.ok(loopbackGuardStart >= 0 && authReadStart > loopbackGuardStart && fetchStart > authReadStart,
  '敏感 Cookie 请求必须在读取认证信息和发起网络请求前验证 loopback API 地址')
assert.ok(apiSource.includes("return request('/browser-sync/ozon-cookies', {"))
assert.ok(apiSource.includes("method: 'PUT'"))
assert.ok(apiSource.includes('client_id: input.clientId'))
assert.ok(apiSource.includes('ozon_cookie: input.ozonCookie'))
assert.ok(apiSource.includes('sso_cookie: input.ssoCookie'))
assert.ok(apiSource.includes("source: 'browser-extension'"))
assert.ok(apiSource.includes('}, true, true)'))

for (const operationContract of [
  "operation.dataset.ozonboxCardOperation = 'true'",
  'operation.dataset.sku = context.sku',
  'operation.dataset.sourceUrl = context.sourceUrl',
  "action: 'listing' | 'profit' | 'pricing'",
  'button.dataset.action = action',
  "createCardAction('listing', '一键上架', '采集中...', '#ff4d4f', options.onCardListing)",
  "createCardAction('profit', '计算利润', '计算中...', '#1677ff', options.onCardProfit)",
  "createCardAction('pricing', '定价工具', '加载中...', '#d48806', options.onCardPricing)",
  'button.disabled = true',
  "button.setAttribute('aria-busy', 'true')",
  'void Promise.resolve(callback?.(context))',
  'button.disabled = false',
  "button.setAttribute('aria-busy', 'false')",
  'button.textContent = idleText',
  'status.textContent = errorMessage(error)',
  "status.style.display = 'none'",
  'const reconcileListCards = (analyticsVisible: boolean)',
  "else if (page.kind === 'list') reconcileListCards(!cardVisibility.listCardsHidden)",
  "const enabled = page.kind === 'list' || (page.kind === 'detail' && cardVisibility.detailCardsVisible)",
]) {
  assert.ok(analyticsCardsSource.includes(operationContract), `卡片操作契约缺失：${operationContract}`)
}
for (const listLifecycleContract of [
  'const LIST_BATCH_SIZE = 4',
  'const LIST_BATCH_DELAY_MS = 300',
  'const insertionTimers = new Map<HTMLElement, PendingListInsertion>()',
  'if (!iframeHasCurrentIdentity(iframe, sku)) return',
  'if (iframeHasCurrentIdentity(iframe, sku)) setAnalyticsStatus(iframe, errorMessage(error))',
  'clearListCard(card, true)',
  'iframe.dataset.sourceUrl === context.sourceUrl',
  'if (iframe !== existing) iframe.remove()',
  'if (pending && sameCardProductContext(pending.context, context)) continue',
  'currentContext.sourceUrl !== context.sourceUrl',
  'Math.floor(insertionIndex / LIST_BATCH_SIZE) * LIST_BATCH_DELAY_MS',
  "attributeFilter: ['href']",
  'if (generatedExtensionNode(record.target)) return false',
]) {
  assert.ok(analyticsCardsSource.includes(listLifecycleContract), `列表指标卡生命周期契约缺失：${listLifecycleContract}`)
}
assert.ok(analyticsViewSource.includes('if (sourceUrl) iframe.dataset.sourceUrl = sourceUrl'))
assert.ok(analyticsCardsSource.includes('for (const operation of card.querySelectorAll(CARD_OPERATION_SELECTOR)) operation.remove()'))
const removeLiteStart = analyticsCardsSource.indexOf("const removeFramesByType = (type: 'detail' | 'lite')")
const injectOperationStart = analyticsCardsSource.indexOf('const injectCardOperation', removeLiteStart)
assert.ok(removeLiteStart >= 0 && injectOperationStart > removeLiteStart)
assert.ok(
  !analyticsCardsSource.slice(removeLiteStart, injectOperationStart).includes('CARD_OPERATION_SELECTOR'),
  '隐藏 lite 分析 iframe 不得移除核心卡片操作区',
)

assert.equal(analyticsLoadStatus({}), '已加载')
assert.equal(analyticsLoadStatus({
  ozonboxSellerVariantPackageError: 'variant endpoint unavailable',
}), '已加载；Seller 变体包裹参数读取失败：variant endpoint unavailable')
assert.equal(analyticsLoadStatus({
  ozonboxSellerVariantPackageError: 'variant endpoint unavailable',
  ozonboxPackageFactsError: 'backend unavailable',
}), '已加载；Seller 变体包裹参数读取失败：variant endpoint unavailable；后端包裹事实读取失败：backend unavailable')

console.log('Ozon runtime fixtures passed: floating panel, Seller contract, request deduplication and routes')