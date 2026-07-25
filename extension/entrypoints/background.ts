import type { ScrapedProduct } from '@/lib/utils/types'
import type {
  OzonboxCollectAndSaveRequest,
  OzonboxCollectAndSaveResponse,
  OzonboxCollectCardProductRequest,
  OzonboxCollectedProduct,
  OzonboxProcessCardProductRequest,
  OzonboxProcessCardProductResponse,
  OzonboxRuntimeMessage,
  OzonboxSellerApiResponse,
} from '@/lib/ozonbox/contract'
import { assertOzonboxCollectedProduct, isRecord } from '@/lib/ozonbox/contract'
import { validatedErpBaseUrl } from '@/lib/ozonbox/erp-url'
import type {
  PanelListingDraftInput,
  PanelPricingContext,
  PanelPricingRoute,
  PanelToolMode,
  PanelToolRequest,
  PanelToolResponse,
} from '@/lib/ozonbox/panel-tools-contract'
import { isPanelToolRequest } from '@/lib/ozonbox/panel-tools-contract'
import { buildPanelListingPreview, toPanelListingStores } from '@/lib/ozonbox/panel-tools-listing'
import {
  buildMockListingPreview,
  createMockRule,
  deleteMockRule,
  listMockRules,
  prepareMockListingDraft,
  runMockPricing,
  submitMockListingDraft,
  toggleMockRule,
  updateMockRule,
} from '@/lib/ozonbox/panel-tools-mock'
import { toSelectionProduct } from '@/lib/ozonbox/selection-product'
import { buildOzonSelectionCandidate, matchSelectionRules } from '@/lib/ozonbox/selection-matcher'
import { assertOzonListCrawlProcessConfig } from '@/lib/ozonbox/list-crawl-contract'
import { retainExactRequestedSkuVariant } from '@/lib/ozonbox/list-crawl-product'
import {
  analyticsItemForExactSku,
  collectedProductAnalyticsSku,
  fetchOzonAnalyticsItem,
  mergeExactSkuAnalyticsProduct,
  normalizeAnalyticsItem,
} from '@/lib/ozonbox/seller-analytics'
import type { OzonboxAnalyticsItem } from '@/lib/ozonbox/seller-analytics'
import { parseOzonSellerOffersResponse } from '@/lib/ozonbox/seller-offers'
import {
  companyIdFromSellerCookie,
  OZON_COMPANY_ID_COOKIE_NAME,
  OZON_SELLER_ORIGIN,
  requireOzonCompanyId,
} from '@/lib/ozonbox/seller-session'
import { extractOzonProductId, isOzonListPage, isOzonProductUrl, isOzonUrl } from '@/lib/ozonbox/url'
import { getAuthSession, getSettings, saveSettings } from '@/lib/utils/storage'
import {
  syncProducts,
  bindOzonSellerCookies,
  fetchBackendProducts,
  getRubToCnyExchangeRate,
  deleteBackendProduct,
  checkBackendHealth,
  queryOzonboxPackageFacts,
  createPanelSelectionRule,
  deletePanelSelectionRule,
  listOzonboxStores,
  listPanelSelectionRules,
  preparePanelListingDraft,
  runPanelPricing,
  submitPanelListingDraft,
  togglePanelSelectionRule,
  updatePanelSelectionRule,
} from '@/lib/utils/api'

const OZON_CONTENT_SCRIPT = '/content-scripts/ozon.js'
const SELLER_URL_PATTERN = 'https://seller.ozon.ru/*'
const OZON_PRODUCT_TAB_TIMEOUT_MS = 20_000

function isSellerUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'seller.ozon.ru'
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function collectedOzonProduct(response: unknown): OzonboxCollectedProduct {
  if (isRecord(response) && typeof response.error === 'string' && response.error.trim()) {
    throw new Error(response.error.trim())
  }
  return assertOzonboxCollectedProduct(response)
}

function factualPricingContext(
  product: OzonboxCollectedProduct,
  route: PanelPricingRoute,
): PanelPricingContext {
  const metrics = product.ozonMetrics
  const categoryIds = [...new Set([product.categoryId, product.descriptionCategoryId]
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0))]
  return {
    route,
    sku: product.sku?.trim() || metrics?.sku?.trim() || product.productId,
    productName: product.title.trim(),
    sellPrice: Number.isFinite(product.price) ? product.price : 0,
    packageWeight: metrics?.packageWeightG ?? 0,
    packageLength: metrics?.packageLengthMm ?? 0,
    packageWidth: metrics?.packageWidthMm ?? 0,
    packageHeight: metrics?.packageHeightMm ?? 0,
    packageVolumeCm3: metrics?.volumeCm3 ?? 0,
    rfbsRate: metrics && Number.isFinite(metrics.rfbsCommission) ? [metrics.rfbsCommission] : [],
    categoryIds,
  }
}

function serializeCookies(cookies: Array<{ name: string, value: string }>): string {
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
}

async function bindSellerCookies(): Promise<{ success: true, clientId: string, cookieCount: number }> {
  const companyCookie = await browser.cookies.get({
    url: `${OZON_SELLER_ORIGIN}/`,
    name: OZON_COMPANY_ID_COOKIE_NAME,
  })
  const clientId = companyIdFromSellerCookie(companyCookie)
  const [ozonCookies, ssoCookies] = await Promise.all([
    browser.cookies.getAll({ domain: 'ozon.ru' }),
    browser.cookies.getAll({ domain: 'sso.ozon.ru' }),
  ])
  const ozonCookie = serializeCookies(ozonCookies)
  if (!ozonCookie) throw new Error('未找到可绑定的 Ozon Cookie，请先登录 Ozon 卖家后台')
  await bindOzonSellerCookies({
    clientId,
    ozonCookie,
    ssoCookie: serializeCookies(ssoCookies),
  })
  return {
    success: true,
    clientId,
    cookieCount: ozonCookies.length + ssoCookies.length,
  }
}

function requirePositiveIntegerString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) {
    throw new Error(`${field} 必须是真实的正整数`)
  }
  return value.trim()
}

function requireExactCardProductUrl(value: unknown, sku: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('商品卡片缺少真实的详情页地址')
  const url = new URL(value.trim())
  // Remove any query params or hash that might have been missed by canonicalOzonProductUrl
  url.search = ''
  url.hash = ''
  const extractedSku = extractOzonProductId(url.href)
  if (!extractedSku) throw new Error(`商品卡片地址 ${url.href} 中未提取到 SKU`)
  if (extractedSku !== sku) throw new Error(`商品卡片 SKU 不匹配：期望 ${sku}，实际 ${extractedSku}`)
  return url.href
}


function requireExactLoadedProductUrl(value: string | undefined, sku: string): string {
  if (!value || !isOzonProductUrl(value) || extractOzonProductId(value) !== sku) {
    throw new Error('临时标签页最终地址与所选商品 SKU 不一致')
  }
  return value
}

async function waitForExactOzonProductTab(tabId: number, sku: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, url?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      browser.tabs.onUpdated.removeListener(onUpdated)
      if (error) reject(error)
      else resolve(url!)
    }
    const inspect = (tab: Browser.tabs.Tab) => {
      if (tab.id !== tabId || tab.status !== 'complete') return
      try {
        finish(undefined, requireExactLoadedProductUrl(tab.url, sku))
      } catch (error: unknown) {
        finish(error instanceof Error ? error : new Error(errorMessage(error)))
      }
    }
    const onUpdated = (updatedTabId: number, changeInfo: Browser.tabs.OnUpdatedInfo, tab: Browser.tabs.Tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') inspect(tab)
    }
    const timeout = setTimeout(() => finish(new Error('等待所选商品详情页加载超时')), OZON_PRODUCT_TAB_TIMEOUT_MS)
    browser.tabs.onUpdated.addListener(onUpdated)
    browser.tabs.get(tabId).then(inspect).catch((error: unknown) => {
      finish(new Error(`无法读取临时商品标签页：${errorMessage(error)}`))
    })
  })
}

function assertExactCollectedCardIdentity(product: OzonboxCollectedProduct, sku: string): OzonboxCollectedProduct {
  if (extractOzonProductId(product.sourceUrl) !== sku) {
    throw new Error('采集结果来源地址与所选商品 SKU 不一致')
  }
  const identities = new Set<string>()
  const addIdentity = (value: unknown) => {
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) identities.add(value.trim())
  }
  addIdentity(product.productId)
  addIdentity(product.sku)
  product.variantsData.forEach((variant) => {
    addIdentity(variant.id)
    addIdentity(variant.productId)
    addIdentity(variant.sku)
  })
  if (!identities.has(sku)) throw new Error('采集结果不包含所选商品的真实 SKU 身份')
  return product
}

interface ExactCardProductIdentity {
  sku: string
  sourceUrl: string
}

function exactCardProductIdentity(
  request: Pick<OzonboxCollectCardProductRequest, 'sku' | 'sourceUrl'>,
): ExactCardProductIdentity {
  const sku = requirePositiveIntegerString(request.sku, 'sku')
  return {
    sku,
    sourceUrl: requireExactCardProductUrl(request.sourceUrl, sku),
  }
}

async function withExactCardProductTab<T>(
  identity: ExactCardProductIdentity,
  collect: (tabId: number) => Promise<T>,
): Promise<T> {
  let temporaryTabId: number | undefined
  try {
    const temporaryTab = await browser.tabs.create({ url: identity.sourceUrl, active: false })
    temporaryTabId = temporaryTab.id
    if (!temporaryTabId) throw new Error('无法创建所选商品的临时标签页')
    await waitForExactOzonProductTab(temporaryTabId, identity.sku)
    const result = await collect(temporaryTabId)
    const finalTab = await browser.tabs.get(temporaryTabId)
    requireExactLoadedProductUrl(finalTab.url, identity.sku)
    return result
  } finally {
    if (temporaryTabId) {
      try {
        await browser.tabs.remove(temporaryTabId)
      } catch {
        // The user/browser may already have removed the temporary tab.
      }
    }
  }
}

async function collectExactCardProduct(request: OzonboxCollectCardProductRequest): Promise<OzonboxCollectedProduct> {
  const identity = exactCardProductIdentity(request)
  if (!(await isAuthenticated())) throw new Error(authRequired().error)
  return withExactCardProductTab(identity, async (tabId) => {
    const product = await collectOzonProductInTab(tabId)
    return assertExactCollectedCardIdentity(product, identity.sku)
  })
}

async function fetchExactSellerAnalyticsItem(sku: string): Promise<OzonboxAnalyticsItem | null> {
  try {
    const sellerId = await readOzonSellerId()
    const response = await fetchSellerAnalytics(sku, sellerId)
    if (!response.ok) {
      console.warn(`Ozon seller analytics 不可用（HTTP ${response.status}），按缺失事实处理`)
      return null
    }
    const item = analyticsItemForExactSku(response.data, sku)
    return item ? normalizeAnalyticsItem(item) : null
  } catch (error: unknown) {
    console.warn('Ozon seller analytics 不可用，按缺失事实处理', error)
    return null
  }
}

async function fetchSellerOffersInProductTab(tabId: number, sku: string) {
  try {
    const request: OzonboxRuntimeMessage = { type: 'OZONBOX_FETCH_SELLER_OFFERS', sku }
    const response: unknown = await browser.tabs.sendMessage(tabId, request)
    if (isRecord(response) && typeof response.error === 'string' && response.error.trim()) {
      throw new Error(response.error.trim())
    }
    return parseOzonSellerOffersResponse(response)
  } catch (error: unknown) {
    console.warn('Ozon PDP 卖家报价不可用，按缺失事实处理', error)
    return undefined
  }
}

async function readOptionalRubToCnyRate(): Promise<number | undefined> {
  try {
    return await getRubToCnyExchangeRate()
  } catch (error: unknown) {
    console.warn('RUB→CNY 汇率不可用，CNY 事实按缺失处理', error)
    return undefined
  }
}

async function processExactCardProduct(
  request: OzonboxProcessCardProductRequest,
): Promise<OzonboxProcessCardProductResponse> {
  const identity = exactCardProductIdentity(request)
  const processConfig = assertOzonListCrawlProcessConfig(request.config)
  if (!(await isAuthenticated())) throw new Error(authRequired().error)

  if (processConfig.selectionRuleIds.length === 0) {
    return {
      success: true,
      outcome: 'skipped',
      reason: 'no-selected-rules',
      sku: identity.sku,
      matchedRuleIds: [],
      created: 0,
      skipped: 1,
    }
  }
  const rules = await listPanelSelectionRules()
  const rulesById = new Map(rules.map(rule => [rule.id, rule]))
  const selectedRules = processConfig.selectionRuleIds.map((id) => {
    const rule = rulesById.get(id)
    if (!rule) throw new Error(`本次启动选择的选品规则 ${id} 不存在`)
    if (!rule.enabled) throw new Error(`本次启动选择的选品规则“${rule.name}”已停用`)
    return rule
  })

  const facts = await withExactCardProductTab(identity, async (tabId) => {
    const collectedProduct = assertExactCollectedCardIdentity(
      await collectOzonProductInTab(tabId, { enrichFromSeller: false }),
      identity.sku,
    )
    const product = processConfig.collectVariants
      ? collectedProduct
      : retainExactRequestedSkuVariant(collectedProduct, identity.sku)
    const analyticsSku = collectedProductAnalyticsSku(product) ?? identity.sku
    const [analytics, rubToCny, sellerOffers] = await Promise.all([
      fetchExactSellerAnalyticsItem(analyticsSku),
      readOptionalRubToCnyRate(),
      fetchSellerOffersInProductTab(tabId, identity.sku),
    ])
    return { product, analytics, rubToCny, sellerOffers }
  })

  const candidate = buildOzonSelectionCandidate({
    product: facts.product,
    analytics: facts.analytics,
    rubToCny: facts.rubToCny,
    sellerOffers: facts.sellerOffers,
  })
  const matchedRules = matchSelectionRules(candidate, selectedRules)
  if (matchedRules.length === 0) {
    return {
      success: true,
      outcome: 'skipped',
      reason: 'no-rule-match',
      sku: identity.sku,
      matchedRuleIds: [],
      created: 0,
      skipped: 1,
    }
  }

  if (!(await checkBackendHealth())) throw new Error('后端不可用,请检查 backend 是否运行')
  const saved = await syncProducts([toSelectionProduct(facts.product)])
  await updateBadge()
  return {
    success: true,
    outcome: 'saved',
    sku: identity.sku,
    matchedRuleIds: matchedRules.map(rule => rule.id),
    created: saved.created,
    skipped: saved.skipped,
  }
}


function collectedProductForRequest(
  product: OzonboxCollectedProduct | undefined,
  tabId?: number,
  options?: OzonCollectionOptions,
): Promise<OzonboxCollectedProduct> {
  if (product !== undefined) return Promise.resolve(assertOzonboxCollectedProduct(product))
  return collectOzonProductInTab(tabId, options)
}

/** 更新 badge 显示后端未匹配数量 */
async function updateBadge() {
  try {
    const resp = await fetchBackendProducts(undefined, 1)
    // badge 只在有数据时显示总数
    const total = resp.total || 0
    const text = total > 0 ? String(total > 99 ? '99+' : total) : ''
    await browser.action.setBadgeText({ text })
    await browser.action.setBadgeBackgroundColor({ color: '#ff6600' })
  } catch {
    // 后端不可用时清除 badge
    await browser.action.setBadgeText({ text: '' })
  }
}

async function isAuthenticated(): Promise<boolean> {
  const session = await getAuthSession()
  return Boolean(session?.access_token)
}

function authRequired() {
  return { success: false, error: '请先登录插件' } as const
}

function realListingProduct(product: OzonboxCollectedProduct, input: PanelListingDraftInput) {
  if (input.watermarkEnabled || input.randomizeImages || input.modelImagesEnabled || input.floatingPriceEnabled) {
    throw new Error('真实模式暂不支持水印、图片随机化、模特图或浮动定价；请关闭后再创建草稿')
  }
  const selected = new Map(input.variants.filter(variant => variant.selected).map(variant => [variant.sku, variant]))
  if (!selected.size) throw new Error('至少选择一个真实变体')
  const variantsData = product.variantsData
    .filter(variant => selected.has(variant.sku || variant.offerId || variant.id || ''))
    .map(variant => {
      const edited = selected.get(variant.sku || variant.offerId || variant.id || '')!
      return { ...variant, price: edited.priceRub, oldPrice: edited.oldPriceRub, images: edited.images }
    })
  if (!variantsData.length) throw new Error('所选变体无法与当前页面的真实变体匹配')
  return {
    ...product,
    storeId: input.storeId,
    title: input.title.trim(),
    recordName: input.title.trim(),
    brand: input.brand?.trim() || product.brand,
    descriptionCategoryId: input.descriptionCategoryId,
    categoryId: input.descriptionCategoryId,
    typeId: input.typeId,
    variantsData,
  }
}

async function dispatchPanelTool(
  request: PanelToolRequest,
  tabId?: number,
): Promise<PanelToolResponse<unknown>> {
  const current = await getSettings()
  if (request.type === 'PANEL_SETTINGS_GET') {
    return { success: true, mode: current.panelToolMode, data: { mode: current.panelToolMode, erpBaseUrl: current.erpBaseUrl } }
  }
  if (request.type === 'PANEL_SETTINGS_UPDATE') {
    const erpBaseUrl = request.settings.erpBaseUrl.trim()
      ? validatedErpBaseUrl(request.settings.erpBaseUrl)
      : ''
    await saveSettings({ ...current, panelToolMode: request.settings.mode, erpBaseUrl })
    return { success: true, mode: request.settings.mode, data: { mode: request.settings.mode, erpBaseUrl } }
  }

  const mode: PanelToolMode = current.panelToolMode
  if (request.type === 'PANEL_ERP_OPEN') {
    const baseUrl = validatedErpBaseUrl(current.erpBaseUrl)
    const target = new URL(request.route.replace(/^\//, ''), `${baseUrl}/`).toString()
    await browser.tabs.create({ url: target })
    return { success: true, mode, data: { opened: true, url: target } }
  }

  if (request.type === 'PANEL_PRICING_CONTEXT') {
    const product = await collectedProductForRequest(request.product, tabId, mode === 'mock'
      ? { requireAuthentication: false, enrichFromSeller: false }
      : undefined)
    return { success: true, mode, data: factualPricingContext(product, request.route) }
  }

  if (mode === 'mock') {
    switch (request.type) {
      case 'PANEL_PRICING_RUN': return { success: true, mode, data: runMockPricing(request.input) }
      case 'PANEL_SELECTION_LIST': return { success: true, mode, data: await listMockRules() }
      case 'PANEL_SELECTION_CREATE': return { success: true, mode, data: await createMockRule(request.input) }
      case 'PANEL_SELECTION_UPDATE': return { success: true, mode, data: await updateMockRule(request.id, request.input) }
      case 'PANEL_SELECTION_TOGGLE': return { success: true, mode, data: await toggleMockRule(request.id, request.enabled) }
      case 'PANEL_SELECTION_DELETE': return { success: true, mode, data: await deleteMockRule(request.id) }
      case 'PANEL_LISTING_PREVIEW': return {
        success: true,
        mode,
        data: buildMockListingPreview(await collectedProductForRequest(request.product, tabId, {
          requireAuthentication: false,
          enrichFromSeller: false,
        })),
      }
      case 'PANEL_LISTING_PREPARE': return { success: true, mode, data: prepareMockListingDraft(request.input) }
      case 'PANEL_LISTING_SUBMIT': return { success: true, mode, data: submitMockListingDraft(request.draftId) }
    }
  }

  switch (request.type) {
    case 'PANEL_PRICING_RUN': return { success: true, mode, data: await runPanelPricing(request.input) }
    case 'PANEL_SELECTION_LIST': return { success: true, mode, data: await listPanelSelectionRules() }
    case 'PANEL_SELECTION_CREATE': return { success: true, mode, data: await createPanelSelectionRule(request.input) }
    case 'PANEL_SELECTION_UPDATE': return { success: true, mode, data: await updatePanelSelectionRule(request.id, request.input) }
    case 'PANEL_SELECTION_TOGGLE': return { success: true, mode, data: await togglePanelSelectionRule(request.id, request.enabled) }
    case 'PANEL_SELECTION_DELETE': return { success: true, mode, data: await deletePanelSelectionRule(request.id) }
    case 'PANEL_LISTING_PREVIEW': {
      const product = await collectedProductForRequest(request.product, tabId)
      const stores = await listOzonboxStores()
      return { success: true, mode, data: buildPanelListingPreview(product, toPanelListingStores(stores), []) }
    }
    case 'PANEL_LISTING_PREPARE': {
      const product = await collectedProductForRequest(request.product, tabId)
      return { success: true, mode, data: await preparePanelListingDraft(realListingProduct(product, request.input), request.input) }
    }
    case 'PANEL_LISTING_SUBMIT': return { success: true, mode, data: await submitPanelListingDraft(request.draftId) }
  }
}

export default defineBackground(() => {

  // 初始化 badge
  updateBadge()

  // 监听来自 content script 和 popup 的消息
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isPanelToolRequest(message)) {
      const requestedMode = message.type === 'PANEL_SETTINGS_UPDATE' ? message.settings.mode : undefined
      dispatchPanelTool(message, sender.tab?.id).then(sendResponse).catch(async (error: unknown) => {
        const mode = requestedMode ?? (await getSettings()).panelToolMode
        sendResponse({ success: false, mode, error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'COLLECT_PRODUCT') {
      collectOzonProductInTab((message as { tabId?: number }).tabId ?? sender.tab?.id).then((product) => {
        sendResponse({ success: true, data: product })
      }).catch((error: unknown) => {
        sendResponse({ success: false, error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_COLLECT_CARD_PRODUCT') {
      const request = message as OzonboxCollectCardProductRequest
      collectExactCardProduct(request).then((product) => {
        sendResponse({ success: true, data: product })
      }).catch((error: unknown) => {
        sendResponse({ success: false, error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_PROCESS_CARD_PRODUCT') {
      const request = message as OzonboxProcessCardProductRequest
      processExactCardProduct(request).then(sendResponse).catch((error: unknown) => {
        sendResponse({ success: false, error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_COLLECT_AND_SAVE_CURRENT_PRODUCT') {
      const request = message as OzonboxCollectAndSaveRequest
      collectAndSaveOzonProduct(request.tabId ?? sender.tab?.id).then(sendResponse).catch((error: unknown) => {
        sendResponse({ success: false, error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_READ_SELLER_ID') {
      readOzonSellerId().then((sellerId) => {
        sendResponse({ sellerId })
      }).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_GET_SELLER_COOKIES') {
      browser.cookies.getAll({ url: `${OZON_SELLER_ORIGIN}/` }).then((cookies) => {
        sendResponse({
          cookies: cookies.map(cookie => ({
            domain: cookie.domain,
            expirationDate: cookie.expirationDate,
            hostOnly: cookie.hostOnly,
            httpOnly: cookie.httpOnly,
            name: cookie.name,
            path: cookie.path,
            sameSite: cookie.sameSite,
            secure: cookie.secure,
            session: cookie.session,
            storeId: cookie.storeId,
            value: cookie.value,
          })),
        })
      }).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_BIND_SELLER_COOKIES') {
      bindSellerCookies().then(sendResponse).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_FETCH_SELLER_ANALYTICS') {
      const request = message as OzonboxRuntimeMessage & { type: 'OZONBOX_FETCH_SELLER_ANALYTICS' }
      fetchSellerAnalytics(request.sku, request.shopId).then(sendResponse).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_FETCH_PACKAGE_FACTS') {
      const request = message as OzonboxRuntimeMessage & { type: 'OZONBOX_FETCH_PACKAGE_FACTS' }
      queryOzonboxPackageFacts(request.sku).then(sendResponse).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_FETCH_SELLER_VARIANT_PACKAGE') {
      const request = message as OzonboxRuntimeMessage & { type: 'OZONBOX_FETCH_SELLER_VARIANT_PACKAGE' }
      fetchSellerVariantPackage(request.variantId, request.shopId).then(sendResponse).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }

    // Content script 上报采集数据 → 直接保存到后端
    if (message.action === 'productScraped') {
      handleProductScraped(message.data).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // Content script 增量批量上报 → 保存到后端
    if (message.action === 'batchSyncProducts') {
      handleBatchSync(message.products).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // Popup 请求触发单个商品采集
    if (message.action === 'triggerScrape') {
      triggerScrapeInTab(message.tabId).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // Popup 请求触发列表页滚动采集
    if (message.action === 'triggerListScrape') {
      triggerListScrapeInTab(message.tabId, message.maxItems, message.scrollDelay, message.batchSize).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // 停止采集 → 转发到 content script
    if (message.action === 'stopScraping') {
      stopScrapingInTab().then((result) => {
        sendResponse(result)
      })
      return true
    }

    // Content script 报告列表采集进度 → 转发给 popup
    if (message.action === 'scrapingProgress') {
      return false // 不拦截,让 popup 的 listener 接收
    }

    // Content script 报告列表采集进度 (旧兼容)
    if (message.action === 'listProgress') {
      return false
    }

    // 从后端获取产品列表
    if (message.action === 'getProducts') {
      getProductsForPopup(message.platform, message.limit).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // 从后端删除产品
    if (message.action === 'deleteProduct') {
      deleteProductForPopup(message.id).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // 检查页面是否可采集
    if (message.action === 'checkCurrentPage') {
      checkCurrentPage().then((result) => {
        sendResponse(result)
      })
      return true
    }

    // 进度转发
    if (message.action === 'enrichProgress') {
      return false
    }

    // Ozon 列表采集控制：转发到 content script
    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_LIST_CRAWL_START'
      || (message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_LIST_CRAWL_STOP'
      || (message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_LIST_CRAWL_SNAPSHOT') {
      browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (!tab?.id) {
          sendResponse({ error: '无活动标签页' })
          return
        }
        return browser.tabs.sendMessage(tab.id, message).then((result) => {
          sendResponse(result)
        })
      }).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }
  })

  // Tab 更新时，如果启用了自动采集，通知 content script
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url) return

    const settings = await getSettings()
    if (!settings.autoScrape) return
    if (!(await isAuthenticated())) return

    const url = tab.url
    // Ozon remains an explicit popup-driven flow and is intentionally excluded
    // from automatic collection.
    const isWB = /wildberries\.ru/.test(url) && /\/\d+\/?$/.test(url)
    const is1688 = /detail\.1688\.com\/offer\//.test(url) || /s\.1688\.com\/selloffer/.test(url) || /s\.1688\.com\/offer_search/.test(url)
    const isPdd = /(yangkeduo|pinduoduo)\.com/.test(url) && (/goods\.html/i.test(url) || /[?&](goods_id|goodsId)=\d+/.test(url))

    if (isWB || is1688 || isPdd) {
      try {
        const file = isPdd ? '/content-scripts/pdd.js' : is1688 ? '/content-scripts/ali1688.js' : '/content-scripts/wb.js'
        await browser.scripting.executeScript({
          target: { tabId },
          files: [file],
        })
      } catch (e) {
      }
    }
  })
})

type ProductScrapedResult =
  | { success: true; created: number; skipped: number }
  | { success: false; error: string }

async function handleProductScraped(product: ScrapedProduct): Promise<ProductScrapedResult> {
  try {
    if (!(await isAuthenticated())) return authRequired()
    const healthy = await checkBackendHealth()
    if (!healthy) {
      return { success: false, error: '后端不可用,请检查 backend 是否运行' }
    }
    const result = await syncProducts([product])
    await updateBadge()
    return { success: true, created: result.created, skipped: result.skipped }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function collectAndSaveOzonProduct(tabId?: number): Promise<OzonboxCollectAndSaveResponse> {
  const collected = await collectOzonProductInTab(tabId)
  const result = await handleProductScraped(toSelectionProduct(collected))
  if (!result.success) throw new Error(result.error)
  return { success: true, created: result.created, skipped: result.skipped } as const
}

/** 根据 URL 判断平台并返回对应的 content script 文件 */
function getContentScriptFile(url: string): string | null {
  if (/1688\.com/.test(url)) return '/content-scripts/ali1688.js'
  if (/yangkeduo\.com|pinduoduo\.com/.test(url)) return '/content-scripts/pdd.js'
  if (/wildberries\.ru/.test(url)) return '/content-scripts/wb.js'
  return null
}

/** 确保 content script 已注入:先尝试发消息,失败则注入并等待初始化 */
async function ensureContentScript(tabId: number, url?: string): Promise<boolean> {
  try {
    // 先试探 content script 是否已加载
    await browser.tabs.sendMessage(tabId, { action: 'checkPage' })
    return true
  } catch {
    // content script 未加载,尝试注入
    const scriptFile = url ? getContentScriptFile(url) : null
    if (!scriptFile) return false
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: [scriptFile as any] })
      // 等待 content script 初始化
      await new Promise((resolve) => setTimeout(resolve, 300))
      return true
    } catch (e) {
      return false
    }
  }
}

async function triggerScrapeInTab(tabId: number) {
  try {
    if (!(await isAuthenticated())) return authRequired()
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
    const targetId = tabId || activeTab?.id
    if (!targetId) return { success: false, error: '无活动标签页' }

    const tab = tabId ? await browser.tabs.get(targetId) : activeTab
    if (tab?.url && isOzonProductUrl(tab.url)) {
      const product = await collectOzonProductInTab(targetId)
      return { success: true, data: product }
    }

    const injected = await ensureContentScript(targetId, tab?.url)
    if (!injected) return { success: false, error: '无法注入采集脚本,请刷新页面后重试' }

    const resp = await browser.tabs.sendMessage(targetId, { action: 'scrape' })

    // ★ 关键修复:采集到数据后立即保存到后端
    if (resp?.success && resp.data) {
      const saved = await handleProductScraped(resp.data)
      return { ...resp, ...saved }
    }

    return resp || { success: false, error: '采集失败' }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

interface OzonCollectionOptions {
  requireAuthentication?: boolean
  enrichFromSeller?: boolean
}

async function collectOzonProductInTab(
  tabId?: number,
  options: OzonCollectionOptions = {},
): Promise<OzonboxCollectedProduct> {
  const { requireAuthentication = true, enrichFromSeller = true } = options
  if (requireAuthentication && !(await isAuthenticated())) throw new Error(authRequired().error)
  if (!tabId) throw new Error('没有可采集的 Ozon 标签页')

  const tab = await browser.tabs.get(tabId)
  if (!tab.url || !isOzonProductUrl(tab.url)) {
    throw new Error('当前页面不是严格匹配的 Ozon 商品详情页')
  }

  const request: OzonboxRuntimeMessage = { type: 'COLLECT_PRODUCT' }
  let response: unknown
  try {
    response = await browser.tabs.sendMessage(tabId, request)
  } catch (firstError: unknown) {
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: [OZON_CONTENT_SCRIPT] })
      await new Promise((resolve) => setTimeout(resolve, 300))
      response = await browser.tabs.sendMessage(tabId, request)
    } catch (secondError: unknown) {
      throw new Error(`无法启动 Ozon 采集脚本：${errorMessage(secondError)}；首次尝试：${errorMessage(firstError)}`)
    }
  }
  const product = collectedOzonProduct(response)
  if (!enrichFromSeller) return product

  const sku = collectedProductAnalyticsSku(product)
  if (!sku) return product
  try {
    const sellerId = await readOzonSellerId()
    const analyticsItem = await fetchOzonAnalyticsItem(sku, sellerId)
    return analyticsItem ? mergeExactSkuAnalyticsProduct(product, analyticsItem, sku) : product
  } catch (error: unknown) {
    console.warn('Ozon seller analytics 精确 SKU 富化不可用，保留 PDP 采集结果', error)
    return product
  }
}

async function findSellerTab(explicitTabId?: number) {
  if (explicitTabId) {
    const tab = await browser.tabs.get(explicitTabId)
    if (!tab.url || !isSellerUrl(tab.url)) throw new Error('指定标签页不是 Ozon 卖家后台')
    return tab
  }
  const tabs = await browser.tabs.query({ url: SELLER_URL_PATTERN })
  const sellerTabs = tabs.filter((candidate) => candidate.id && candidate.url && isSellerUrl(candidate.url))
  const tab = sellerTabs.find((candidate) => candidate.active) ?? sellerTabs[0]
  if (!tab) throw new Error('未找到已打开的 Ozon 卖家后台标签页')
  return tab
}

async function readOzonSellerId(explicitTabId?: number): Promise<string> {
  if (explicitTabId) {
    await findSellerTab(explicitTabId)
  }
  const cookie = await browser.cookies.get({
    url: `${OZON_SELLER_ORIGIN}/`,
    name: OZON_COMPANY_ID_COOKIE_NAME,
  })
  return companyIdFromSellerCookie(cookie)
}

async function fetchSellerApi(
  sku: string,
  shopId: string,
  pageType: 'what-to-sell' | 'products' | undefined,
  endpoint: string,
  body: Record<string, unknown>,
  language: 'zh-Hans' | 'RU',
  explicitTabId?: number,
): Promise<OzonboxSellerApiResponse> {
  const tab = await findSellerTab(explicitTabId)
  if (!tab.id) throw new Error('Ozon 卖家标签页缺少 ID')
  requirePositiveIntegerString(String(sku), 'sku')
  const companyId = requireOzonCompanyId(shopId)
  const headers = {
    'content-type': 'application/json',
    'x-o3-company-id': companyId,
    'x-o3-language': language,
    ...(pageType ? { 'x-o3-app-name': 'seller-ui', 'x-o3-page-type': pageType } : {}),
  }

  // The seller API must run in the seller tab's page context.  A service
  // worker fetch does not reliably carry the seller page's authenticated
  // cookie/session context and is answered with 403 by Ozon.
  const result = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    args: [{ endpoint, headers, body }],
    func: async (request: {
      endpoint: string
      headers: Record<string, string>
      body: Record<string, unknown>
    }) => {
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        credentials: 'include',
      })
      const data = await response.json().catch(() => null)
      return { data, status: response.status, ok: response.ok }
    },
  })

  const payload = result[0]?.result
  if (!payload || typeof payload !== 'object') {
    throw new Error('Ozon 卖家接口未返回有效响应')
  }
  return payload as OzonboxSellerApiResponse
}

function fetchSellerAnalytics(sku: string, shopId: string, tabId?: number) {
  return fetchSellerApi(
    sku,
    shopId,
    'what-to-sell',
    'https://seller.ozon.ru/api/site/seller-analytics/what_to_sell/data/v3',
    { limit: '50', offset: '0', filter: { stock: 'any_stock', sku: String(sku) }, sort: { key: 'sum_gmv_desc' } },
    'zh-Hans',
    tabId,
  )
}

function fetchSellerVariantPackage(variantId: string, shopId: string, tabId?: number) {
  const companyId = requireOzonCompanyId(shopId)
  const normalizedVariantId = requirePositiveIntegerString(String(variantId), 'variantId')
  return fetchSellerApi(
    normalizedVariantId,
    companyId,
    undefined,
    'https://seller.ozon.ru/api/site/seller-prototype/create-bundle-by-variant-id',
    { company_id: companyId, variant_id: normalizedVariantId, source: 'SOURCE_UI_COPY_MERGED' },
    'RU',
    tabId,
  )
}

async function handleBatchSync(products: ScrapedProduct[]) {
  try {
    if (!(await isAuthenticated())) return authRequired()
    const healthy = await checkBackendHealth()
    if (!healthy) {
      return { success: false, error: '后端不可用,请检查 backend 是否运行' }
    }
    const result = await syncProducts(products)
    await updateBadge()
    return { success: true, created: result.created, skipped: result.skipped }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

async function stopScrapingInTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab?.id) return { success: false, error: '无活动标签页' }
    await browser.tabs.sendMessage(tab.id, { action: 'stopScraping' })
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function triggerListScrapeInTab(tabId?: number, maxItems = 50, scrollDelay = 1500, batchSize = 10) {
  try {
    if (!(await isAuthenticated())) return authRequired()
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    const targetId = tabId || tab?.id
    if (!targetId) return { success: false, error: '无活动标签页' }

    // ★ 关键修复:确保 content script 已注入
    const injected = await ensureContentScript(targetId, tab.url)
    if (!injected) return { success: false, error: '无法注入采集脚本,请刷新页面后重试' }

    // content script 内部会增量批量上报,background 不再做最终批量保存
    const resp = await browser.tabs.sendMessage(targetId, {
      action: 'scrapeList',
      maxItems,
      scrollDelay,
      batchSize,
    })

    return resp || { success: false, error: '采集失败' }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function getProductsForPopup(platform?: string, limit?: number) {
  if (!(await isAuthenticated())) return authRequired()
  try {
    return await fetchBackendProducts(platform, limit)
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function deleteProductForPopup(recordId: number) {
  if (!(await isAuthenticated())) return authRequired()
  try {
    await deleteBackendProduct(recordId)
    await updateBadge()
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}



async function checkCurrentPage() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return { isSupported: false }

    const url = tab.url
    const isOzon = isOzonUrl(url)
    const isWB = /wildberries\.ru/.test(url)
    const is1688 = /1688\.com/.test(url)
    const isPdd = /(yangkeduo|pinduoduo)\.com/.test(url)

    if (!isOzon && !isWB && !is1688 && !isPdd) return { isSupported: false }

    if (isOzon) {
      const isProductPage = isOzonProductUrl(url)
      const isListPage = isOzonListPage(url)
      return {
        isSupported: isProductPage || isListPage,
        platform: 'ozon',
        isProductPage,
        isListPage,
        pageType: isProductPage ? 'product' : isListPage ? 'list' : 'unknown',
        tabId: tab.id,
        url,
      }
    }

    const platform = isWB ? 'wb' : is1688 ? '1688' : 'pdd'

    // ★ 关键修复:确保 content script 已注入再检测,避免偶尔返回空
    await ensureContentScript(tab.id!, url)

    // 先发消息让 content script 检测页面类型
    try {
      const pageCheck = await browser.tabs.sendMessage(tab.id!, { action: 'checkPage' })
      return {
        isSupported: true,
        platform: pageCheck.platform || platform,
        isProductPage: pageCheck.isProductPage ?? (is1688 ? /detail\.1688\.com\/offer\//.test(url) : isPdd ? (/goods\.html/i.test(url) || /[?&](goods_id|goodsId)=\d+/.test(url)) : /\/product\//i.test(url) || /\/\d+\/?$/.test(url) || /\-\d+\/?$/.test(new URL(url).pathname)),
        isListPage: pageCheck.isListPage ?? false,
        pageType: pageCheck.pageType || 'unknown',
        tabId: tab.id,
        url,
      }
    } catch {
      // content script 未加载,用 URL 猜测
      const isProductPage = is1688 ? /detail\.1688\.com\/offer\//.test(url) : isPdd ? (/goods\.html/i.test(url) || /[?&](goods_id|goodsId)=\d+/.test(url)) : /\/product\//i.test(url) || /\/\d+\/?$/.test(url) || /\-\d+\/?$/.test(new URL(url).pathname)
      const isListPage = is1688
        ? /s\.1688\.com\/(selloffer|offer_search|company)/.test(url)
        : isPdd
          ? /(search|mall|category|list|index)/i.test(url) && !isProductPage
        : /\/(category|brand|search|seller|collection)\//i.test(url)
      return {
        isSupported: true,
        platform,
        isProductPage,
        isListPage,
        pageType: isProductPage ? 'product' : isListPage ? 'list' : 'unknown',
        tabId: tab.id,
        url,
      }
    }
  } catch {
    return { isSupported: false }
  }
}
