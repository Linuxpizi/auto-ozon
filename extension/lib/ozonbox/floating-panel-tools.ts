import {
  requirePanelToolData,
  type PanelErpRoute,
  type PanelListingDraftInput,
  type PanelListingDraftResult,
  type PanelListingPreview,
  type PanelListingSubmitResult,
  type PanelListingVariant,
  type PanelPricingContext,
  type PanelPricingRoute,
  type PanelSelectionConditions,
  type PanelSelectionRule,
  type PanelSelectionRuleInput,
  type PanelToolMode,
  type PanelToolRequest,
  type PanelToolSettings,
} from './panel-tools-contract'
import type { OzonboxCollectedProduct } from './contract'
import { validatedErpBaseUrl } from './erp-url'

const DRAWER_WIDTH_KEY = 'drawerWidth'
const LEGACY_DRAWER_WIDTH_KEY = 'jingzhi_ai_panel_pricing_drawer_width'
export const PANEL_SELECTION_RULES_STORAGE_KEY = 'jingzhi_ai_product_selection_rules'
const DEFAULT_DRAWER_WIDTH = 500
const MIN_DRAWER_WIDTH = 300
const FOLLOW_PRODUCT_ALERT_CLOSED_KEY = 'maozierp-follow-product-alert-closed'
const FOLLOW_PRODUCT_FORM_MEMORY_KEY = 'followProductFormMemory'
const OFFER_ID_RULE_KEY = 'maozierp-offerid-generation-rule'
const OFFER_ID_PREFIX_KEY = 'maozierp-offerid-custom-prefix'
const BATCH_PRICE_VALUE_KEY = 'maozierp-batch-price-value'
const BATCH_OLD_PRICE_VALUE_KEY = 'maozierp-batch-old-price-value'
const LISTING_PAGE_SIZE = 10

type ListingCurrency = NonNullable<PanelListingDraftInput['currency']>
type ListingOfferRule = 'system' | 'custom_prefix' | 'source_sku' | 'prefix_sku'
type ListingPopover = 'shops' | 'offer' | 'price' | 'old-price'
type ListingBatchMode = 'multiple' | 'fixed'

interface ListingFormMemory {
  shopIds: number[]
  brand: 'copy' | 'none'
  imageOrder: 'none' | 'shuffle' | 'main_fixed'
  followType: 'hand' | 'api'
  watermarkId: number
}

interface ListingRow extends PanelListingVariant {
  key: string
  offerId: string
  priceInput: string
  oldPriceInput: string
  customWeightG?: number
  packageLengthMm?: number
  packageWidthMm?: number
  packageHeightMm?: number
  barcode?: string
}

const LISTING_CURRENCIES: ReadonlyArray<{ label: string; value: ListingCurrency }> = [
  { label: '[¥]人民币', value: 'CNY' },
  { label: '[₽]俄罗斯卢布', value: 'RUB' },
  { label: '[$]美元', value: 'USD' },
  { label: '[€]欧元', value: 'EUR' },
  { label: '[Br]白俄罗斯卢布', value: 'BYN' },
  { label: '[₸]哈萨克斯坦坚戈', value: 'KZT' },
]

const ERP_ROUTES: Array<{ route: PanelErpRoute; label: string; description: string }> = [
  { route: '/', label: 'ERP 首页', description: '工作台与经营概览' },
  { route: '/stores', label: '店铺管理', description: '店铺凭证与连接状态' },
  { route: '/products', label: '商品管理', description: '已采集与已发布商品' },
  { route: '/selection', label: '选品中心', description: '候选商品与规则结果' },
  { route: '/upload-management', label: '上架管理', description: '草稿、任务与失败原因' },
  { route: '/intelligence', label: '鲸智分析', description: '智能分析工具' },
  { route: '/orders', label: '订单管理', description: '订单与履约状态' },
  { route: '/finances', label: '财务中心', description: '收入、成本与利润' },
  { route: '/logistics', label: '物流管理', description: '物流配置与查询' },
]

type SelectionNumberKey = Exclude<keyof PanelSelectionConditions, 'brandOption' | 'salesSchema'>

const SELECTION_CONDITION_GROUPS: Array<{
  label: string
  min: SelectionNumberKey
  max: SelectionNumberKey
  minPlaceholder: string
  maxPlaceholder: string
  precision: 0 | 2
  maxForMin?: number
  maxForMax?: number
  addonBefore?: string
  addonAfter?: string
}> = [
  { label: '月销量范围', min: 'soldCountMin', max: 'soldCountMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0 },
  { label: '月销售额范围', min: 'soldSumMin', max: 'soldSumMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, addonBefore: '¥' },
  { label: '价格范围', min: 'priceMin', max: 'priceMax', minPlaceholder: '最小价格', maxPlaceholder: '最大价格', precision: 0, addonBefore: '¥' },
  { label: '重量范围', min: 'weightMin', max: 'weightMax', minPlaceholder: '最小重量', maxPlaceholder: '最大重量', precision: 0, addonAfter: 'g' },
  { label: '上架时间', min: 'listedDaysMin', max: 'listedDaysMax', minPlaceholder: '最小天数', maxPlaceholder: '最大天数', precision: 0, addonAfter: '天' },
  { label: '月周转动态', min: 'salesDynamicsMin', max: 'salesDynamicsMax', minPlaceholder: '最小', maxPlaceholder: '最大', precision: 0, maxForMin: 100, maxForMax: 1000, addonAfter: '%' },
  { label: '广告费占比', min: 'drrMin', max: 'drrMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '参与促销天数', min: 'daysInPromoMin', max: 'daysInPromoMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, addonAfter: '天' },
  { label: '参与促销的折扣', min: 'discountMin', max: 'discountMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '促销活动的转化率', min: 'promoRevenueShareMin', max: 'promoRevenueShareMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '付费推广天数', min: 'daysWithTrafaretsMin', max: 'daysWithTrafaretsMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, addonAfter: '天' },
  { label: '商品卡浏览量', min: 'qtyViewPdpMin', max: 'qtyViewPdpMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0 },
  { label: '商品卡加购率', min: 'convToCartPdpMin', max: 'convToCartPdpMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '搜索目录浏览量', min: 'sessionCountSearchMin', max: 'sessionCountSearchMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0 },
  { label: '搜索目录加购率', min: 'convToCartSearchMin', max: 'convToCartSearchMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '展示转化率', min: 'convViewToOrderMin', max: 'convViewToOrderMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '退货取消率', min: 'cancelRateMin', max: 'cancelRateMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '跟卖人数', min: 'sellerCountMin', max: 'sellerCountMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 2000, maxForMax: 2000, addonAfter: '人' },
  { label: '跟卖最低价', min: 'minimumPriceFollowMin', max: 'minimumPriceFollowMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 2 },
]

export interface FloatingPanelToolsController {
  openListing: (options?: FloatingPanelListingOptions) => void
  openPricing: (route: PanelPricingRoute, source?: HTMLElement) => void
  openSelection: (source?: HTMLElement) => void
  openErp: (source?: HTMLElement) => void
  close: () => void
  stop: () => void
}

export interface FloatingPanelListingOptions {
  source?: HTMLElement
  product?: OzonboxCollectedProduct
}

export interface FloatingPanelToolsOptions {
  shadow: ShadowRoot
  signal: AbortSignal
  setStatus: (message: string) => void
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '面板操作失败'
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`工具界面缺少元素：${selector}`)
  return element
}

function listingCurrencyFromForm(form: FormData): ListingCurrency {
  const value = String(form.get('currency') ?? '')
  const currency = LISTING_CURRENCIES.find(option => option.value === value)?.value
  if (!currency) throw new Error(value ? '上架货币无效' : '请选择上架货币')
  return currency
}

function optionalFormNumber(form: FormData, name: string): number | undefined {
  const raw = String(form.get(name) ?? '').trim()
  if (!raw) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} 必须是不小于 0 的有效数字`)
  return value
}

function compactDate(date = new Date()): string {
  const part = (value: number): string => String(value).padStart(2, '0')
  return `${String(date.getFullYear()).slice(-2)}${part(date.getMonth() + 1)}${part(date.getDate())}${part(date.getHours())}`
}

function compactDateTime(date = new Date()): string {
  const part = (value: number): string => String(value).padStart(2, '0')
  return `${compactDate(date)}${part(date.getMinutes())}${part(date.getSeconds())}`
}

function sixRandomDigits(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

function offerIdRandom(): number {
  return Math.floor(100000 + Math.random() * 900000)
}

async function requestPanelTool<T>(request: PanelToolRequest): Promise<{ mode: PanelToolMode; data: T }> {
  return requirePanelToolData<T>(await browser.runtime.sendMessage(request))
}

function modeLabel(mode: PanelToolMode): string {
  return mode === 'mock' ? 'MOCK · 不访问后端/Ozon' : 'REAL · 真实后端'
}

export function sanitizePanelRuleColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined
}

export function panelRuleColorInputValue(value: unknown): string {
  return sanitizePanelRuleColor(value) ?? '#ffffff'
}

function plusOutlinedIconHtml(): string {
  return '<svg class="jz-button-icon" viewBox="64 64 896 896" focusable="false" aria-hidden="true" fill="currentColor"><path d="M482 152h60q8 0 8 8v704q0 8-8 8h-60q-8 0-8-8V160q0-8 8-8z"></path><path d="M192 474h672q8 0 8 8v60q0 8-8 8H160q-8 0-8-8v-60q0-8 8-8z"></path></svg>'
}

function closeOutlinedIconHtml(): string {
  return '<svg class="jz-selection-close-icon" fill-rule="evenodd" viewBox="64 64 896 896" focusable="false" aria-hidden="true" fill="currentColor"><path d="M799.86 166.31c.02 0 .04.02.08.06l57.69 57.7c.04.03.05.05.06.08a.12.12 0 010 .06c0 .03-.02.05-.06.09L569.93 512l287.7 287.7c.04.04.05.06.06.09a.12.12 0 010 .07c0 .02-.02.04-.06.08l-57.7 57.69c-.03.04-.05.05-.07.06a.12.12 0 01-.07 0c-.03 0-.05-.02-.09-.06L512 569.93l-287.7 287.7c-.04.04-.06.05-.09.06a.12.12 0 01-.07 0c-.02 0-.04-.02-.08-.06l-57.69-57.7c-.04-.03-.05-.05-.06-.07a.12.12 0 010-.07c0-.03.02-.05.06-.09L454.07 512l-287.7-287.7c-.04-.04-.05-.06-.06-.09a.12.12 0 010-.07c0-.02.02-.04.06-.08l57.7-57.69c.03-.04.05-.05.07-.06a.12.12 0 01.07 0c.03 0 .05.02.09.06L512 454.07l287.7-287.7c.04-.04.06-.05.09-.06a.12.12 0 01.07 0z"></path></svg>'
}

function infoCircleOutlinedIconHtml(): string {
  return '<svg class="jz-priority-info-icon" viewBox="64 64 896 896" focusable="false" aria-hidden="true" fill="currentColor"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"></path><path d="M464 336a48 48 0 1096 0 48 48 0 10-96 0zm72 112h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8V456c0-4.4-3.6-8-8-8z"></path></svg>'
}

function selectionColorClearButtonHtml(): string {
  return '<button class="jz-button small text jz-selection-color-clear" type="button" data-action="selection-color-clear">清除</button>'
}

function toolStyles(): string {
  return `<style id="jingzhi-panel-tools-style">
    .jz-tools,.jz-tools *{box-sizing:border-box}
    .jz-tools{position:fixed;inset:0;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:#20242c;pointer-events:auto}
    .jz-tools[hidden]{display:none!important}
    .jz-tools-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.46);backdrop-filter:blur(2px)}
    .jz-surface{position:absolute;top:50%;left:50%;display:flex;width:min(880px,calc(100vw - 48px));max-height:calc(100vh - 48px);transform:translate(-50%,-50%);flex-direction:column;overflow:hidden;border:1px solid #eef0f3;border-radius:16px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.32)}
    .jz-surface.drawer{top:0;right:0;bottom:0;left:auto;width:500px;max-height:none;transform:none;border-width:0 0 0 1px;border-radius:0}
    .jz-tools.listing-open .jz-tools-backdrop{background:#00000073;backdrop-filter:none}
    .jz-surface.listing{width:70%;max-width:none;padding:20px 24px;border:0;border-radius:8px;background:#fff;box-shadow:0 6px 16px #00000014,0 3px 6px -4px #0000001f,0 9px 28px 8px #0000000d;color:#000000e0}
    .jz-surface.listing .jz-head{position:static;align-items:center;margin-bottom:8px;padding:0;border:0;background:#fff}.jz-surface.listing .jz-title{margin:0;color:#000000e0;font-size:16px;font-weight:600;line-height:1.5}.jz-surface.listing .jz-subtitle,.jz-surface.listing .jz-mode,.jz-surface.listing [data-action="settings"]{display:none}
    .jz-surface.listing .jz-head-actions [data-action="close"]{position:absolute;top:17px;right:17px;z-index:1010;display:block;width:22px;min-width:22px;height:22px;padding:0;border:0;border-radius:4px;background:transparent;color:#00000073;font-weight:600;line-height:22px;cursor:pointer;transition:color .2s,background-color .2s}.jz-surface.listing .jz-head-actions [data-action="close"]:hover{background:#0000000f;color:#000000e0}.jz-surface.listing .jz-close-text{display:none}.jz-surface.listing .jz-selection-close-icon{display:block}
    .jz-surface.listing .jz-body{padding:0;overflow:hidden}
    .jz-tools.selection-open{overflow:auto}.jz-tools.selection-open .jz-tools-backdrop{position:fixed;background:#00000073;backdrop-filter:none}
    .jz-surface.selection{top:100px;width:900px;max-width:calc(100vw - 32px);max-height:none;padding:20px 24px;transform:translateX(-50%);overflow:visible;border:0;border-radius:8px;background:#fff;box-shadow:0 6px 16px #00000014,0 3px 6px -4px #0000001f,0 9px 28px 8px #0000000d;color:#000000e0;font-size:14px;line-height:1.5714285714285714}
    .jz-surface.selection .jz-head{position:static;align-items:center;margin-bottom:8px;padding:0;border:0;background:#fff}.jz-surface.selection .jz-title{color:#000000e0;font-size:16px;font-weight:600;line-height:1.5}.jz-surface.selection .jz-subtitle,.jz-surface.selection .jz-mode,.jz-surface.selection [data-action="settings"]{display:none}
    .jz-surface.selection .jz-head-actions [data-action="close"]{position:absolute;top:17px;right:17px;z-index:1010;display:block;width:22px;min-width:22px;height:22px;padding:0;border:0;border-radius:4px;background:transparent;color:#00000073;font-weight:600;line-height:22px;cursor:pointer;transition:color .2s,background-color .2s}.jz-surface.selection .jz-head-actions [data-action="close"]:hover{background:#0000000f;color:#000000e0}.jz-surface.selection .jz-close-text{display:none}.jz-selection-close-icon{display:none;width:1em;height:1em;margin:auto;font-size:16px}.jz-surface.selection .jz-selection-close-icon,.jz-selection-editor .jz-selection-close-icon{display:block}
    .jz-surface.selection .jz-body{padding:0;overflow:hidden}
    .jz-surface.drawer .jz-head{padding:16px 20px;background:#fff}.jz-surface.drawer .jz-subtitle,.jz-surface.drawer .jz-mode,.jz-surface.drawer [data-action="settings"]{display:none}
    .jz-surface.drawer .jz-body{height:100%;min-height:0;padding:0;overflow:hidden}
    .jz-drawer-layout{display:flex;width:100%;height:100%;overflow:hidden}
    .jz-resize{display:flex;width:8px;height:100%;align-items:center;justify-content:center;flex-shrink:0;background:#f0f0f0;cursor:col-resize;touch-action:none;transition:background-color .2s}
    .jz-resize:hover{background:#e0e0e0}.jz-resize-dots{display:flex;flex-direction:column;gap:4px}.jz-resize-dots span{display:block;width:3px;height:3px;border-radius:50%;background:#999}
    .jz-drawer-content{height:100%;min-width:0;flex:1;overflow:hidden}.jz-pricing-frame{display:block;width:100%;height:100%;border:0;background:#fff}.jz-pricing-frame.disable-pointer{pointer-events:none}
    .jz-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:1px solid #edf0f3;background:linear-gradient(135deg,#fff 30%,#fff5f5)}
    .jz-head-main{min-width:0}.jz-title{margin:0;color:#172033;font-size:19px;font-weight:750;line-height:1.35}.jz-subtitle{margin:4px 0 0;color:#697386;font-size:12px;line-height:1.45}
    .jz-head-actions{display:flex;align-items:center;gap:8px}.jz-mode{display:inline-flex;align-items:center;min-height:26px;padding:3px 9px;border-radius:999px;background:#fff1f2;color:#be123c;font-size:11px;font-weight:700;white-space:nowrap}.jz-mode.real{background:#ecfdf5;color:#047857}
    .jz-icon-button{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 8px;border:1px solid #dfe3e8;border-radius:8px;background:#fff;color:#4b5563;cursor:pointer}.jz-icon-button:hover{background:#f8fafc}
    .jz-body{min-height:180px;padding:20px;overflow:auto}.jz-body[aria-busy="true"]{cursor:progress}
    .jz-loading{display:grid;place-items:center;min-height:220px;color:#697386;font-size:14px}.jz-spinner{width:28px;height:28px;margin-bottom:12px;border:3px solid #fee2e2;border-top-color:#ee131b;border-radius:50%;animation:jz-spin .8s linear infinite}@keyframes jz-spin{to{transform:rotate(360deg)}}
    .jz-alert{margin:0 0 16px;padding:11px 13px;border:1px solid #fecaca;border-radius:10px;background:#fff1f2;color:#b42318;font-size:13px;line-height:1.55}.jz-alert.info{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8}.jz-alert.success{border-color:#bbf7d0;background:#f0fdf4;color:#15803d}.jz-alert.warning{border-color:#fde68a;background:#fffbeb;color:#a16207}
    .jz-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.jz-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.jz-field{display:flex;min-width:0;flex-direction:column;gap:6px}.jz-field.wide{grid-column:1/-1}.jz-label{color:#46505f;font-size:12px;font-weight:650}.jz-hint{color:#8a94a3;font-size:11px;line-height:1.4}
    .jz-input,.jz-select,.jz-textarea{width:100%;min-height:36px;padding:7px 10px;border:1px solid #d7dce2;border-radius:8px;background:#fff;color:#20242c;font:inherit;font-size:13px;outline:none}.jz-textarea{min-height:68px;resize:vertical}.jz-input:focus,.jz-select:focus,.jz-textarea:focus{border-color:#1677ff;box-shadow:0 0 0 3px rgba(22,119,255,.12)}
    .jz-check{display:flex;align-items:flex-start;gap:8px;color:#46505f;font-size:12px;line-height:1.45}.jz-check input{margin-top:2px;accent-color:#1677ff}
    .jz-section{margin-top:18px;padding-top:18px;border-top:1px solid #edf0f3}.jz-section:first-child{margin-top:0;padding-top:0;border-top:0}.jz-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;color:#293241;font-size:14px;font-weight:750}
    .jz-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;margin-top:20px}.jz-button{min-height:36px;padding:7px 14px;border:1px solid #d7dce2;border-radius:8px;background:#fff;color:#3f4650;font:inherit;font-size:13px;font-weight:650;cursor:pointer}.jz-button:hover{background:#f8fafc}.jz-button.primary{border-color:#1677ff;background:#1677ff;color:#fff}.jz-button.primary:hover{background:#0958d9}.jz-button.danger{border-color:#ee131b;background:#ee131b;color:#fff}.jz-button.link{min-height:auto;padding:2px 4px;border:0;background:transparent;color:#1677ff}.jz-button:disabled{cursor:not-allowed;opacity:.55}
    .jz-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.jz-metric{padding:12px;border:1px solid #e8ebef;border-radius:11px;background:#fafbfc}.jz-metric-label{color:#737e8e;font-size:11px}.jz-metric-value{margin-top:4px;color:#182230;font-size:18px;font-weight:750}.jz-metric-value.positive{color:#15803d}.jz-metric-value.negative{color:#dc2626}
    .jz-table-wrap{overflow:auto;border:1px solid #e4e8ed;border-radius:10px}.jz-table{width:100%;border-collapse:collapse;font-size:12px}.jz-table th,.jz-table td{padding:9px;border-bottom:1px solid #edf0f3;text-align:left;vertical-align:top}.jz-table th{background:#f8fafc;color:#5d6878;font-weight:700;white-space:nowrap}.jz-table tr:last-child td{border-bottom:0}.jz-table .jz-input,.jz-table .jz-textarea{min-width:90px}.jz-table .jz-textarea{min-width:220px;min-height:56px}
    .jz-product{display:flex;gap:14px}.jz-product-image{width:88px;height:88px;flex:0 0 auto;border:1px solid #edf0f3;border-radius:10px;object-fit:contain}.jz-product-title{margin:2px 0 5px;color:#202938;font-size:15px;font-weight:700;line-height:1.45}.jz-muted{color:#7c8797;font-size:12px;line-height:1.5;word-break:break-word}
    .jz-listing-main{display:flex;max-height:calc(100vh - 96px);min-height:520px;flex-direction:column;color:#000000e0;font-size:14px;line-height:1.5714285714285714}.jz-listing-content{min-height:0;flex:1;padding-top:8px;overflow:auto}.jz-listing-alert{position:relative;display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;padding:8px 38px 8px 12px;border:1px solid #eae6ff;border-radius:8px;background:#f4f0ff;color:#000000e0;font-size:14px}.jz-listing-alert-icon{color:#7166f0}.jz-listing-alert-close{position:absolute;top:6px;right:8px;border:0;background:transparent;color:#00000073;font-size:16px;cursor:pointer}.jz-listing-form-row,.jz-listing-source-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 16px}.jz-listing-form-item{display:flex;align-items:center;gap:8px;margin-bottom:10px;white-space:nowrap}.jz-listing-form-item>span:first-child{font-weight:400}.jz-listing-form-item.required>span:first-child::before{margin-right:4px;color:#ff4d4f;content:"*"}.jz-listing-form-item .jz-select,.jz-listing-form-item .jz-input{min-height:32px;padding:4px 11px;border-color:#d9d9d9;border-radius:6px}.jz-listing-form-item .short{width:120px}.jz-listing-form-item .model{width:160px}.jz-listing-form-item .floating{width:150px}.jz-listing-help{display:inline-grid;width:16px;height:16px;place-items:center;border-radius:50%;color:#8c8c8c;font-size:12px;cursor:help}.jz-listing-random{margin-left:-8px;padding:0;border:0;background:transparent;color:#1677ff;font-size:16px;cursor:pointer}.jz-listing-shop-select{position:relative;min-width:200px}.jz-listing-shop-trigger{display:flex;width:100%;min-height:32px;align-items:center;gap:4px;padding:3px 28px 3px 8px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#000000e0;text-align:left;cursor:pointer}.jz-listing-shop-trigger::after{position:absolute;right:10px;color:#00000040;content:"▾"}.jz-listing-placeholder{color:#bfbfbf}.jz-listing-tag{display:inline-block;max-width:92px;padding:0 4px;overflow:hidden;border-radius:4px;background:#f5f5f5;text-overflow:ellipsis;white-space:nowrap}.jz-listing-shop-popover{top:36px;left:0;width:280px}.jz-listing-shop-search{margin-bottom:8px}.jz-listing-shop-options{max-height:220px;overflow:auto}.jz-listing-shop-option{display:flex!important;align-items:flex-start;gap:8px;margin:0!important;padding:6px;border-radius:4px;white-space:normal}.jz-listing-shop-option:hover{background:#f5f5f5}.jz-listing-shop-option.disabled{color:#00000040}.jz-listing-shop-option small{display:block;color:#ff4d4f}.jz-listing-table-wrap{width:100%;max-height:500px;margin:10px 0;overflow:auto;border-top:1px solid #f0f0f0;border-left:1px solid #f0f0f0}.jz-listing-table{min-width:1720px;width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}.jz-listing-table th,.jz-listing-table td{padding:8px;border-right:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;color:#000000e0;text-align:center;vertical-align:middle}.jz-listing-table th{background:#fafafa;font-weight:600}.jz-listing-table tbody tr:hover td{background:#fafafa}.jz-listing-table .jz-input{min-height:32px;padding:4px 7px;border-color:#d9d9d9;border-radius:6px}.jz-listing-table .jz-input.invalid{border-color:#ff4d4f;box-shadow:0 0 0 2px #ff4d4f1a}.jz-listing-cover{width:40px;height:40px;object-fit:contain;cursor:zoom-in}.jz-listing-ellipsis{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jz-listing-dimensions{display:flex;align-items:center;gap:4px}.jz-listing-dimensions .jz-input{width:55px;min-width:55px}.jz-listing-link{padding:0;border:0;background:transparent;color:#1677ff;text-decoration:none;cursor:pointer}.jz-listing-link.dangerous{color:#ff4d4f}.jz-listing-header-action{margin-left:5px;padding:0;border:0;background:transparent;color:#1677ff;font-size:12px;font-weight:400;cursor:pointer}.jz-listing-selection{display:flex;align-items:center;gap:8px;margin:8px 0}.jz-listing-pagination{display:flex;justify-content:center;gap:6px;margin:10px 0 0}.jz-listing-pagination button{min-width:32px;height:32px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;cursor:pointer}.jz-listing-pagination button.active{border-color:#1677ff;color:#1677ff}.jz-listing-source-row{margin-top:10px}.jz-listing-source-row .remark{width:300px}.jz-listing-result{min-height:22px}.jz-listing-result .jz-alert{margin:4px 0 10px}.jz-listing-footer{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:16px;margin-top:12px;background:#fff;text-align:end}.jz-listing-footer-actions{display:flex;align-items:center;justify-content:flex-end;gap:16px}.jz-listing-footer-control{display:flex;align-items:center;gap:8px;white-space:nowrap}.jz-listing-footer-control.currency{margin-right:15px}.jz-listing-footer-control .jz-select{width:180px;min-height:32px;border-color:#d9d9d9;border-radius:6px}.jz-listing-switch-input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.jz-listing-switch{position:relative;display:inline-flex;min-width:44px;height:22px;align-items:center;justify-content:flex-end;padding:0 9px 0 24px;border-radius:100px;background:#00000040;color:#fff;font-size:12px;cursor:pointer}.jz-listing-switch::before{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:9px;background:#fff;box-shadow:0 2px 4px #00230b33;content:"";transition:all .2s}.jz-listing-switch .on{display:none}.jz-listing-switch-input:checked+.jz-listing-switch{justify-content:flex-start;padding:0 24px 0 9px;background:#1677ff}.jz-listing-switch-input:checked+.jz-listing-switch::before{left:calc(100% - 20px)}.jz-listing-switch-input:checked+.jz-listing-switch .on{display:inline}.jz-listing-switch-input:checked+.jz-listing-switch .off{display:none}.jz-surface.listing .jz-button{height:32px;min-height:32px;padding:4px 15px;border-color:#d9d9d9;border-radius:6px;font-size:14px;font-weight:400}.jz-surface.listing .jz-button.primary{border-color:#1677ff;background:#1677ff}.jz-listing-popover{position:absolute;top:28px;right:0;z-index:3;width:270px;padding:12px;border-radius:8px;background:#fff;box-shadow:0 6px 16px #00000014,0 3px 6px -4px #0000001f,0 9px 28px 8px #0000000d;text-align:left}.jz-listing-popover label{display:block;margin:8px 0}.jz-listing-popover-actions{text-align:right}.jz-listing-relative{position:relative}
    .jz-selection-main{display:flex;flex-direction:column}.jz-selection-content{padding:16px 0}.jz-selection-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.jz-selection-count{color:oklch(.446 .03 256.802);font-size:14px;line-height:20px}.jz-selection-create{display:flex!important;align-items:center;justify-content:center;gap:8px}.jz-button-icon{width:1em;height:1em;font-size:14px}.jz-surface.selection .jz-button,.jz-selection-editor .jz-button{height:32px;min-height:0;padding:4px 15px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#000000e0;font-size:14px;font-weight:400;line-height:1.5714285714285714}.jz-surface.selection .jz-button.primary,.jz-selection-editor .jz-button.primary{border-color:#1677ff;background:#1677ff;color:#fff}.jz-surface.selection .jz-button.primary:hover,.jz-selection-editor .jz-button.primary:hover{border-color:#4096ff;background:#4096ff}.jz-surface.selection .jz-button.small,.jz-selection-editor .jz-button.small{height:24px;padding:0 7px;border-radius:4px}.jz-surface.selection .jz-button.link{border-color:transparent;background:transparent;color:#1677ff}.jz-surface.selection .jz-button.link:hover{color:#69b1ff}.jz-surface.selection .jz-button.link:active{color:#0958d9}.jz-surface.selection .jz-button.link.dangerous{color:#ff4d4f}.jz-surface.selection .jz-button.link.dangerous:hover{color:#ff7875}.jz-surface.selection .jz-button.link.dangerous:active{color:#d9363e}
    .jz-selection-table-wrap{overflow:visible;border-top:1px solid #f0f0f0;border-inline-start:1px solid #f0f0f0}.jz-selection-table{width:100%;border-collapse:collapse;table-layout:fixed;color:#000000e0;font-size:14px;line-height:1.5714285714285714}.jz-selection-table th,.jz-selection-table td{position:relative;padding:8px;border-inline-end:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;overflow-wrap:break-word;text-align:start;vertical-align:middle}.jz-selection-table th{background:#fafafa;color:#000000e0;font-weight:600}.jz-selection-table .center{text-align:center}.jz-selection-table tbody tr:hover>td{background:#fafafa}.jz-selection-table tbody tr:has(.jz-selection-empty):hover>td{background:#fff}.jz-selection-empty{padding:48px 16px!important;color:#00000040;text-align:center!important}.jz-selection-tag{display:inline-flex;max-width:100%;align-items:center;padding:1px 7px;border:1px solid #d9d9d9;border-radius:4px;background:#fafafa;color:#595959;line-height:20px;white-space:nowrap}.jz-selection-tag.colored{border-color:transparent;color:#fff}.jz-selection-actions{display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap}.jz-selection-switch{position:relative;display:inline-block;min-width:44px;height:22px;padding:0;border:0;border-radius:100px;background:#00000040;color:#fff;line-height:22px;cursor:pointer;transition:all .2s}.jz-selection-switch:hover{background:#00000073}.jz-selection-switch.on{background:#1677ff}.jz-selection-switch.on:hover{background:#4096ff}.jz-selection-switch-handle{position:absolute;top:2px;left:2px;width:18px;height:18px;transition:all .2s}.jz-selection-switch-handle::before{position:absolute;inset:0;border-radius:9px;background:#fff;box-shadow:0 2px 4px #00230b33;content:""}.jz-selection-switch.on .jz-selection-switch-handle{left:calc(100% - 20px)}.jz-selection-switch-inner{display:block;height:100%;padding-right:9px;padding-left:24px;overflow:hidden;border-radius:100px;transition:padding .2s}.jz-selection-switch.on .jz-selection-switch-inner{padding-right:24px;padding-left:9px}.jz-selection-switch-inner>span{display:block;color:#fff;font-size:12px;white-space:nowrap}.jz-selection-footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:12px}.jz-selection-popover{position:absolute;top:42px;right:8px;z-index:1060;width:max-content;max-width:calc(100vw - 32px);padding:12px;border-radius:8px;background:#fff;box-shadow:0 6px 16px #00000014,0 3px 6px -4px #0000001f,0 9px 28px 8px #0000000d;color:#000000e0;text-align:left;white-space:normal}.jz-selection-popover-message{position:relative;display:flex;align-items:flex-start;margin-bottom:8px;color:#000000e0;font-size:14px}.jz-selection-popover-title{font-size:14px;font-weight:600}.jz-selection-popover-desc{margin-left:22px;margin-bottom:8px;color:#000000e0;font-size:14px}.jz-selection-popover-actions{text-align:end}.jz-selection-popover-actions .jz-button{margin-left:8px}.jz-selection-action-cell{position:relative}
    .jz-selection-layer{position:fixed;inset:0;z-index:4;overflow:auto}.jz-selection-editor-mask{position:fixed;inset:0;background:#00000073}.jz-selection-editor{position:relative;width:600px;max-width:calc(100vw - 32px);margin:100px auto 24px;padding:20px 24px;border:0;border-radius:8px;background:#fff;box-shadow:0 6px 16px #00000014,0 3px 6px -4px #0000001f,0 9px 28px 8px #0000000d;color:#000000e0;font-size:14px;line-height:1.5714285714285714}.jz-selection-editor-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.jz-selection-editor-title{margin:0;color:#000000e0;font-size:16px;font-weight:600;line-height:1.5}.jz-selection-editor-close{position:absolute;top:17px;right:17px;z-index:1010;width:22px;min-width:22px;height:22px;padding:0;border:0;border-radius:4px;background:transparent;color:#00000073;font-weight:600;line-height:22px;cursor:pointer;transition:color .2s,background-color .2s}.jz-selection-editor-close:hover{background:#0000000f;color:#000000e0}.jz-selection-editor-body{max-height:70vh;padding:16px 0;overflow-y:auto}.jz-selection-editor-footer{display:flex;justify-content:flex-end;gap:12px;margin-top:12px}.jz-selection-form-error{margin-bottom:16px;padding:8px 12px;border:1px solid #ffccc7;border-radius:6px;background:#fff2f0;color:#cf1322;font-size:12px;line-height:1.5}.jz-form-item{display:grid;grid-template-columns:25% minmax(0,75%);align-items:start;margin-bottom:18px}.jz-form-label{padding:7px 12px 0 0;color:#000000e0;font-size:14px;text-align:right;line-height:1.4;white-space:normal}.jz-form-label.required::before{margin-right:4px;color:#ff4d4f;content:"*"}.jz-form-control{position:relative;min-width:0}.jz-form-control.width-80{width:80%}.jz-count{position:absolute;top:9px;right:8px;color:#bfbfbf;font-size:10px;pointer-events:none}.jz-input.with-count{padding-right:48px}.jz-priority-row{display:flex;align-items:center}.jz-priority-row .jz-input{width:100px}.jz-priority-help{margin-top:4px}.jz-priority-tooltip{display:inline-flex;align-items:center;color:#00000073;font-size:12px;line-height:1.4;cursor:help}.jz-priority-info-icon{width:1em;height:1em;margin-left:4px;color:#999;font-size:12px}.jz-color-row{display:flex;align-items:center;gap:12px}.jz-color-input{width:48px;height:32px;padding:0;border:1px solid oklch(.872 .01 258.338);border-radius:4px;background:#fff;cursor:pointer}.jz-color-text{min-width:72px;color:oklch(.551 .027 264.364);font-size:14px}.jz-selection-editor .jz-button.text{border-color:transparent;background:transparent}.jz-selection-editor .jz-selection-color-clear{color:oklch(.707 .022 261.325)}.jz-selection-editor .jz-selection-color-clear:hover{color:oklch(.637 .237 25.331)}.jz-radio-group{display:flex;flex-wrap:wrap;gap:18px;padding-top:7px}.jz-radio{display:inline-flex;align-items:center;gap:6px;color:#000000e0;font-size:14px}.jz-radio input{accent-color:#1677ff}.jz-condition-row{display:grid;grid-template-columns:minmax(0,1fr) 14px minmax(0,1fr);align-items:center;gap:6px}.jz-condition-sep{text-align:center;color:#8c8c8c}.jz-number-wrap{display:flex;min-width:0}.jz-number-wrap .jz-input{min-width:0;border-radius:6px}.jz-number-wrap.has-before .jz-input{border-radius:0 6px 6px 0}.jz-number-wrap.has-after .jz-input{border-radius:6px 0 0 6px}.jz-number-addon{display:inline-flex;flex:0 0 auto;align-items:center;padding:0 9px;border:1px solid #d9d9d9;background:#fafafa;color:#595959;font-size:12px}.jz-number-addon.before{border-right:0;border-radius:6px 0 0 6px}.jz-number-addon.after{border-left:0;border-radius:0 6px 6px 0}.jz-schema-select{width:120px}
    .jz-route-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.jz-route{padding:12px;border:1px solid #e1e6ec;border-radius:10px;background:#fff;text-align:left;cursor:pointer}.jz-route:hover{border-color:#1677ff;background:#f5f9ff}.jz-route strong{display:block;color:#273243;font-size:13px}.jz-route span{display:block;margin-top:4px;color:#7d8795;font-size:11px;line-height:1.4}
    .jz-confirm{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:12px;border:1px solid #fca5a5;border-radius:10px;background:#fff7f7;color:#9f1239;font-size:12px;line-height:1.45}
    .jz-button:focus-visible,.jz-icon-button:focus-visible,.jz-input:focus-visible,.jz-select:focus-visible,.jz-textarea:focus-visible,.jz-route:focus-visible{outline:3px solid rgba(22,119,255,.24);outline-offset:2px}
    @media(max-width:720px){.jz-surface,.jz-surface.listing{width:calc(100vw - 24px);max-height:calc(100vh - 24px)}.jz-grid,.jz-grid.three,.jz-metrics,.jz-route-grid{grid-template-columns:1fr}.jz-product{align-items:flex-start}.jz-head{padding:14px}.jz-body{padding:14px}.jz-mode{display:none}.jz-surface.listing .jz-body{padding:0}.jz-listing-content{padding:14px}.jz-listing-footer{align-items:flex-end;padding:12px 14px}.jz-listing-footer-actions{flex-wrap:wrap}.jz-listing-footer-control .jz-select{width:150px}}
  </style>`
}

export function createFloatingPanelTools(options: FloatingPanelToolsOptions): FloatingPanelToolsController {
  const { shadow, signal, setStatus } = options
  shadow.querySelector('#jingzhi-panel-tools-style')?.remove()
  shadow.querySelector('#jingzhi-panel-tools-root')?.remove()
  const styleTemplate = document.createElement('template')
  styleTemplate.innerHTML = toolStyles()
  shadow.append(styleTemplate.content)
  const root = document.createElement('div')
  root.id = 'jingzhi-panel-tools-root'
  root.className = 'jz-tools'
  root.hidden = true
  root.innerHTML = `<div class="jz-tools-backdrop" data-action="close"></div>
    <section class="jz-surface" role="dialog" aria-modal="true" aria-labelledby="jz-tool-title" aria-describedby="jz-tool-subtitle">
      <header class="jz-head">
        <div class="jz-head-main"><h2 class="jz-title" id="jz-tool-title">鲸智 AI</h2><p class="jz-subtitle" id="jz-tool-subtitle"></p></div>
        <div class="jz-head-actions"><span class="jz-mode" data-mode>加载中</span><button class="jz-icon-button" type="button" data-action="settings" aria-label="模式与 ERP 设置">设置</button><button class="jz-icon-button" type="button" data-action="close" aria-label="关闭"><span class="jz-close-text">✕</span>${closeOutlinedIconHtml()}</button></div>
      </header>
      <div class="jz-body" data-body aria-live="polite"></div>
    </section>`
  shadow.append(root)

  const surface = required<HTMLElement>(root, '.jz-surface')
  const title = required<HTMLElement>(root, '#jz-tool-title')
  const subtitle = required<HTMLElement>(root, '#jz-tool-subtitle')
  const modeBadge = required<HTMLElement>(root, '[data-mode]')
  const body = required<HTMLElement>(root, '[data-body]')
  let stopped = false
  let sequence = 0
  let currentMode: PanelToolMode = 'mock'
  let returnFocus: HTMLElement | null = null
  let listingPreview: PanelListingPreview | undefined
  let listingDraft: PanelListingDraftResult | undefined
  let listingProduct: OzonboxCollectedProduct | undefined
  let listingRows: ListingRow[] = []
  let listingPage = 1
  let listingFormMemory: ListingFormMemory = { shopIds: [], brand: 'none', imageOrder: 'none', followType: 'hand', watermarkId: 0 }
  let listingOfferRule: ListingOfferRule = 'system'
  let listingOfferPrefix = 'mz'
  let listingBatchPriceValue = '.95'
  let listingBatchOldPriceValue = '2'
  let listingAlertVisible = true
  let listingSelectedRowKeys = new Set<string>()
  let listingPopover: ListingPopover | undefined
  let listingBatchPriceMode: ListingBatchMode = 'multiple'
  let listingBatchOldPriceMode: ListingBatchMode = 'multiple'
  let listingBatchFixedPrice = ''
  let listingBatchFixedOldPrice = ''
  let listingModelId = ''
  let listingFloatingPrice = ''
  let listingSourcePrice = ''
  let listingSourceUrlNote = ''
  let listingSourceRemark = ''
  let listingCurrency = ''
  let listingShowAllSku = false
  let listingResultHtml = ''
  let selectionRules: PanelSelectionRule[] = []
  let selectionEditorOpen = false
  let editingRule: PanelSelectionRule | undefined
  let selectionEditorReturnFocus: HTMLElement | null = null
  let deletingRuleId: number | undefined
  let resizing = false
  let resizeStartX = 0
  let resizeStartWidth = DEFAULT_DRAWER_WIDTH

  const updateModeBadge = (mode: PanelToolMode): void => {
    currentMode = mode
    modeBadge.textContent = modeLabel(mode)
    modeBadge.classList.toggle('real', mode === 'real')
  }

  const setHeader = (heading: string, description: string, drawer = false, selection = false, listing = false): void => {
    title.textContent = heading
    subtitle.textContent = description
    surface.classList.toggle('drawer', drawer)
    surface.classList.toggle('selection', selection)
    surface.classList.toggle('listing', listing)
    root.classList.toggle('selection-open', selection)
    root.classList.toggle('listing-open', listing)
    if (!selection) {
      selectionEditorOpen = false
      editingRule = undefined
      selectionEditorReturnFocus = null
      root.querySelector('[data-selection-layer]')?.remove()
    }
    if (!drawer) surface.style.removeProperty('width')
  }

  const showLoading = (message: string): void => {
    body.setAttribute('aria-busy', 'true')
    body.innerHTML = `<div class="jz-loading"><div><div class="jz-spinner" aria-hidden="true"></div>${escapeHtml(message)}</div></div>`
  }

  const showError = (message: string): void => {
    body.setAttribute('aria-busy', 'false')
    body.innerHTML = `<div class="jz-alert" role="alert">${escapeHtml(message)}</div><div class="jz-actions"><button class="jz-button" type="button" data-action="close">关闭</button></div>`
    setStatus(message)
  }

  const open = (source?: HTMLElement): number => {
    sequence += 1
    listingProduct = undefined
    if (root.hidden) {
      returnFocus = source ?? (shadow.activeElement instanceof HTMLElement ? shadow.activeElement : null)
    }
    root.hidden = false
    return sequence
  }

  const isCurrent = (token: number): boolean => !stopped && token === sequence && !root.hidden && root.isConnected

  const close = (): void => {
    if (root.hidden) return
    sequence += 1
    listingProduct = undefined
    resizing = false
    selectionEditorOpen = false
    editingRule = undefined
    selectionEditorReturnFocus = null
    root.querySelector('[data-selection-layer]')?.remove()
    body.querySelector('.jz-pricing-frame')?.classList.remove('disable-pointer')
    root.hidden = true
    body.innerHTML = ''
    const focus = returnFocus
    returnFocus = null
    if (focus?.isConnected) focus.focus()
  }

  const loadSettings = async (token: number): Promise<PanelToolSettings> => {
    const response = await requestPanelTool<PanelToolSettings>({ type: 'PANEL_SETTINGS_GET' })
    if (isCurrent(token)) updateModeBadge(response.mode)
    return response.data
  }

  const applyDrawerWidth = (width: number): void => {
    surface.style.width = `${Math.max(MIN_DRAWER_WIDTH, width)}px`
  }

  const restoreDrawerWidth = async (token: number): Promise<void> => {
    const stored = await browser.storage.local.get([DRAWER_WIDTH_KEY, LEGACY_DRAWER_WIDTH_KEY])
    const referenceWidth = Number.parseInt(String(stored[DRAWER_WIDTH_KEY] ?? ''), 10)
    const legacyWidth = Number.parseInt(String(stored[LEGACY_DRAWER_WIDTH_KEY] ?? ''), 10)
    const width = Number.isFinite(referenceWidth)
      ? referenceWidth
      : Number.isFinite(legacyWidth) ? legacyWidth : DEFAULT_DRAWER_WIDTH
    if (isCurrent(token) && surface.classList.contains('drawer')) {
      applyDrawerWidth(width)
      if (!Number.isFinite(referenceWidth) && Number.isFinite(legacyWidth)) {
        await browser.storage.local.set({ [DRAWER_WIDTH_KEY]: String(legacyWidth) })
      }
    }
  }

  const pricingFrameUrl = (erpBaseUrl: string, route: PanelPricingRoute, context: PanelPricingContext): string => {
    const params = new URLSearchParams({
      sell_price: String(context.sellPrice),
      package_weight: String(context.packageWeight),
      package_length: String(context.packageLength),
      package_width: String(context.packageWidth),
      package_height: String(context.packageHeight),
      rfbs_rate: JSON.stringify(context.rfbsRate),
      category_ids: JSON.stringify(context.categoryIds),
    })
    return `${validatedErpBaseUrl(erpBaseUrl)}#/${route}?${params.toString()}`
  }

  const openPricing = (route: PanelPricingRoute, source?: HTMLElement): void => {
    const token = open(source)
    setHeader('定价工具&利润计算器', '', true)
    showLoading('正在读取当前商品事实...')
    void Promise.all([
      requestPanelTool<PanelToolSettings>({ type: 'PANEL_SETTINGS_GET' }),
      requestPanelTool<PanelPricingContext>({ type: 'PANEL_PRICING_CONTEXT', route }),
      restoreDrawerWidth(token),
    ]).then(([settingsResponse, contextResponse]) => {
      if (!isCurrent(token)) return
      updateModeBadge(contextResponse.mode)
      const iframeUrl = pricingFrameUrl(settingsResponse.data.erpBaseUrl, route, contextResponse.data)
      body.setAttribute('aria-busy', 'false')
      body.innerHTML = `<div class="jz-drawer-layout"><div class="jz-resize" data-resize role="separator" aria-label="调整抽屉宽度" aria-orientation="vertical"><div class="jz-resize-dots" aria-hidden="true"><span></span><span></span><span></span></div></div><div class="jz-drawer-content"><iframe class="jz-pricing-frame" src="${escapeHtml(iframeUrl)}" title="定价工具&利润计算器" frameborder="0" allow="fullscreen"></iframe></div></div>`
      required<HTMLIFrameElement>(body, '.jz-pricing-frame').focus()
    }).catch((error: unknown) => {
      if (isCurrent(token)) showError(errorMessage(error))
    })
  }

  const listingPageCount = (): number => Math.max(1, Math.ceil(listingRows.length / LISTING_PAGE_SIZE))

  const listingStoreLabel = (store: PanelListingPreview['stores'][number]): string => store.currency
    ? `[${store.currency}] ${store.name}`
    : store.name

  const persistListingMemory = (): void => {
    void browser.storage.local.set({ [FOLLOW_PRODUCT_FORM_MEMORY_KEY]: listingFormMemory })
  }

  const showListingResult = (message: string, kind: 'success' | 'error' = 'success'): void => {
    listingResultHtml = `<div class="jz-alert ${kind === 'success' ? 'success' : ''}" role="${kind === 'success' ? 'status' : 'alert'}">${escapeHtml(message)}</div>`
    const target = body.querySelector<HTMLElement>('[data-listing-result]')
    if (target) target.innerHTML = listingResultHtml
    setStatus(message)
  }

  const listingCapturedNumber = (element: HTMLInputElement | null): number | undefined => {
    const raw = element?.value.trim() ?? ''
    if (!raw) return undefined
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : undefined
  }

  const captureListingFormState = (): void => {
    const formElement = body.querySelector<HTMLFormElement>('form[data-form="listing"]')
    if (!formElement) return
    const form = new FormData(formElement)
    const shopIds = form.getAll('shopIds').map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0)
    const brand = form.get('brand')
    const imageOrder = form.get('imageOrder')
    const followType = form.get('followType')
    listingFormMemory = {
      shopIds,
      brand: brand === 'copy' ? 'copy' : 'none',
      imageOrder: imageOrder === 'shuffle' || imageOrder === 'main_fixed' ? imageOrder : 'none',
      followType: followType === 'api' ? 'api' : 'hand',
      watermarkId: Number(form.get('watermarkId')) === 0 ? 0 : listingFormMemory.watermarkId,
    }
    listingModelId = String(form.get('modelId') ?? '').trim()
    listingFloatingPrice = String(form.get('floatingPrice') ?? '').trim()
    listingSourcePrice = String(form.get('sourcePrice') ?? '').trim()
    listingSourceUrlNote = String(form.get('sourceUrlNote') ?? '').trim()
    listingSourceRemark = String(form.get('sourceRemark') ?? '').trim()
    const currency = String(form.get('currency') ?? '')
    listingCurrency = LISTING_CURRENCIES.some(option => option.value === currency) ? currency : ''
    listingShowAllSku = form.has('showAllSku')
    formElement.querySelectorAll<HTMLElement>('[data-listing-row]').forEach(rowElement => {
      const key = rowElement.dataset.listingRow
      const row = listingRows.find(item => item.key === key)
      if (!row) return
      row.offerId = rowElement.querySelector<HTMLInputElement>('[data-field="offerId"]')?.value.trim() ?? row.offerId
      row.priceInput = rowElement.querySelector<HTMLInputElement>('[data-field="priceRub"]')?.value.trim() ?? row.priceInput
      row.oldPriceInput = rowElement.querySelector<HTMLInputElement>('[data-field="oldPriceRub"]')?.value.trim() ?? row.oldPriceInput
      row.customWeightG = listingCapturedNumber(rowElement.querySelector<HTMLInputElement>('[data-field="customWeightG"]'))
      row.packageLengthMm = listingCapturedNumber(rowElement.querySelector<HTMLInputElement>('[data-field="packageLengthMm"]'))
      row.packageWidthMm = listingCapturedNumber(rowElement.querySelector<HTMLInputElement>('[data-field="packageWidthMm"]'))
      row.packageHeightMm = listingCapturedNumber(rowElement.querySelector<HTMLInputElement>('[data-field="packageHeightMm"]'))
      row.barcode = rowElement.querySelector<HTMLInputElement>('[data-field="barcode"]')?.value.trim() || undefined
    })
  }

  const listingPopoverHtml = (): string => {
    if (listingPopover === 'offer') return `<div class="jz-listing-popover" role="dialog" aria-label="货号生成设置"><strong>货号生成设置</strong><label>生成规则：<select class="jz-select" name="offerRule"><option value="system" ${listingOfferRule === 'system' ? 'selected' : ''}>系统默认</option><option value="custom_prefix" ${listingOfferRule === 'custom_prefix' ? 'selected' : ''}>自定义前缀</option><option value="source_sku" ${listingOfferRule === 'source_sku' ? 'selected' : ''}>源SKU+随机数</option><option value="prefix_sku" ${listingOfferRule === 'prefix_sku' ? 'selected' : ''}>自定义前缀+源SKU</option></select></label>${listingOfferRule === 'custom_prefix' || listingOfferRule === 'prefix_sku' ? `<label>自定义前缀：<input class="jz-input" name="offerPrefix" placeholder="请输入前缀" value="${escapeHtml(listingOfferPrefix)}"></label>` : ''}<div class="jz-listing-popover-actions"><button class="jz-button" type="button" data-action="listing-popover-close">取消</button> <button class="jz-button primary" type="button" data-action="listing-offer-apply">确定</button></div></div>`
    if (listingPopover === 'price') return `<div class="jz-listing-popover" role="dialog" aria-label="批量设置售价"><strong>批量设置售价</strong><label><input name="batchPriceMode" type="radio" value="multiple" ${listingBatchPriceMode === 'multiple' ? 'checked' : ''}> 原售价倍数</label><label><input name="batchPriceMode" type="radio" value="fixed" ${listingBatchPriceMode === 'fixed' ? 'checked' : ''}> 固定金额</label><input class="jz-input" name="batchPriceValue" placeholder="${listingBatchPriceMode === 'multiple' ? '请输入倍数，如1.2' : '请输入固定售价'}" value="${escapeHtml(listingBatchPriceMode === 'multiple' ? listingBatchPriceValue : listingBatchFixedPrice)}"><div class="jz-listing-popover-actions"><button class="jz-button" type="button" data-action="listing-popover-close">取消</button> <button class="jz-button primary" type="button" data-action="listing-price-apply">应用</button></div></div>`
    if (listingPopover === 'old-price') return `<div class="jz-listing-popover" role="dialog" aria-label="批量设置划线价"><strong>批量设置划线价</strong><label><input name="batchOldPriceMode" type="radio" value="multiple" ${listingBatchOldPriceMode === 'multiple' ? 'checked' : ''}> 原售价倍数</label><label><input name="batchOldPriceMode" type="radio" value="fixed" ${listingBatchOldPriceMode === 'fixed' ? 'checked' : ''}> 固定金额</label><input class="jz-input" name="batchOldPriceValue" placeholder="${listingBatchOldPriceMode === 'multiple' ? '请输入倍数，如1.2' : '请输入固定划线价'}" value="${escapeHtml(listingBatchOldPriceMode === 'multiple' ? listingBatchOldPriceValue : listingBatchFixedOldPrice)}"><div class="jz-listing-popover-actions"><button class="jz-button" type="button" data-action="listing-popover-close">取消</button> <button class="jz-button primary" type="button" data-action="listing-old-price-apply">应用</button></div></div>`
    return ''
  }

  const listingRowsHtml = (): string => {
    const pageStart = (listingPage - 1) * LISTING_PAGE_SIZE
    return listingRows.slice(pageStart, pageStart + LISTING_PAGE_SIZE).map((row, pageIndex) => `<tr data-listing-row="${escapeHtml(row.key)}">
      <td><input type="checkbox" data-listing-select="${escapeHtml(row.key)}" aria-label="选择 ${escapeHtml(row.sku)}" ${listingSelectedRowKeys.has(row.key) ? 'checked' : ''}></td>
      <td>${pageStart + pageIndex + 1}</td>
      <td>${row.images[0] ? `<img class="jz-listing-cover" src="${escapeHtml(row.images[0])}" alt="${escapeHtml(row.name)}">` : ''}</td>
      <td><span class="jz-listing-ellipsis" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span></td>
      <td><a class="jz-listing-link jz-listing-ellipsis" href="https://www.ozon.ru/product/${encodeURIComponent(row.sku)}" target="_blank" rel="noopener noreferrer" title="查看详情">${escapeHtml(row.sku)}</a></td>
      <td><input class="jz-input" data-field="offerId" value="${escapeHtml(row.offerId)}" required aria-label="货号"></td>
      <td>${row.originalPrice ?? row.priceRub}</td>
      <td><input class="jz-input" data-field="priceRub" type="number" min="1" step="0.01" value="${escapeHtml(row.priceInput)}" required aria-label="我的售价"></td>
      <td><input class="jz-input" data-field="oldPriceRub" type="number" min="0" step="0.01" value="${escapeHtml(row.oldPriceInput)}" required aria-label="我的划线价"></td>
      <td><input class="jz-input" data-field="customWeightG" type="number" min="0" step="1" placeholder="可不填" value="${row.customWeightG ?? ''}"></td>
      <td><div class="jz-listing-dimensions"><input class="jz-input" data-field="packageLengthMm" type="number" min="0" step="1" value="${row.packageLengthMm ?? ''}" aria-label="长"><span>×</span><input class="jz-input" data-field="packageWidthMm" type="number" min="0" step="1" value="${row.packageWidthMm ?? ''}" aria-label="宽"><span>×</span><input class="jz-input" data-field="packageHeightMm" type="number" min="0" step="1" value="${row.packageHeightMm ?? ''}" aria-label="高"></div></td>
      <td><input class="jz-input" style="width:120px" data-field="barcode" value="${escapeHtml(row.barcode ?? '')}"></td>
      <td><button class="jz-listing-link dangerous" type="button" data-action="listing-row-delete" data-key="${escapeHtml(row.key)}">删除</button></td>
    </tr>`).join('')
  }

  const listingPaginationHtml = (): string => {
    const pageCount = listingPageCount()
    if (pageCount <= 1) return ''
    return `<nav class="jz-listing-pagination" aria-label="变体分页">${Array.from({ length: pageCount }, (_, index) => index + 1).map(page => `<button class="${page === listingPage ? 'active' : ''}" type="button" data-action="listing-page" data-page="${page}" aria-current="${page === listingPage ? 'page' : 'false'}">${page}</button>`).join('')}</nav>`
  }

  const listingShopSelectHtml = (preview: PanelListingPreview): string => {
    const selected = preview.stores.filter(store => listingFormMemory.shopIds.includes(store.id))
    const tags = selected.slice(0, 3).map(store => `<span class="jz-listing-tag" title="${escapeHtml(listingStoreLabel(store))}">${escapeHtml(listingStoreLabel(store))}</span>`).join('')
    return `<div class="jz-listing-shop-select">
      <button class="jz-listing-shop-trigger" type="button" data-action="listing-shops-toggle" aria-haspopup="listbox" aria-expanded="${listingPopover === 'shops'}">${tags || '<span class="jz-listing-placeholder">请选择店铺</span>'}${selected.length > 3 ? `<span class="jz-listing-tag">+${selected.length - 3}</span>` : ''}</button>
      ${preview.stores.map(store => `<input type="checkbox" name="shopIds" value="${store.id}" ${listingFormMemory.shopIds.includes(store.id) ? 'checked' : ''} hidden>`).join('')}
      ${listingPopover === 'shops' ? `<div class="jz-listing-popover jz-listing-shop-popover" role="listbox" aria-label="选择店铺"><input class="jz-input jz-listing-shop-search" name="shopSearch" placeholder="搜索店铺"><div class="jz-listing-shop-options">${preview.stores.map(store => `<label class="jz-listing-shop-option${store.usable ? '' : ' disabled'}" data-shop-option data-shop-search="${escapeHtml(listingStoreLabel(store).toLowerCase())}"><input type="checkbox" data-listing-shop-id="${store.id}" ${listingFormMemory.shopIds.includes(store.id) ? 'checked' : ''} ${store.usable ? '' : 'disabled'}><span>${escapeHtml(listingStoreLabel(store))}${store.reason ? `<small>${escapeHtml(store.reason)}</small>` : ''}</span></label>`).join('')}</div><div class="jz-listing-popover-actions"><button class="jz-button primary" type="button" data-action="listing-shops-done">确定</button></div></div>` : ''}
    </div>`
  }

  const renderListingForm = (preview: PanelListingPreview): void => {
    const usableStores = preview.stores.filter(store => store.usable)
    listingPage = Math.min(listingPage, listingPageCount())
    body.setAttribute('aria-busy', 'false')
    body.innerHTML = `<div class="jz-listing-main"><div class="jz-listing-content"><form id="jz-listing-form" data-form="listing" novalidate>
      ${listingAlertVisible ? '<div class="jz-listing-alert" role="alert"><span class="jz-listing-alert-icon" aria-hidden="true">ⓘ</span><span>注意：请先选择上架货币，再批量设置价格，如果你选择了多个店铺，请确保所选的店铺货币一致，最终上架货币以店铺设置为准。表格左侧的勾选框只做批量删除变体用途。</span><button class="jz-listing-alert-close" type="button" data-action="listing-alert-close" aria-label="关闭提示">×</button></div>' : ''}
      <div class="jz-listing-form-row">
        <div class="jz-listing-form-item required"><span>选择店铺</span>${listingShopSelectHtml(preview)}</div>
        <label class="jz-listing-form-item required"><span>品牌</span><select class="jz-select short" name="brand"><option value="copy" ${listingFormMemory.brand === 'copy' ? 'selected' : ''}>复制当前品牌</option><option value="none" ${listingFormMemory.brand === 'none' ? 'selected' : ''}>无品牌</option></select></label>
        <label class="jz-listing-form-item required"><span>图片顺序</span><select class="jz-select short" name="imageOrder"><option value="none" ${listingFormMemory.imageOrder === 'none' ? 'selected' : ''}>不处理</option><option value="shuffle" ${listingFormMemory.imageOrder === 'shuffle' ? 'selected' : ''}>随机打乱</option><option value="main_fixed" ${listingFormMemory.imageOrder === 'main_fixed' ? 'selected' : ''}>主图不变,其余打乱</option></select></label>
        <label class="jz-listing-form-item required"><span>上架方式</span><select class="jz-select short" name="followType"><option value="hand" ${listingFormMemory.followType === 'hand' ? 'selected' : ''}>防侵权跟卖</option><option value="api" ${listingFormMemory.followType === 'api' ? 'selected' : ''}>强制跟卖</option></select><span class="jz-listing-help" title="防侵权跟卖：系统会模拟人工手动上架产品，降低下架风险。强制跟卖：1:1复制当前商品卡片，有一定的概率会报错和被下架">?</span></label>
        <label class="jz-listing-form-item"><span>水印</span><select class="jz-select short" name="watermarkId"><option value="0" selected>不使用</option></select><span class="jz-listing-help" title="如果店铺有绑定水印则此处设置无效">?</span></label>
        <label class="jz-listing-form-item"><span>合并变体</span><input class="jz-input model" name="modelId" placeholder="选填:型号名称" value="${escapeHtml(listingModelId)}"><button class="jz-listing-random" type="button" data-action="listing-model-random" title="随机生成型号名称" aria-label="随机生成型号名称">⟳</button><span class="jz-listing-help" title="不填保留默认，如果填写了型号名称则按填写的型号合并变体">?</span></label>
        <label class="jz-listing-form-item"><span>浮动价格</span><span class="jz-number-wrap has-before"><span class="jz-number-addon before">${escapeHtml(LISTING_CURRENCIES.find(option => option.value === listingCurrency)?.label.match(/^\[[^\]]+\]/)?.[0] ?? '¤')}</span><input class="jz-input floating" name="floatingPrice" type="number" min="0" step="1" placeholder="选填:浮动加价上限" value="${escapeHtml(listingFloatingPrice)}"></span><span class="jz-listing-help" title="如若填写则在每个店铺随机0至所填写数字中随机加价,请填写整数,例：填写1，则会随机在0.00和0.99之间加价">?</span></label>
      </div>
      ${usableStores.length ? '' : '<div class="jz-alert">没有可用店铺。REAL 模式请先在 ERP 配置店铺；MOCK 模式应提供固定演示店铺。</div>'}
      <div class="jz-listing-selection"><button class="jz-button" type="button" data-action="listing-select-all">全选</button><button class="jz-button" type="button" data-action="listing-select-invert">反选</button><button class="jz-button" type="button" data-action="listing-delete-selected">删除所选</button></div>
      <div class="jz-listing-table-wrap"><table class="jz-listing-table"><colgroup><col style="width:60px"><col style="width:60px"><col style="width:100px"><col style="width:150px"><col style="width:120px"><col style="width:200px"><col style="width:100px"><col style="width:130px"><col style="width:130px"><col style="width:110px"><col style="width:220px"><col style="width:150px"><col style="width:80px"></colgroup><thead><tr><th></th><th>序号</th><th>主图</th><th>变体</th><th>SKU</th><th class="jz-listing-relative">货号<button class="jz-listing-header-action" type="button" data-action="listing-popover" data-popover="offer">批量生成</button>${listingPopover === 'offer' ? listingPopoverHtml() : ''}</th><th>原售价</th><th class="jz-listing-relative">我的售价<button class="jz-listing-header-action" type="button" data-action="listing-popover" data-popover="price">批量设置</button>${listingPopover === 'price' ? listingPopoverHtml() : ''}</th><th class="jz-listing-relative">我的划线价<button class="jz-listing-header-action" type="button" data-action="listing-popover" data-popover="old-price">批量设置</button>${listingPopover === 'old-price' ? listingPopoverHtml() : ''}</th><th>自定义重量(g)<button class="jz-listing-header-action" type="button" data-action="listing-weight-first">同首行</button></th><th>包装尺寸(mm)(选填)<button class="jz-listing-header-action" type="button" data-action="listing-dimensions-first">同首行</button></th><th>条形码(FBP)(选填)<button class="jz-listing-header-action" type="button" data-action="listing-barcode-generate">一键生成</button></th><th>操作</th></tr></thead><tbody>${listingRowsHtml()}</tbody></table></div>
      ${listingPaginationHtml()}
      <div class="jz-listing-source-row"><label class="jz-listing-form-item"><span>货源价格</span><input class="jz-input" name="sourcePrice" type="number" min="0" step="0.01" placeholder="选填" value="${escapeHtml(listingSourcePrice)}"></label><label class="jz-listing-form-item"><span>货源链接</span><input class="jz-input" name="sourceUrlNote" type="url" value="${escapeHtml(listingSourceUrlNote)}"></label><label class="jz-listing-form-item"><span>货源备注</span><input class="jz-input remark" name="sourceRemark" value="${escapeHtml(listingSourceRemark)}"></label></div>
      <div class="jz-listing-result" data-listing-result>${listingResultHtml}</div>
    </form></div><footer class="jz-listing-footer"><span></span><div class="jz-listing-footer-actions">
      <label class="jz-listing-footer-control"><span>显示所有SKU：</span><input class="jz-listing-switch-input" name="showAllSku" type="checkbox" form="jz-listing-form" ${listingShowAllSku ? 'checked' : ''}><span class="jz-listing-switch" aria-hidden="true"><span class="on">是</span><span class="off">否</span></span></label>
      <label class="jz-listing-footer-control currency"><span>上架货币：</span><select class="jz-select" name="currency" form="jz-listing-form" required><option value="">选择币种</option>${LISTING_CURRENCIES.map(option => `<option value="${option.value}" ${listingCurrency === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>
      <div><button class="jz-button primary" type="submit" form="jz-listing-form" ${usableStores.length ? '' : 'disabled'}>一键上架至OZON</button> <button class="jz-button" type="button" data-action="listing-cancel">取消</button></div>
    </div></footer></div>`
  }

  const listingInputFromForm = (formElement: HTMLFormElement): PanelListingDraftInput => {
    if (!listingPreview) throw new Error('商品预览已失效，请重新打开一键上架')
    const preview = listingPreview
    const form = new FormData(formElement)
    captureListingFormState()
    const invalid = (row: ListingRow, index: number, field: string, message: string): never => {
      let activeForm = formElement
      let rowElement = activeForm.querySelector<HTMLElement>(`[data-listing-row="${CSS.escape(row.key)}"]`)
      if (!rowElement) {
        listingPage = Math.floor(index / LISTING_PAGE_SIZE) + 1
        listingPopover = undefined
        renderListingForm(preview)
        activeForm = required<HTMLFormElement>(body, 'form[data-form="listing"]')
        rowElement = required<HTMLElement>(activeForm, `[data-listing-row="${CSS.escape(row.key)}"]`)
      }
      const element = required<HTMLInputElement>(rowElement, `[data-field="${field}"]`)
      element.classList.add('invalid')
      element.focus()
      throw new Error(message)
    }
    if (!listingRows.length) throw new Error('至少保留一条数据')
    listingRows.forEach((row, index) => {
      const priceValue = Number(row.priceInput)
      const oldPriceValue = Number(row.oldPriceInput)
      const rowLabel = `第 ${index + 1} 行（SKU ${row.sku}）`
      if (!row.offerId.trim()) invalid(row, index, 'offerId', `${rowLabel}货号不能为空`)
      if (!row.priceInput || !Number.isFinite(priceValue) || priceValue < 1) invalid(row, index, 'priceRub', `${rowLabel}售价不能为空`)
      if (!row.oldPriceInput || !Number.isFinite(oldPriceValue) || oldPriceValue < 0) invalid(row, index, 'oldPriceRub', `${rowLabel}请输入有效的划线价`)
      if (oldPriceValue <= priceValue) invalid(row, index, 'oldPriceRub', `${rowLabel}划线价必须大于售价`)
      row.priceRub = priceValue
      row.oldPriceRub = oldPriceValue
    })
    const shopIds = form.getAll('shopIds').map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0)
    const usableStoreIds = new Set(listingPreview.stores.filter(store => store.usable).map(store => store.id))
    if (!shopIds.length) throw new Error('请选择店铺')
    if (shopIds.some(id => !usableStoreIds.has(id))) throw new Error('所选店铺已不可用，请重新选择')
    if (!listingPreview.descriptionCategoryId || !listingPreview.typeId) throw new Error('当前商品缺少可用分类信息')
    const floatingPrice = optionalFormNumber(form, 'floatingPrice')
    if (floatingPrice !== undefined && !Number.isInteger(floatingPrice)) throw new Error('浮动价格请填写整数')
    const variants: PanelListingVariant[] = listingRows.map(row => ({
      sku: row.sku,
      name: row.name,
      priceRub: row.priceRub,
      oldPriceRub: row.oldPriceRub,
      images: [...row.images],
      selected: true,
      offerId: row.offerId,
      originalPrice: row.originalPrice,
      customWeightG: row.customWeightG,
      packageLengthMm: row.packageLengthMm,
      packageWidthMm: row.packageWidthMm,
      packageHeightMm: row.packageHeightMm,
      barcode: row.barcode,
    }))
    persistListingMemory()
    return {
      storeId: shopIds[0],
      productId: listingPreview.productId,
      sourceUrl: listingPreview.sourceUrl,
      title: listingPreview.title,
      brand: listingFormMemory.brand === 'copy' ? listingPreview.brand : undefined,
      offerId: variants[0].offerId ?? '',
      descriptionCategoryId: listingPreview.descriptionCategoryId,
      typeId: listingPreview.typeId,
      categoryName: '',
      variants,
      followSourceImages: true,
      watermarkEnabled: listingFormMemory.watermarkId > 0,
      randomizeImages: listingFormMemory.imageOrder !== 'none',
      modelImagesEnabled: Boolean(listingModelId),
      floatingPriceEnabled: floatingPrice !== undefined,
      shopIds,
      currency: listingCurrencyFromForm(form),
      brandMode: listingFormMemory.brand,
      imageOrder: listingFormMemory.imageOrder,
      followType: listingFormMemory.followType,
      watermarkId: listingFormMemory.watermarkId,
      modelId: listingModelId || undefined,
      floatingPrice,
      sourcePrice: listingSourcePrice || undefined,
      sourceUrlNote: listingSourceUrlNote || undefined,
      sourceRemark: listingSourceRemark || undefined,
      showAllSku: listingShowAllSku,
    }
  }

  const restoreListingState = async (token: number, preview: PanelListingPreview): Promise<void> => {
    const stored = await browser.storage.local.get([
      FOLLOW_PRODUCT_ALERT_CLOSED_KEY,
      FOLLOW_PRODUCT_FORM_MEMORY_KEY,
      OFFER_ID_RULE_KEY,
      OFFER_ID_PREFIX_KEY,
      BATCH_PRICE_VALUE_KEY,
      BATCH_OLD_PRICE_VALUE_KEY,
    ])
    if (!isCurrent(token)) return
    const usableStoreIds = new Set(preview.stores.filter(store => store.usable).map(store => store.id))
    const memory = stored[FOLLOW_PRODUCT_FORM_MEMORY_KEY]
    if (memory && typeof memory === 'object') {
      const candidate = memory as Partial<ListingFormMemory>
      listingFormMemory = {
        shopIds: Array.isArray(candidate.shopIds) ? candidate.shopIds.filter(id => Number.isInteger(id) && usableStoreIds.has(id)) : [],
        brand: candidate.brand === 'copy' ? 'copy' : 'none',
        imageOrder: candidate.imageOrder === 'shuffle' || candidate.imageOrder === 'main_fixed' ? candidate.imageOrder : 'none',
        followType: candidate.followType === 'api' ? 'api' : 'hand',
        watermarkId: 0,
      }
    } else {
      listingFormMemory = { shopIds: [], brand: 'none', imageOrder: 'none', followType: 'hand', watermarkId: 0 }
    }
    const storedRule = stored[OFFER_ID_RULE_KEY]
    listingOfferRule = storedRule === 'custom_prefix' || storedRule === 'source_sku' || storedRule === 'prefix_sku' ? storedRule : 'system'
    const storedPrefix = typeof stored[OFFER_ID_PREFIX_KEY] === 'string' ? stored[OFFER_ID_PREFIX_KEY].trim() : ''
    listingOfferPrefix = storedPrefix || 'mz'
    const storedBatchPrice = typeof stored[BATCH_PRICE_VALUE_KEY] === 'string' ? stored[BATCH_PRICE_VALUE_KEY].trim() : ''
    const storedBatchOldPrice = typeof stored[BATCH_OLD_PRICE_VALUE_KEY] === 'string' ? stored[BATCH_OLD_PRICE_VALUE_KEY].trim() : ''
    listingBatchPriceValue = storedBatchPrice || '.95'
    listingBatchOldPriceValue = storedBatchOldPrice || '2'
    listingAlertVisible = stored[FOLLOW_PRODUCT_ALERT_CLOSED_KEY] !== true
    listingRows = preview.variants.map((variant, index) => ({
      ...variant,
      key: `${variant.sku}-${index}`,
      offerId: variant.offerId?.trim() || `${compactDate()}${sixRandomDigits()}`,
      priceInput: String(variant.priceRub),
      oldPriceInput: String(variant.oldPriceRub),
      originalPrice: variant.originalPrice ?? variant.priceRub,
      selected: true,
    }))
    listingPage = 1
    listingSelectedRowKeys = new Set<string>()
    listingPopover = undefined
    listingModelId = ''
    listingFloatingPrice = ''
    listingSourcePrice = ''
    listingSourceUrlNote = ''
    listingSourceRemark = ''
    listingCurrency = ''
    listingShowAllSku = false
    listingResultHtml = ''
  }

  const renderListingDraft = (result: PanelListingDraftResult): void => {
    const target = required<HTMLElement>(body, '[data-listing-result]')
    target.innerHTML = `<section class="jz-section"><div class="jz-alert success"><strong>草稿 #${result.draftId} 已创建</strong><br>状态：${escapeHtml(result.status)} · Offer ID：${escapeHtml(result.offerId)} · 已选 ${result.selectedVariantCount} 个变体</div>${result.warnings.map(warning => `<div class="jz-alert warning">${escapeHtml(warning)}</div>`).join('')}<div class="jz-actions"><button class="jz-button danger" type="button" data-action="listing-confirm">下一步：确认提交${currentMode === 'mock' ? '模拟' : '到 Ozon'}</button></div><div data-submit-confirm></div></section>`
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const openListing = (options: FloatingPanelListingOptions = {}): void => {
    const token = open(options.source)
    listingProduct = options.product
    listingPreview = undefined
    listingDraft = undefined
    setHeader('一键上架到OZON', '', false, false, true)
    showLoading('正在读取当前商品与店铺...')
    const previewRequest: PanelToolRequest = listingProduct
      ? { type: 'PANEL_LISTING_PREVIEW', product: listingProduct }
      : { type: 'PANEL_LISTING_PREVIEW' }
    void Promise.all([loadSettings(token), requestPanelTool<PanelListingPreview>(previewRequest)]).then(async ([, response]) => {
      if (!isCurrent(token)) return
      updateModeBadge(response.mode)
      listingPreview = response.data
      await restoreListingState(token, response.data)
      if (!isCurrent(token)) return
      renderListingForm(response.data)
      required<HTMLButtonElement>(body, '[data-action="listing-shops-toggle"]').focus()
    }).catch((error: unknown) => {
      if (isCurrent(token)) showError(errorMessage(error))
    })
  }

  const formatSelectionUpdatedAt = (value: string): string => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
  }

  const selectionNumberInputHtml = (
    name: SelectionNumberKey,
    value: number | undefined,
    placeholder: string,
    precision: 0 | 2,
    maximum: number | undefined,
    addonBefore?: string,
    addonAfter?: string,
  ): string => `<span class="jz-number-wrap${addonBefore ? ' has-before' : ''}${addonAfter ? ' has-after' : ''}">
    ${addonBefore ? `<span class="jz-number-addon before">${escapeHtml(addonBefore)}</span>` : ''}
    <input class="jz-input" name="${name}" type="number" min="0" ${maximum === undefined ? '' : `max="${maximum}"`} step="${precision === 0 ? '1' : '0.01'}" placeholder="${escapeHtml(placeholder)}" value="${value ?? ''}">
    ${addonAfter ? `<span class="jz-number-addon after">${escapeHtml(addonAfter)}</span>` : ''}
  </span>`

  const selectionConditionItemHtml = (group: (typeof SELECTION_CONDITION_GROUPS)[number], conditions: PanelSelectionConditions): string => `<div class="jz-form-item">
    <label class="jz-form-label">${escapeHtml(group.label)}</label>
    <div class="jz-form-control"><div class="jz-condition-row">
      ${selectionNumberInputHtml(group.min, conditions[group.min], group.minPlaceholder, group.precision, group.maxForMin, group.addonBefore, group.addonAfter)}
      <span class="jz-condition-sep">-</span>
      ${selectionNumberInputHtml(group.max, conditions[group.max], group.maxPlaceholder, group.precision, group.maxForMax, group.addonBefore, group.addonAfter)}
    </div></div>
  </div>`

  const selectionSchemaItemHtml = (conditions: PanelSelectionConditions): string => `<div class="jz-form-item">
    <label class="jz-form-label" for="jz-selection-sales-schema">发货模式</label>
    <div class="jz-form-control"><select class="jz-select jz-schema-select" id="jz-selection-sales-schema" name="salesSchema">
      <option value="__unset" ${conditions.salesSchema === undefined ? 'selected' : ''} disabled>请选择发货模式</option>
      <option value="" ${conditions.salesSchema === '' ? 'selected' : ''}>不限</option>
      <option value="FBO" ${conditions.salesSchema === 'FBO' ? 'selected' : ''}>FBO</option>
      <option value="FBS" ${conditions.salesSchema === 'FBS' ? 'selected' : ''}>FBS</option>
    </select></div>
  </div>`

  const selectionEditorFormHtml = (rule?: PanelSelectionRule): string => {
    const conditions: PanelSelectionConditions = rule?.conditions ?? { brandOption: 2 }
    const color = sanitizePanelRuleColor(rule?.color)
    const conditionItems = SELECTION_CONDITION_GROUPS.map(group => `${selectionConditionItemHtml(group, conditions)}${group.max === 'convViewToOrderMax' ? selectionSchemaItemHtml(conditions) : ''}`).join('')
    return `<form data-form="selection-rule" data-rule-id="${rule?.id ?? ''}" novalidate>
      <div class="jz-selection-form-error" data-selection-form-error role="alert" hidden></div>
      <div class="jz-form-item"><label class="jz-form-label required" for="jz-selection-name">规则名称</label><div class="jz-form-control width-80"><input class="jz-input with-count" id="jz-selection-name" name="name" maxlength="15" placeholder="请输入规则名称" value="${escapeHtml(rule?.name ?? '')}" required><span class="jz-count" data-count-for="name">${rule?.name.length ?? 0}/15</span></div></div>
      <div class="jz-form-item"><label class="jz-form-label required" for="jz-selection-tag">标签名称</label><div class="jz-form-control width-80"><input class="jz-input with-count" id="jz-selection-tag" name="tag" maxlength="6" placeholder="请输入标签名称，将在卡片中显示" value="${escapeHtml(rule?.tag ?? '')}" required><span class="jz-count" data-count-for="tag">${rule?.tag.length ?? 0}/6</span></div></div>
      <div class="jz-form-item"><label class="jz-form-label" for="jz-selection-sort">优先级</label><div class="jz-form-control"><div class="jz-priority-row"><input class="jz-input" id="jz-selection-sort" name="sort" type="number" min="0" max="100" step="1" placeholder="请输入优先级" value="${rule?.sort ?? 0}"></div><div class="jz-priority-help"><span class="jz-priority-tooltip" tabindex="0" title="注：这里优先级的意思是指当应用了多条规则时，&#10;卡片背景颜色以优先级高的规则为准。&#10;如果不理解请保持默认即可" aria-label="注：这里优先级的意思是指当应用了多条规则时，卡片背景颜色以优先级高的规则为准。如果不理解请保持默认即可"><span>数值越大优先匹配</span>${infoCircleOutlinedIconHtml()}</span></div></div></div>
      <div class="jz-form-item"><span class="jz-form-label">卡片背景颜色</span><div class="jz-form-control"><div class="jz-color-row"><input name="colorSet" type="hidden" value="${color ? '1' : '0'}"><input class="jz-color-input" name="color" type="color" value="${panelRuleColorInputValue(color)}" title="选择卡片背景颜色" aria-label="卡片背景颜色"><span class="jz-color-text" data-selection-color-text>${escapeHtml(color ?? '不设置')}</span>${color ? selectionColorClearButtonHtml() : ''}</div></div></div>
      <div class="jz-form-item"><span class="jz-form-label">是否自动收藏</span><div class="jz-form-control"><div class="jz-radio-group"><label class="jz-radio"><input name="autoFavorite" type="radio" value="1" ${rule?.autoFavorite ? 'checked' : ''}>是</label><label class="jz-radio"><input name="autoFavorite" type="radio" value="0" ${rule?.autoFavorite ? '' : 'checked'}>否</label></div></div></div>
      <div class="jz-form-item"><span class="jz-form-label">品牌选项</span><div class="jz-form-control"><div class="jz-radio-group"><label class="jz-radio"><input name="brandOption" type="radio" value="1" ${conditions.brandOption === 1 ? 'checked' : ''}>有品牌</label><label class="jz-radio"><input name="brandOption" type="radio" value="0" ${conditions.brandOption === 0 ? 'checked' : ''}>无品牌</label><label class="jz-radio"><input name="brandOption" type="radio" value="2" ${conditions.brandOption === 2 ? 'checked' : ''}>不限</label></div></div></div>
      ${conditionItems}
    </form>`
  }

  const renderSelection = (): void => {
    body.setAttribute('aria-busy', 'false')
    body.innerHTML = `<div class="jz-selection-main"><div class="jz-selection-content"><div data-selection-main-error></div><div class="jz-selection-toolbar"><span class="jz-selection-count">共 ${selectionRules.length} 条规则</span><button class="jz-button primary jz-selection-create" type="button" data-action="selection-create">${plusOutlinedIconHtml()}<span>新增规则</span></button></div><div class="jz-selection-table-wrap"><table class="jz-selection-table"><colgroup><col style="width:200px"><col style="width:120px"><col style="width:120px"><col style="width:120px"><col style="width:100px"><col style="width:150px"><col style="width:150px"></colgroup><thead><tr><th>规则名称</th><th class="center">标签</th><th class="center">自动收藏</th><th class="center">是否启用</th><th class="center">优先级</th><th class="center">更新时间</th><th class="center">操作</th></tr></thead><tbody>${selectionRules.length ? selectionRules.map(rule => {
      const color = sanitizePanelRuleColor(rule.color)
      return `<tr><td>${escapeHtml(rule.name)}</td><td class="center"><span class="jz-selection-tag${color ? ' colored' : ''}" ${color ? `style="background:${color}"` : ''}>${escapeHtml(rule.tag)}</span></td><td class="center">${rule.autoFavorite ? '是' : '否'}</td><td class="center"><button class="jz-selection-switch${rule.enabled ? ' on' : ''}" type="button" role="switch" aria-checked="${rule.enabled}" data-action="selection-toggle" data-id="${rule.id}" data-enabled="${!rule.enabled}"><span class="jz-selection-switch-handle"></span><span class="jz-selection-switch-inner"><span>${rule.enabled ? '启用' : '禁用'}</span></span></button></td><td class="center">${rule.sort}</td><td class="center">${escapeHtml(formatSelectionUpdatedAt(rule.updatedAt))}</td><td class="center jz-selection-action-cell"><div class="jz-selection-actions"><button class="jz-button small link" type="button" data-action="selection-edit" data-id="${rule.id}">编辑</button><button class="jz-button small link dangerous" type="button" data-action="selection-delete" data-id="${rule.id}">删除</button></div>${deletingRuleId === rule.id ? `<div class="jz-selection-popover" role="alertdialog" aria-label="确认删除"><div class="jz-selection-popover-message"><div class="jz-selection-popover-title">确认删除</div></div><div class="jz-selection-popover-desc">确定要删除这个规则吗？删除后无法恢复。</div><div class="jz-selection-popover-actions"><button class="jz-button small" type="button" data-action="selection-delete-cancel">取消</button><button class="jz-button small primary" type="button" data-action="selection-delete-confirm" data-id="${rule.id}">确定</button></div></div>` : ''}</td></tr>`
    }).join('') : '<tr><td class="jz-selection-empty" colspan="7">暂无数据</td></tr>'}</tbody></table></div></div><footer class="jz-selection-footer"><button class="jz-button" type="button" data-action="selection-main-cancel">取消</button><button class="jz-button primary" type="button" data-action="selection-save">保存设置(规则生效)</button></footer></div>`
  }

  const renderSelectionEditor = (): void => {
    root.querySelector('[data-selection-layer]')?.remove()
    if (!selectionEditorOpen) return
    const layer = document.createElement('div')
    layer.className = 'jz-selection-layer'
    layer.dataset.selectionLayer = ''
    layer.innerHTML = `<div class="jz-selection-editor-mask"></div><section class="jz-selection-editor" role="dialog" aria-modal="true" aria-labelledby="jz-selection-editor-title"><header class="jz-selection-editor-head"><h3 class="jz-selection-editor-title" id="jz-selection-editor-title">${editingRule ? '编辑选品规则' : '新增选品规则'}</h3><button class="jz-selection-editor-close" type="button" data-action="selection-editor-close" aria-label="关闭">${closeOutlinedIconHtml()}</button></header><div class="jz-selection-editor-body">${selectionEditorFormHtml(editingRule)}</div><footer class="jz-selection-editor-footer"><button class="jz-button" type="button" data-action="selection-editor-cancel">取消</button><button class="jz-button primary" type="submit" form="jz-selection-editor-form">${editingRule ? '保存' : '确定'}</button></footer></section>`
    const form = required<HTMLFormElement>(layer, '[data-form="selection-rule"]')
    form.id = 'jz-selection-editor-form'
    root.append(layer)
    required<HTMLInputElement>(layer, 'input[name="name"]').focus()
  }

  const openSelectionEditor = (rule: PanelSelectionRule | undefined, source: HTMLElement): void => {
    editingRule = rule
    selectionEditorOpen = true
    deletingRuleId = undefined
    selectionEditorReturnFocus = source
    renderSelectionEditor()
  }

  const closeSelectionEditor = (restoreFocus = true): void => {
    selectionEditorOpen = false
    editingRule = undefined
    root.querySelector('[data-selection-layer]')?.remove()
    const focus = selectionEditorReturnFocus
    selectionEditorReturnFocus = null
    if (restoreFocus && focus?.isConnected) focus.focus()
  }

  const showSelectionFormError = (formElement: HTMLFormElement, error: unknown): void => {
    const target = required<HTMLElement>(formElement, '[data-selection-form-error]')
    target.hidden = false
    target.textContent = errorMessage(error)
    target.scrollIntoView({ block: 'nearest' })
  }

  const showSelectionOperationError = (summary: string, error: unknown): void => {
    renderSelection()
    const detail = errorMessage(error)
    required<HTMLElement>(body, '[data-selection-main-error]').innerHTML = `<div class="jz-alert" role="alert"><strong>${escapeHtml(summary)}</strong><br>${escapeHtml(detail)}</div>`
    setStatus(`${summary}：${detail}`)
  }

  const selectionInputFromForm = (formElement: HTMLFormElement): PanelSelectionRuleInput => {
    const form = new FormData(formElement)
    const name = String(form.get('name') ?? '').trim()
    const tag = String(form.get('tag') ?? '').trim()
    if (!name) throw new Error('请输入规则名称')
    if (name.length > 15) throw new Error('规则名称最多15个字符')
    if (!tag) throw new Error('请输入标签名称')
    if (tag.length > 6) throw new Error('标签名称最多6个字符')
    const sort = Number(String(form.get('sort') ?? '').trim())
    if (!Number.isInteger(sort) || sort < 0 || sort > 100) throw new Error('优先级范围为0-100')
    const brandOption = Number(form.get('brandOption'))
    if (brandOption !== 0 && brandOption !== 1 && brandOption !== 2) throw new Error('品牌选项无效')
    const autoFavoriteValue = form.get('autoFavorite')
    if (autoFavoriteValue !== '0' && autoFavoriteValue !== '1') throw new Error('是否自动收藏无效')
    const conditions: PanelSelectionConditions = { brandOption }
    for (const group of SELECTION_CONDITION_GROUPS) {
      const values = [
        { key: group.min, raw: String(form.get(group.min) ?? '').trim(), maximum: group.maxForMin },
        { key: group.max, raw: String(form.get(group.max) ?? '').trim(), maximum: group.maxForMax },
      ] as const
      for (const item of values) {
        if (!item.raw) continue
        const value = Number(item.raw)
        if (!Number.isFinite(value) || value < 0 || (group.precision === 0 && !Number.isInteger(value))) throw new Error(`${group.label}请输入有效的${group.precision === 0 ? '非负整数' : '非负数字'}`)
        if (item.maximum !== undefined && value > item.maximum) throw new Error(`${group.label}不能大于${item.maximum}`)
        conditions[item.key] = value
      }
      const min = conditions[group.min]
      const max = conditions[group.max]
      if (min !== undefined && max !== undefined && min > max) throw new Error(`${group.label}最小值不能大于最大值`)
    }
    const salesSchema = String(form.get('salesSchema') ?? '__unset')
    if (salesSchema !== '__unset' && salesSchema !== '' && salesSchema !== 'FBO' && salesSchema !== 'FBS') throw new Error('发货模式无效')
    if (salesSchema === 'FBO' || salesSchema === 'FBS') conditions.salesSchema = salesSchema
    const color = form.get('colorSet') === '1' ? sanitizePanelRuleColor(String(form.get('color') ?? '')) : undefined
    if (form.get('colorSet') === '1' && !color) throw new Error('卡片背景颜色无效')
    return { name, tag, color, autoFavorite: autoFavoriteValue === '1', sort, enabled: editingRule?.enabled ?? true, conditions }
  }

  const openSelection = (source?: HTMLElement): void => {
    const token = open(source)
    selectionEditorOpen = false
    editingRule = undefined
    deletingRuleId = undefined
    selectionEditorReturnFocus = null
    root.querySelector('[data-selection-layer]')?.remove()
    setHeader('设置选品规则', '', false, true)
    showLoading('正在读取选品规则...')
    void Promise.all([loadSettings(token), requestPanelTool<PanelSelectionRule[]>({ type: 'PANEL_SELECTION_LIST' })]).then(([, response]) => {
      if (!isCurrent(token)) return
      updateModeBadge(response.mode)
      selectionRules = response.data
      renderSelection()
      required<HTMLButtonElement>(body, '[data-action="selection-create"]').focus()
    }).catch((error: unknown) => {
      if (isCurrent(token)) showError(`获取规则列表失败：${errorMessage(error)}`)
    })
  }

  const settingsHtml = (settings: PanelToolSettings): string => `<form data-form="settings">
    <div class="jz-alert warning">MOCK 提供确定性本地交互且不会访问后端/Ozon；REAL 只调用已认证后端，任何错误都会原样显示，绝不静默回退。</div>
    <div class="jz-grid">
      <label class="jz-field"><span class="jz-label">工具运行模式</span><select class="jz-select" name="mode"><option value="mock" ${settings.mode === 'mock' ? 'selected' : ''}>MOCK（本地确定性模拟）</option><option value="real" ${settings.mode === 'real' ? 'selected' : ''}>REAL（已认证真实后端）</option></select></label>
      <label class="jz-field"><span class="jz-label">ERP Web 根地址</span><input class="jz-input" name="erpBaseUrl" type="url" placeholder="https://erp.example.com" value="${escapeHtml(settings.erpBaseUrl)}"><span class="jz-hint">必须显式配置 http/https 地址；不接受账号密码、query 或 hash。</span></label>
    </div><div class="jz-actions"><button class="jz-button primary" type="submit">保存配置</button></div><div data-settings-result></div>
  </form><section class="jz-section"><h3 class="jz-section-title">ERP 导航</h3><div class="jz-route-grid">${ERP_ROUTES.map(item => `<button class="jz-route" type="button" data-action="erp-open" data-route="${item.route}"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.description)}</span></button>`).join('')}</div></section>`

  const openErp = (source?: HTMLElement): void => {
    const token = open(source)
    setHeader('鲸智 ERP 与工具设置', '显式配置 MOCK/REAL 模式和 ERP 地址，并进入指定业务模块')
    showLoading('正在读取工具配置...')
    void loadSettings(token).then((settings) => {
      if (!isCurrent(token)) return
      body.setAttribute('aria-busy', 'false')
      body.innerHTML = settingsHtml(settings)
      required<HTMLSelectElement>(body, 'select[name="mode"]').focus()
    }).catch((error: unknown) => {
      if (isCurrent(token)) showError(errorMessage(error))
    })
  }

  const rerenderListing = (focusSelector?: string): void => {
    if (!listingPreview) return
    captureListingFormState()
    renderListingForm(listingPreview)
    if (focusSelector) body.querySelector<HTMLElement>(focusSelector)?.focus()
  }

  const listingCurrentPageRows = (): ListingRow[] => {
    const pageStart = (listingPage - 1) * LISTING_PAGE_SIZE
    return listingRows.slice(pageStart, pageStart + LISTING_PAGE_SIZE)
  }

  const listingOfferId = (row: ListingRow): string => {
    if (listingOfferRule === 'custom_prefix') return `${listingOfferPrefix}${compactDate()}${sixRandomDigits()}`
    if (listingOfferRule === 'source_sku') return `${row.sku}${offerIdRandom()}`
    if (listingOfferRule === 'prefix_sku') return `${listingOfferPrefix}${row.sku}`
    return `${compactDate()}${sixRandomDigits()}`
  }

  const applyListingBatch = (kind: 'price' | 'old-price'): void => {
    const popover = required<HTMLElement>(body, `.jz-listing-popover[aria-label="${kind === 'price' ? '批量设置售价' : '批量设置划线价'}"]`)
    const modeName = kind === 'price' ? 'batchPriceMode' : 'batchOldPriceMode'
    const valueName = kind === 'price' ? 'batchPriceValue' : 'batchOldPriceValue'
    const checkedMode = popover.querySelector<HTMLInputElement>(`input[name="${modeName}"]:checked`)?.value
    const mode: ListingBatchMode = checkedMode === 'fixed' ? 'fixed' : 'multiple'
    const raw = required<HTMLInputElement>(popover, `input[name="${valueName}"]`).value.trim()
    const value = Number(raw)
    if (!raw || !Number.isFinite(value) || value <= 0) throw new Error('请输入有效的价格')
    captureListingFormState()
    if (kind === 'price') {
      listingBatchPriceMode = mode
      if (mode === 'multiple') listingBatchPriceValue = raw
      else listingBatchFixedPrice = raw
      listingRows.forEach(row => {
        row.priceRub = Number((mode === 'multiple' ? (row.originalPrice ?? row.priceRub) * value : value).toFixed(2))
        row.priceInput = String(row.priceRub)
      })
      void browser.storage.local.set({ [BATCH_PRICE_VALUE_KEY]: mode === 'multiple' ? raw : listingBatchPriceValue })
    } else {
      listingBatchOldPriceMode = mode
      if (mode === 'multiple') listingBatchOldPriceValue = raw
      else listingBatchFixedOldPrice = raw
      listingRows.forEach(row => {
        row.oldPriceRub = Number((mode === 'multiple' ? (row.originalPrice ?? row.priceRub) * value : value).toFixed(2))
        row.oldPriceInput = String(row.oldPriceRub)
      })
      void browser.storage.local.set({ [BATCH_OLD_PRICE_VALUE_KEY]: mode === 'multiple' ? raw : listingBatchOldPriceValue })
    }
    listingPopover = undefined
    renderListingForm(requiredListingPreview())
    showListingResult('批量设置成功')
  }

  const requiredListingPreview = (): PanelListingPreview => {
    if (!listingPreview) throw new Error('商品预览已失效，请重新打开一键上架')
    return listingPreview
  }

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null
    if (!target) return
    const action = target.dataset.action
    if (action === 'close') {
      if (target.classList.contains('jz-tools-backdrop') && (surface.classList.contains('selection') || surface.classList.contains('drawer') || surface.classList.contains('listing'))) return
      close()
    }
    else if (action === 'settings') openErp(target)
    else if (action === 'listing-cancel') close()
    else if (action === 'listing-alert-close') {
      listingAlertVisible = false
      target.closest('.jz-listing-alert')?.remove()
      void browser.storage.local.set({ [FOLLOW_PRODUCT_ALERT_CLOSED_KEY]: true })
    }
    else if (action === 'listing-shops-toggle') {
      listingPopover = listingPopover === 'shops' ? undefined : 'shops'
      rerenderListing(listingPopover === 'shops' ? 'input[name="shopSearch"]' : '[data-action="listing-shops-toggle"]')
    }
    else if (action === 'listing-shops-done') {
      captureListingFormState()
      const selectedIds = [...body.querySelectorAll<HTMLInputElement>('[data-listing-shop-id]:checked')].map(input => Number(input.dataset.listingShopId))
      listingFormMemory.shopIds = selectedIds
      listingPopover = undefined
      persistListingMemory()
      if (listingPreview) renderListingForm(listingPreview)
      body.querySelector<HTMLButtonElement>('[data-action="listing-shops-toggle"]')?.focus()
    }
    else if (action === 'listing-model-random') {
      const input = required<HTMLInputElement>(body, 'input[name="modelId"]')
      input.value = `mz-${Math.random().toString(36).slice(2, 10)}`
      listingModelId = input.value
      input.focus()
    }
    else if (action === 'listing-select-all') {
      captureListingFormState()
      listingSelectedRowKeys = new Set(listingCurrentPageRows().map(row => row.key))
      renderListingForm(requiredListingPreview())
    }
    else if (action === 'listing-select-invert') {
      captureListingFormState()
      listingSelectedRowKeys = new Set(listingCurrentPageRows().filter(row => !listingSelectedRowKeys.has(row.key)).map(row => row.key))
      renderListingForm(requiredListingPreview())
    }
    else if (action === 'listing-delete-selected') {
      captureListingFormState()
      if (!listingSelectedRowKeys.size) return
      if (listingRows.length - listingSelectedRowKeys.size < 1) { showListingResult('至少保留一条数据', 'error'); return }
      listingRows = listingRows.filter(row => !listingSelectedRowKeys.has(row.key))
      listingSelectedRowKeys.clear()
      listingPage = Math.min(listingPage, listingPageCount())
      renderListingForm(requiredListingPreview())
      showListingResult('已删除所选')
    }
    else if (action === 'listing-row-delete') {
      captureListingFormState()
      if (listingRows.length <= 1) { showListingResult('至少保留一条数据', 'error'); return }
      listingRows = listingRows.filter(row => row.key !== target.dataset.key)
      listingSelectedRowKeys.delete(String(target.dataset.key))
      listingPage = Math.min(listingPage, listingPageCount())
      renderListingForm(requiredListingPreview())
    }
    else if (action === 'listing-page') {
      captureListingFormState()
      const page = Number(target.dataset.page)
      if (Number.isInteger(page) && page >= 1 && page <= listingPageCount()) listingPage = page
      listingSelectedRowKeys.clear()
      listingPopover = undefined
      renderListingForm(requiredListingPreview())
    }
    else if (action === 'listing-popover') {
      const popover = target.dataset.popover
      if (popover !== 'offer' && popover !== 'price' && popover !== 'old-price') return
      listingPopover = listingPopover === popover ? undefined : popover
      rerenderListing(listingPopover ? `.jz-listing-popover[aria-label="${popover === 'offer' ? '货号生成设置' : popover === 'price' ? '批量设置售价' : '批量设置划线价'}"] .jz-select, .jz-listing-popover[aria-label="${popover === 'offer' ? '货号生成设置' : popover === 'price' ? '批量设置售价' : '批量设置划线价'}"] input` : undefined)
    }
    else if (action === 'listing-popover-close') {
      listingPopover = undefined
      rerenderListing()
    }
    else if (action === 'listing-offer-apply') {
      const popover = required<HTMLElement>(body, '.jz-listing-popover[aria-label="货号生成设置"]')
      const rule = required<HTMLSelectElement>(popover, 'select[name="offerRule"]').value
      listingOfferRule = rule === 'custom_prefix' || rule === 'source_sku' || rule === 'prefix_sku' ? rule : 'system'
      const prefix = popover.querySelector<HTMLInputElement>('input[name="offerPrefix"]')?.value.trim() ?? listingOfferPrefix
      if ((listingOfferRule === 'custom_prefix' || listingOfferRule === 'prefix_sku') && !prefix) { showListingResult('请输入前缀', 'error'); return }
      listingOfferPrefix = prefix
      captureListingFormState()
      listingRows.forEach(row => { row.offerId = listingOfferId(row) })
      listingPopover = undefined
      void browser.storage.local.set({ [OFFER_ID_RULE_KEY]: listingOfferRule, [OFFER_ID_PREFIX_KEY]: listingOfferPrefix })
      renderListingForm(requiredListingPreview())
      showListingResult('货号已批量生成')
    }
    else if (action === 'listing-price-apply' || action === 'listing-old-price-apply') {
      try { applyListingBatch(action === 'listing-price-apply' ? 'price' : 'old-price') }
      catch (error: unknown) { showListingResult(errorMessage(error), 'error') }
    }
    else if (action === 'listing-weight-first') {
      captureListingFormState()
      const first = listingRows[0]?.customWeightG
      listingRows.forEach(row => { row.customWeightG = first })
      renderListingForm(requiredListingPreview())
      showListingResult('已应用首行重量')
    }
    else if (action === 'listing-dimensions-first') {
      captureListingFormState()
      const first = listingRows[0]
      listingRows.forEach(row => {
        row.packageLengthMm = first?.packageLengthMm
        row.packageWidthMm = first?.packageWidthMm
        row.packageHeightMm = first?.packageHeightMm
      })
      renderListingForm(requiredListingPreview())
      showListingResult('已应用首行尺寸')
    }
    else if (action === 'listing-barcode-generate') {
      captureListingFormState()
      listingRows.forEach(row => { row.barcode = `${compactDateTime()}${sixRandomDigits()}` })
      renderListingForm(requiredListingPreview())
      showListingResult('已生成所有条形码')
    }
    else if (action === 'selection-create') {
      openSelectionEditor(undefined, target)
    } else if (action === 'selection-editor-close' || action === 'selection-editor-cancel') {
      closeSelectionEditor()
    } else if (action === 'selection-main-cancel') {
      close()
    } else if (action === 'selection-color-clear') {
      const form = target.closest<HTMLFormElement>('form[data-form="selection-rule"]')
      if (!form) return
      required<HTMLInputElement>(form, 'input[name="colorSet"]').value = '0'
      required<HTMLInputElement>(form, 'input[name="color"]').value = '#ffffff'
      required<HTMLElement>(form, '[data-selection-color-text]').textContent = '不设置'
      target.remove()
    } else if (action === 'selection-edit') {
      const rule = selectionRules.find(item => item.id === Number(target.dataset.id))
      if (rule) openSelectionEditor(rule, target)
    } else if (action === 'selection-delete') {
      deletingRuleId = Number(target.dataset.id)
      renderSelection()
    } else if (action === 'selection-delete-cancel') {
      deletingRuleId = undefined
      renderSelection()
    } else if (action === 'selection-toggle') {
      const token = sequence
      const id = Number(target.dataset.id)
      const enabled = target.dataset.enabled === 'true'
      target.setAttribute('disabled', '')
      void requestPanelTool<PanelSelectionRule>({ type: 'PANEL_SELECTION_TOGGLE', id, enabled }).then((response) => {
        if (!isCurrent(token)) return
        updateModeBadge(response.mode)
        selectionRules = selectionRules.map(rule => rule.id === id ? response.data : rule)
        renderSelection()
        setStatus(enabled ? '已启用规则' : '已禁用规则')
      }).catch((error: unknown) => {
        if (isCurrent(token)) showSelectionOperationError('操作失败，请重试', error)
      })
    } else if (action === 'selection-delete-confirm') {
      const token = sequence
      const id = Number(target.dataset.id)
      target.setAttribute('disabled', '')
      void requestPanelTool<{ deleted: boolean }>({ type: 'PANEL_SELECTION_DELETE', id }).then((response) => {
        if (!isCurrent(token)) return
        updateModeBadge(response.mode)
        selectionRules = selectionRules.filter(rule => rule.id !== id)
        deletingRuleId = undefined
        renderSelection()
        setStatus('删除成功')
      }).catch((error: unknown) => {
        if (isCurrent(token)) showSelectionOperationError('操作失败', error)
      })
    } else if (action === 'selection-save') {
      const token = sequence
      const enabledRules = selectionRules.filter(rule => rule.enabled)
      target.setAttribute('disabled', '')
      void browser.storage.local.set({ [PANEL_SELECTION_RULES_STORAGE_KEY]: enabledRules }).then(() => {
        if (!isCurrent(token)) return
        setStatus(enabledRules.length ? `设置已保存，共启用 ${enabledRules.length} 条规则` : '已清除所有选品规则设置')
        close()
        window.location.reload()
      }).catch((error: unknown) => {
        if (!isCurrent(token)) return
        target.removeAttribute('disabled')
        showSelectionOperationError('保存设置失败', error)
      })
    } else if (action === 'listing-confirm' && listingDraft) {
      const confirm = required<HTMLElement>(body, '[data-submit-confirm]')
      confirm.innerHTML = `<div class="jz-confirm"><span>${currentMode === 'mock' ? '确认执行 MOCK 提交交互？不会向 Ozon 发送请求。' : '确认将草稿提交到 Ozon？这是独立的真实外部操作。'}</span><span><button class="jz-button" type="button" data-action="listing-confirm-cancel">取消</button> <button class="jz-button danger" type="button" data-action="listing-submit">${currentMode === 'mock' ? '确认模拟' : '确认提交到 Ozon'}</button></span></div>`
    } else if (action === 'listing-confirm-cancel') {
      required<HTMLElement>(body, '[data-submit-confirm]').innerHTML = ''
    } else if (action === 'listing-submit' && listingDraft) {
      const token = sequence
      const draftId = listingDraft.draftId
      target.setAttribute('disabled', '')
      target.textContent = '提交中...'
      void requestPanelTool<PanelListingSubmitResult>({ type: 'PANEL_LISTING_SUBMIT', draftId }).then((response) => {
        if (!isCurrent(token)) return
        updateModeBadge(response.mode)
        const result = response.data
        const confirm = required<HTMLElement>(body, '[data-submit-confirm]')
        confirm.innerHTML = `<div class="jz-alert ${result.externalSubmitted ? 'success' : 'warning'}" role="status"><strong>${result.externalSubmitted ? '已向 Ozon 提交' : '未向 Ozon 提交'}</strong><br>${escapeHtml(result.message)}${result.taskId ? `<br>任务 ID：${escapeHtml(result.taskId)}` : ''}</div>`
        setStatus(result.message)
      }).catch((error: unknown) => {
        if (!isCurrent(token)) return
        const confirm = required<HTMLElement>(body, '[data-submit-confirm]')
        confirm.innerHTML = `<div class="jz-alert" role="alert">${escapeHtml(errorMessage(error))}<br>未确认外部提交成功。</div>`
        setStatus(`上架提交失败：${errorMessage(error)}`)
      })
    } else if (action === 'erp-open') {
      const token = sequence
      const route = target.dataset.route as PanelErpRoute
      target.setAttribute('disabled', '')
      void requestPanelTool<{ opened: boolean; url: string }>({ type: 'PANEL_ERP_OPEN', route }).then((response) => {
        if (!isCurrent(token)) return
        updateModeBadge(response.mode)
        setStatus(`已打开 ERP：${response.data.url}`)
        target.removeAttribute('disabled')
      }).catch((error: unknown) => {
        if (!isCurrent(token)) return
        target.removeAttribute('disabled')
        const existing = body.querySelector('[data-settings-result]')
        if (existing) existing.innerHTML = `<div class="jz-alert" role="alert" style="margin-top:12px">${escapeHtml(errorMessage(error))}</div>`
        setStatus(`ERP 打开失败：${errorMessage(error)}`)
      })
    }
  }, { signal })

  root.addEventListener('input', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    if (surface.classList.contains('listing')) {
      target.classList.remove('invalid')
      if (target.name === 'shopSearch') {
        const query = target.value.trim().toLocaleLowerCase()
        body.querySelectorAll<HTMLElement>('[data-shop-option]').forEach((option) => {
          option.hidden = !String(option.dataset.shopSearch ?? '').includes(query)
        })
      }
      return
    }
    const form = target.closest<HTMLFormElement>('form[data-form="selection-rule"]')
    if (!form) return
    if (target.name === 'color') {
      required<HTMLInputElement>(form, 'input[name="colorSet"]').value = '1'
      required<HTMLElement>(form, '[data-selection-color-text]').textContent = target.value
      const colorRow = required<HTMLElement>(form, '.jz-color-row')
      if (!colorRow.querySelector('[data-action="selection-color-clear"]')) colorRow.insertAdjacentHTML('beforeend', selectionColorClearButtonHtml())
    }
    if (target.name === 'name' || target.name === 'tag') {
      const maximum = target.name === 'name' ? 15 : 6
      const count = form.querySelector<HTMLElement>(`[data-count-for="${target.name}"]`)
      if (count) count.textContent = `${target.value.length}/${maximum}`
    }
  }, { signal })

  root.addEventListener('change', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) || !surface.classList.contains('listing')) return
    if (target instanceof HTMLInputElement && target.dataset.listingSelect) {
      if (target.checked) listingSelectedRowKeys.add(target.dataset.listingSelect)
      else listingSelectedRowKeys.delete(target.dataset.listingSelect)
      return
    }
    if (target instanceof HTMLSelectElement && target.name === 'offerRule') {
      listingOfferPrefix = body.querySelector<HTMLInputElement>('input[name="offerPrefix"]')?.value.trim() ?? listingOfferPrefix
      listingOfferRule = target.value === 'custom_prefix' || target.value === 'source_sku' || target.value === 'prefix_sku' ? target.value : 'system'
      listingPopover = 'offer'
      rerenderListing(`select[name="offerRule"]`)
      return
    }
    if (target instanceof HTMLInputElement && target.name === 'batchPriceMode') {
      const currentValue = body.querySelector<HTMLInputElement>('input[name="batchPriceValue"]')?.value.trim() ?? ''
      if (listingBatchPriceMode === 'multiple') listingBatchPriceValue = currentValue
      else listingBatchFixedPrice = currentValue
      listingBatchPriceMode = target.value === 'fixed' ? 'fixed' : 'multiple'
      listingPopover = 'price'
      rerenderListing('input[name="batchPriceValue"]')
      return
    }
    if (target instanceof HTMLInputElement && target.name === 'batchOldPriceMode') {
      const currentValue = body.querySelector<HTMLInputElement>('input[name="batchOldPriceValue"]')?.value.trim() ?? ''
      if (listingBatchOldPriceMode === 'multiple') listingBatchOldPriceValue = currentValue
      else listingBatchFixedOldPrice = currentValue
      listingBatchOldPriceMode = target.value === 'fixed' ? 'fixed' : 'multiple'
      listingPopover = 'old-price'
      rerenderListing('input[name="batchOldPriceValue"]')
      return
    }
    if (target.name === 'currency') {
      rerenderListing('select[name="currency"]')
      return
    }
    if (target.name === 'brand' || target.name === 'imageOrder' || target.name === 'followType' || target.name === 'watermarkId' || target.name === 'showAllSku') {
      captureListingFormState()
      persistListingMemory()
    }
  }, { signal })

  root.addEventListener('submit', (event) => {
    event.preventDefault()
    const formElement = event.target
    if (!(formElement instanceof HTMLFormElement)) return
    const submit = formElement.querySelector<HTMLButtonElement>('button[type="submit"]')
      ?? root.querySelector<HTMLButtonElement>(`button[type="submit"][form="${formElement.id}"]`)
    submit?.setAttribute('disabled', '')
    if (formElement.dataset.form === 'listing') {
      const token = sequence
      try {
        const input = listingInputFromForm(formElement)
        const prepareRequest: PanelToolRequest = listingProduct
          ? { type: 'PANEL_LISTING_PREPARE', input, product: listingProduct }
          : { type: 'PANEL_LISTING_PREPARE', input }
        void requestPanelTool<PanelListingDraftResult>(prepareRequest).then((response) => {
          if (!isCurrent(token) || !formElement.isConnected) return
          updateModeBadge(response.mode)
          listingDraft = response.data
          renderListingDraft(response.data)
          setStatus(`上架草稿 #${response.data.draftId} 已创建，尚未提交 Ozon`)
        }).catch((error: unknown) => {
          if (!isCurrent(token) || !formElement.isConnected) return
          required<HTMLElement>(formElement, '[data-listing-result]').innerHTML = `<div class="jz-alert" role="alert" style="margin-top:14px">${escapeHtml(errorMessage(error))}<br>未创建草稿，也未向 Ozon 提交。</div>`
          setStatus(`草稿创建失败：${errorMessage(error)}`)
        }).finally(() => {
          if (isCurrent(token) && submit?.isConnected) submit.removeAttribute('disabled')
        })
      } catch (error: unknown) {
        const activeForm = required<HTMLFormElement>(body, 'form[data-form="listing"]')
        required<HTMLElement>(activeForm, '[data-listing-result]').innerHTML = `<div class="jz-alert" role="alert" style="margin-top:14px">${escapeHtml(errorMessage(error))}</div>`
        root.querySelector<HTMLButtonElement>(`button[type="submit"][form="${activeForm.id}"]`)?.removeAttribute('disabled')
      }
    } else if (formElement.dataset.form === 'selection-rule') {
      const token = sequence
      try {
        const input = selectionInputFromForm(formElement)
        const id = Number(formElement.dataset.ruleId)
        const request: PanelToolRequest = id > 0
          ? { type: 'PANEL_SELECTION_UPDATE', id, input }
          : { type: 'PANEL_SELECTION_CREATE', input }
        void requestPanelTool<PanelSelectionRule>(request).then((response) => {
          if (!isCurrent(token) || !formElement.isConnected) return
          updateModeBadge(response.mode)
          selectionRules = id > 0
            ? selectionRules.map(rule => rule.id === id ? response.data : rule)
            : [...selectionRules, response.data]
          selectionRules.sort((left, right) => left.sort - right.sort || left.id - right.id)
          closeSelectionEditor(false)
          renderSelection()
          setStatus(id > 0 ? '规则编辑成功' : '规则添加成功')
          required<HTMLButtonElement>(body, '[data-action="selection-create"]').focus()
        }).catch((error: unknown) => {
          if (!isCurrent(token) || !formElement.isConnected) return
          showSelectionFormError(formElement, error)
        }).finally(() => {
          if (isCurrent(token) && submit?.isConnected) submit.removeAttribute('disabled')
        })
      } catch (error: unknown) {
        showSelectionFormError(formElement, error)
        submit?.removeAttribute('disabled')
      }
    } else if (formElement.dataset.form === 'settings') {
      const token = sequence
      const form = new FormData(formElement)
      const mode = form.get('mode')
      if (mode !== 'mock' && mode !== 'real') {
        submit?.removeAttribute('disabled')
        return
      }
      const settings: PanelToolSettings = { mode, erpBaseUrl: String(form.get('erpBaseUrl') ?? '').trim() }
      void requestPanelTool<PanelToolSettings>({ type: 'PANEL_SETTINGS_UPDATE', settings }).then((response) => {
        if (!isCurrent(token) || !formElement.isConnected) return
        updateModeBadge(response.mode)
        required<HTMLElement>(formElement, '[data-settings-result]').innerHTML = `<div class="jz-alert success" style="margin-top:12px">配置已保存。后续工具请求将严格使用 ${escapeHtml(response.data.mode.toUpperCase())} 模式。</div>`
        setStatus(`工具模式已切换为 ${response.data.mode.toUpperCase()}`)
      }).catch((error: unknown) => {
        if (!isCurrent(token) || !formElement.isConnected) return
        required<HTMLElement>(formElement, '[data-settings-result]').innerHTML = `<div class="jz-alert" role="alert" style="margin-top:12px">${escapeHtml(errorMessage(error))}</div>`
      }).finally(() => {
        if (isCurrent(token) && submit?.isConnected) submit.removeAttribute('disabled')
      })
    }
  }, { signal })

  root.addEventListener('mousedown', (event) => {
    const resizeHandle = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-resize]') : null
    if (!resizeHandle) return
    event.preventDefault()
    resizing = true
    resizeStartX = event.clientX
    resizeStartWidth = surface.getBoundingClientRect().width
    body.querySelector('.jz-pricing-frame')?.classList.add('disable-pointer')
  }, { signal })
  document.addEventListener('mousemove', (event) => {
    if (!resizing) return
    applyDrawerWidth(resizeStartWidth + resizeStartX - event.clientX)
  }, { signal })
  document.addEventListener('mouseup', () => {
    if (!resizing) return
    resizing = false
    body.querySelector('.jz-pricing-frame')?.classList.remove('disable-pointer')
    void browser.storage.local.set({ [DRAWER_WIDTH_KEY]: String(Math.round(surface.getBoundingClientRect().width)) })
  }, { signal })
  window.addEventListener('resize', () => {
    if (surface.classList.contains('drawer')) applyDrawerWidth(surface.getBoundingClientRect().width)
  }, { signal })
  shadow.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || root.hidden) return
    if (event.key === 'Escape') {
      event.preventDefault()
      if (selectionEditorOpen) closeSelectionEditor()
      else close()
      return
    }
    if (event.key === 'Tab') {
      const focusRoot = selectionEditorOpen ? root.querySelector<HTMLElement>('[data-selection-layer]') ?? root : root
      const focusable = [...focusRoot.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])')].filter(element => !element.hidden)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }, { signal })

  const controller: FloatingPanelToolsController = {
    openListing,
    openPricing,
    openSelection,
    openErp,
    close,
    stop: () => {
      if (stopped) return
      stopped = true
      sequence += 1
      listingProduct = undefined
      root.remove()
      shadow.querySelector('#jingzhi-panel-tools-style')?.remove()
    },
  }
  return controller
}