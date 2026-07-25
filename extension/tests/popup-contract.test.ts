import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../entrypoints/popup/App.vue', import.meta.url), 'utf8')
const ozonListPanelSource = readFileSync(
  new URL('../components/popup/OzonListPanel.vue', import.meta.url),
  'utf8',
)
const selectionRulesManagerSource = readFileSync(
  new URL('../components/popup/SelectionRulesManager.vue', import.meta.url),
  'utf8',
)
const panelToolsContractSource = readFileSync(
  new URL('../lib/ozonbox/panel-tools-contract.ts', import.meta.url),
  'utf8',
)
const globalCss = readFileSync(new URL('../assets/main.css', import.meta.url), 'utf8')
const popupHtml = readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8')

// Reference geometry and current project branding remain explicit source contracts.
assert.match(appSource, /const APP_NAME = '鲸智 AI'/)
assert.match(appSource, /src="\/brand-logo\.png"/)
assert.match(appSource, /\.popup-shell\s*\{[^}]*width:\s*320px;/)
assert.match(appSource, /\.home-view\s*\{[^}]*width:\s*320px;[^}]*padding:\s*16px;/)
assert.match(appSource, /\.brand-logo\s*\{[^}]*width:\s*60px;[^}]*height:\s*60px;[^}]*margin-bottom:\s*20px;/)
assert.match(globalCss, /html, body, #app \{ margin: 0; width: 320px; min-width: 320px; min-height: 0; \}/)
assert.match(popupHtml, /<title>鲸智 AI<\/title>/)

// Popup uses the established auth/settings contracts instead of the reference extension token model.
assert.match(appSource, /getAuthSession/)
assert.match(appSource, /saveAuthSession/)
assert.match(appSource, /clearAuthSession/)
assert.match(appSource, /settings\.erpBaseUrl/)
assert.match(appSource, /validatedErpBaseUrl\(erpBaseUrl\.value\)/)

// Generic settings only own the ERP URL and preserve unrelated settings on save.
assert.match(appSource, /type PopupView = 'home' \| 'auth' \| 'settings'/)
assert.match(appSource, /function openSettings\(\)/)
assert.match(appSource, /v-else-if="view === 'settings'"/)
assert.match(appSource, /v-model:value="erpBaseUrlDraft"/)
assert.match(appSource, /const normalizedUrl = validatedErpBaseUrl\(erpBaseUrlDraft\.value\)/)
assert.doesNotMatch(appSource, /NInputNumber/)
assert.doesNotMatch(appSource, /settings\.ozon\.maxItems/)
assert.doesNotMatch(appSource, /ozonListTargetDraft/)
assert.match(appSource, /event\.preventDefault\(\)\s+openSettings\(\)/)
assert.match(appSource, /配置插件设置/)
assert.doesNotMatch(appSource, /请先在页面内鲸智 AI 工具设置中配置 ERP Web 地址/)

// Ozon list startup owns the shared target, variant and explicitly selected-rule choices.
assert.match(appSource, /<OzonListPanel v-else-if="isOzonListPageFlag"/)
assert.match(appSource, /defineAsyncComponent/)
for (const asyncPanelImport of [
  "const OzonboxPanel = defineAsyncComponent(() => import('@/components/popup/OzonboxPanel.vue'))",
  "const OzonListPanel = defineAsyncComponent(() => import('@/components/popup/OzonListPanel.vue'))",
  "const RecordsPanel = defineAsyncComponent(() => import('@/components/popup/RecordsPanel.vue'))",
  "const ScrapePanel = defineAsyncComponent(() => import('@/components/popup/ScrapePanel.vue'))",
]) {
  assert.ok(appSource.includes(asyncPanelImport), `popup panel must be loaded asynchronously: ${asyncPanelImport}`)
}
assert.match(ozonListPanelSource, /createDefaultOzonListCrawlStartConfig\(\)/)
assert.match(ozonListPanelSource, /v-model:value="target"/)
assert.match(ozonListPanelSource, /v-model:value="collectVariants"/)
assert.match(ozonListPanelSource, /v-model:value="selectionRuleIds"/)
assert.match(ozonListPanelSource, /type: 'PANEL_SELECTION_LIST'/)
assert.match(ozonListPanelSource, /type: 'OZONBOX_LIST_CRAWL_START', config/)
assert.match(ozonListPanelSource, /请至少选择一条启用的选品规则/)
assert.match(ozonListPanelSource, /仅统计命中所选规则且成功上报的商品，默认 100。/)
assert.match(ozonListPanelSource, /默认关闭：只采集当前 SKU，不采集 SKU 变体。/)
assert.match(ozonListPanelSource, /const SelectionRulesManager = defineAsyncComponent\(\(\) => import\('\.\/SelectionRulesManager\.vue'\)\)/)
assert.match(ozonListPanelSource, /const rules = ref<PanelSelectionRule\[]>\(\[]\)/)
assert.match(ozonListPanelSource, /const enabledRules = computed\(\(\) => rules\.value\.filter\(rule => rule\.enabled\)\)/)
assert.match(ozonListPanelSource, /const enabledIds = new Set\(nextRules\.filter\(rule => rule\.enabled\)\.map\(rule => rule\.id\)\)/)
assert.match(ozonListPanelSource, /selectionRuleIds\.value = selectionRuleIds\.value\.filter\(id => enabledIds\.has\(Number\(id\)\)\)/)
assert.ok(ozonListPanelSource.includes('<SelectionRulesManager :rules="rules" :loading="rulesLoading" @update:rules="updateRules" />'))

// Complete rule CRUD is integrated below startup and persists only enabled rules.
for (const requestType of [
  'PANEL_SELECTION_CREATE',
  'PANEL_SELECTION_UPDATE',
  'PANEL_SELECTION_TOGGLE',
  'PANEL_SELECTION_DELETE',
]) {
  assert.ok(selectionRulesManagerSource.includes(`type: '${requestType}'`), `popup rule manager is missing ${requestType}`)
}
assert.ok(panelToolsContractSource.includes("export const PANEL_SELECTION_RULES_STORAGE_KEY = 'jingzhi_ai_product_selection_rules'"))
assert.ok(selectionRulesManagerSource.includes('PANEL_SELECTION_RULES_STORAGE_KEY,'))
assert.ok(selectionRulesManagerSource.includes('const enabledRules = props.rules.filter(rule => rule.enabled)'))
assert.ok(selectionRulesManagerSource.includes('await browser.storage.local.set({ [PANEL_SELECTION_RULES_STORAGE_KEY]: enabledRules })'))
assert.ok(selectionRulesManagerSource.includes('规则已创建；如需用于本次采集，请在上方主动勾选。'))
assert.ok(selectionRulesManagerSource.includes('规则已启用；本次采集仍需在上方主动勾选。'))

for (const conditionKey of [
  'soldCountMin', 'soldCountMax',
  'soldSumMin', 'soldSumMax',
  'priceMin', 'priceMax',
  'weightMin', 'weightMax',
  'listedDaysMin', 'listedDaysMax',
  'salesDynamicsMin', 'salesDynamicsMax',
  'drrMin', 'drrMax',
  'daysInPromoMin', 'daysInPromoMax',
  'discountMin', 'discountMax',
  'promoRevenueShareMin', 'promoRevenueShareMax',
  'daysWithTrafaretsMin', 'daysWithTrafaretsMax',
  'qtyViewPdpMin', 'qtyViewPdpMax',
  'convToCartPdpMin', 'convToCartPdpMax',
  'sessionCountSearchMin', 'sessionCountSearchMax',
  'convToCartSearchMin', 'convToCartSearchMax',
  'convViewToOrderMin', 'convViewToOrderMax',
  'cancelRateMin', 'cancelRateMax',
  'sellerCountMin', 'sellerCountMax',
  'minimumPriceFollowMin', 'minimumPriceFollowMax',
]) {
  assert.ok(selectionRulesManagerSource.includes(conditionKey), `popup rule manager is missing ${conditionKey}`)
}
for (const conditionContract of [
  'brandOption',
  'salesSchema',
  '<option value="__unset" disabled>',
  '<option value="">不限</option>',
  '<option value="FBO">FBO</option>',
  '<option value="FBS">FBS</option>',
]) {
  assert.ok(selectionRulesManagerSource.includes(conditionContract), `popup rule manager is missing ${conditionContract}`)
}
assert.ok(selectionRulesManagerSource.includes('function setColorEnabled(event: Event)'))
assert.ok(selectionRulesManagerSource.includes("draft.value.color = enabled ? (draft.value.color ?? '#ffffff') : undefined"))
assert.ok(selectionRulesManagerSource.includes('.range-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);'))
assert.ok(selectionRulesManagerSource.includes('.range-control { display: flex; min-width: 0;'))
assert.doesNotMatch(appSource, /设置选品/)
assert.doesNotMatch(ozonListPanelSource, /设置选品/)
assert.doesNotMatch(selectionRulesManagerSource, /设置选品/)

// Existing business entrypoints stay reachable from the compact shell.
assert.match(appSource, /<OzonboxPanel v-else-if="isOzonProductPage"/)
assert.match(appSource, /<ScrapePanel v-else \/>/)
assert.match(appSource, /<RecordsPanel v-if="view === 'records'" \/>/)

// Do not regress to copied reference branding, storage keys, or hard-coded service URLs.
assert.doesNotMatch(appSource, /毛子ERP|maozierp-token/)
assert.doesNotMatch(appSource, /https?:\/\//)

console.log('popup source contracts passed')