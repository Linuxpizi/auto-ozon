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

const DRAWER_WIDTH_KEY = 'jingzhi_ai_panel_pricing_drawer_width'
export const PANEL_SELECTION_RULES_STORAGE_KEY = 'jingzhi_ai_product_selection_rules'
const DEFAULT_DRAWER_WIDTH = 500
const MIN_DRAWER_WIDTH = 300

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
  openListing: (source?: HTMLElement) => void
  openPricing: (route: PanelPricingRoute, source?: HTMLElement) => void
  openSelection: (source?: HTMLElement) => void
  openErp: (source?: HTMLElement) => void
  close: () => void
  stop: () => void
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

function finiteFormNumber(form: FormData, name: string, options: { required?: boolean; positive?: boolean } = {}): number {
  const raw = String(form.get(name) ?? '').trim()
  if (!raw && !options.required) return 0
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${name} 必须是有效数字`)
  if (options.positive ? value <= 0 : value < 0) throw new Error(`${name} 必须${options.positive ? '大于' : '不小于'} 0`)
  return value
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

function toolStyles(): string {
  return `<style id="jingzhi-panel-tools-style">
    .jz-tools,.jz-tools *{box-sizing:border-box}
    .jz-tools{position:fixed;inset:0;z-index:10;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:#20242c;pointer-events:auto}
    .jz-tools[hidden]{display:none!important}
    .jz-tools-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.46);backdrop-filter:blur(2px)}
    .jz-surface{position:absolute;top:50%;left:50%;display:flex;width:min(880px,calc(100vw - 48px));max-height:calc(100vh - 48px);transform:translate(-50%,-50%);flex-direction:column;overflow:hidden;border:1px solid #eef0f3;border-radius:16px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.32)}
    .jz-surface.drawer{top:0;right:0;bottom:0;left:auto;width:500px;max-width:calc(100vw - 16px);max-height:none;transform:none;border-width:0 0 0 1px;border-radius:0}
    .jz-surface.selection{width:min(900px,calc(100vw - 48px));border-radius:8px}
    .jz-surface.selection .jz-head{align-items:center;padding:16px 24px;background:#fff}.jz-surface.selection .jz-subtitle,.jz-surface.selection [data-action="settings"]{display:none}
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
    .jz-selection-main{display:flex;max-height:calc(100vh - 118px);min-height:360px;flex-direction:column}.jz-selection-content{min-height:0;flex:1;padding:20px 24px;overflow:auto}.jz-selection-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;color:#262626;font-size:14px}.jz-selection-table-wrap{overflow:auto;border:1px solid #f0f0f0;border-radius:6px}.jz-selection-table{width:100%;min-width:960px;border-collapse:collapse;table-layout:fixed;color:#262626;font-size:12px}.jz-selection-table th,.jz-selection-table td{height:48px;padding:8px;border-right:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;text-align:left;vertical-align:middle}.jz-selection-table th:last-child,.jz-selection-table td:last-child{border-right:0}.jz-selection-table tbody tr:last-child td{border-bottom:0}.jz-selection-table th{background:#fafafa;font-weight:600;white-space:nowrap}.jz-selection-table .center{text-align:center}.jz-selection-empty{padding:48px 16px!important;color:#8c8c8c;text-align:center!important}.jz-selection-tag{display:inline-flex;max-width:100%;align-items:center;padding:1px 7px;border:1px solid #d9d9d9;border-radius:4px;background:#fafafa;color:#595959;line-height:20px;white-space:nowrap}.jz-selection-tag.colored{border-color:transparent;color:#fff}.jz-selection-actions{display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}.jz-selection-switch{position:relative;display:inline-flex;width:58px;height:24px;align-items:center;padding:0 6px 0 25px;border:0;border-radius:12px;background:#bfbfbf;color:#fff;font:inherit;font-size:11px;cursor:pointer;transition:.2s}.jz-selection-switch::before{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.2);content:"";transition:.2s}.jz-selection-switch.on{padding:0 25px 0 6px;background:#1677ff}.jz-selection-switch.on::before{left:37px}.jz-selection-footer{display:flex;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:8px;padding:12px 24px;border-top:1px solid #f0f0f0;background:#fff}.jz-selection-popover{position:absolute;right:8px;top:42px;z-index:3;width:270px;padding:12px;border-radius:8px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.18);color:#262626;text-align:left;white-space:normal}.jz-selection-popover::before{position:absolute;top:-6px;right:28px;width:12px;height:12px;transform:rotate(45deg);background:#fff;content:""}.jz-selection-popover-title{position:relative;font-size:14px;font-weight:600}.jz-selection-popover-desc{position:relative;margin-top:5px;color:#595959;font-size:12px;line-height:1.5}.jz-selection-popover-actions{position:relative;display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.jz-selection-action-cell{position:relative}
    .jz-selection-layer{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:24px}.jz-selection-editor-mask{position:absolute;inset:0;background:rgba(0,0,0,.45)}.jz-selection-editor{position:relative;display:flex;width:min(600px,calc(100vw - 48px));max-height:calc(100vh - 48px);flex-direction:column;overflow:hidden;border-radius:8px;background:#fff;box-shadow:0 12px 48px rgba(0,0,0,.28)}.jz-selection-editor-head{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #f0f0f0}.jz-selection-editor-title{margin:0;color:#262626;font-size:16px;font-weight:600}.jz-selection-editor-body{min-height:0;padding:20px 24px 8px;overflow:auto}.jz-selection-editor-footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 24px;border-top:1px solid #f0f0f0}.jz-selection-form-error{margin-bottom:16px;padding:8px 12px;border:1px solid #ffccc7;border-radius:6px;background:#fff2f0;color:#cf1322;font-size:12px;line-height:1.5}.jz-form-item{display:grid;grid-template-columns:25% minmax(0,75%);align-items:start;margin-bottom:18px}.jz-form-label{padding:7px 12px 0 0;color:#262626;font-size:13px;text-align:right;line-height:22px}.jz-form-label.required::before{margin-right:4px;color:#ff4d4f;content:"*"}.jz-form-control{position:relative;min-width:0}.jz-form-control.width-80{width:80%}.jz-form-help{margin-top:4px;color:#8c8c8c;font-size:11px;line-height:1.4}.jz-count{position:absolute;right:8px;top:9px;color:#bfbfbf;font-size:10px;pointer-events:none}.jz-input.with-count{padding-right:48px}.jz-priority-row{display:flex;align-items:center;gap:8px}.jz-priority-row .jz-input{width:100px}.jz-tooltip{display:inline-grid;width:18px;height:18px;place-items:center;border:1px solid #bfbfbf;border-radius:50%;color:#8c8c8c;font-size:11px;cursor:help}.jz-color-row{display:flex;align-items:center;gap:10px}.jz-color-input{width:46px;height:32px;padding:2px;border:1px solid #d9d9d9;border-radius:6px;background:#fff}.jz-color-text{min-width:72px;color:#595959;font-size:13px}.jz-radio-group{display:flex;flex-wrap:wrap;gap:18px;padding-top:7px}.jz-radio{display:inline-flex;align-items:center;gap:6px;color:#262626;font-size:13px}.jz-radio input{accent-color:#1677ff}.jz-condition-row{display:grid;grid-template-columns:minmax(0,1fr) 14px minmax(0,1fr);align-items:center;gap:6px}.jz-condition-sep{text-align:center;color:#8c8c8c}.jz-number-wrap{display:flex;min-width:0}.jz-number-wrap .jz-input{min-width:0;border-radius:6px}.jz-number-wrap.has-before .jz-input{border-radius:0 6px 6px 0}.jz-number-wrap.has-after .jz-input{border-radius:6px 0 0 6px}.jz-number-addon{display:inline-flex;flex:0 0 auto;align-items:center;padding:0 9px;border:1px solid #d9d9d9;background:#fafafa;color:#595959;font-size:12px}.jz-number-addon.before{border-right:0;border-radius:6px 0 0 6px}.jz-number-addon.after{border-left:0;border-radius:0 6px 6px 0}.jz-schema-select{width:120px}
    .jz-route-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.jz-route{padding:12px;border:1px solid #e1e6ec;border-radius:10px;background:#fff;text-align:left;cursor:pointer}.jz-route:hover{border-color:#1677ff;background:#f5f9ff}.jz-route strong{display:block;color:#273243;font-size:13px}.jz-route span{display:block;margin-top:4px;color:#7d8795;font-size:11px;line-height:1.4}
    .jz-confirm{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:12px;border:1px solid #fca5a5;border-radius:10px;background:#fff7f7;color:#9f1239;font-size:12px;line-height:1.45}
    .jz-button:focus-visible,.jz-icon-button:focus-visible,.jz-input:focus-visible,.jz-select:focus-visible,.jz-textarea:focus-visible,.jz-route:focus-visible{outline:3px solid rgba(22,119,255,.24);outline-offset:2px}
    @media(max-width:720px){.jz-surface,.jz-surface.selection{width:calc(100vw - 24px);max-height:calc(100vh - 24px)}.jz-grid,.jz-grid.three,.jz-metrics,.jz-route-grid{grid-template-columns:1fr}.jz-product{align-items:flex-start}.jz-head{padding:14px}.jz-body{padding:14px}.jz-mode{display:none}.jz-surface.selection .jz-body{padding:0}.jz-selection-content{padding:14px}.jz-selection-layer{padding:12px}.jz-selection-editor{width:calc(100vw - 24px);max-height:calc(100vh - 24px)}.jz-selection-editor-body{padding:16px 14px 6px}.jz-form-item{grid-template-columns:1fr;gap:6px}.jz-form-label{padding:0;text-align:left}.jz-form-control.width-80{width:100%}}
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
        <div class="jz-head-actions"><span class="jz-mode" data-mode>加载中</span><button class="jz-icon-button" type="button" data-action="settings" aria-label="模式与 ERP 设置">设置</button><button class="jz-icon-button" type="button" data-action="close" aria-label="关闭">✕</button></div>
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

  const setHeader = (heading: string, description: string, drawer = false, selection = false): void => {
    title.textContent = heading
    subtitle.textContent = description
    surface.classList.toggle('drawer', drawer)
    surface.classList.toggle('selection', selection)
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
    const max = Math.max(MIN_DRAWER_WIDTH, window.innerWidth - 16)
    surface.style.width = `${Math.min(max, Math.max(MIN_DRAWER_WIDTH, width))}px`
  }

  const restoreDrawerWidth = async (token: number): Promise<void> => {
    const stored = (await browser.storage.local.get(DRAWER_WIDTH_KEY))[DRAWER_WIDTH_KEY]
    if (isCurrent(token) && surface.classList.contains('drawer')) {
      applyDrawerWidth(typeof stored === 'number' ? stored : DEFAULT_DRAWER_WIDTH)
    }
  }

  const pricingFrameUrl = (route: PanelPricingRoute, context: PanelPricingContext): string => {
    const params = new URLSearchParams({
      sell_price: String(context.sellPrice),
      package_weight: String(context.packageWeight),
      package_length: String(context.packageLength),
      package_width: String(context.packageWidth),
      package_height: String(context.packageHeight),
      rfbs_rate: JSON.stringify(context.rfbsRate),
      category_ids: JSON.stringify(context.categoryIds),
    })
    return `${browser.runtime.getURL('/panel-pricing.html')}#/${route}?${params.toString()}`
  }

  const openPricing = (route: PanelPricingRoute, source?: HTMLElement): void => {
    const token = open(source)
    setHeader('定价工具&利润计算器', '', true)
    showLoading('正在读取当前商品事实...')
    void Promise.all([
      requestPanelTool<PanelPricingContext>({ type: 'PANEL_PRICING_CONTEXT', route }),
      restoreDrawerWidth(token),
    ]).then(([response]) => {
      if (!isCurrent(token)) return
      updateModeBadge(response.mode)
      const iframeUrl = pricingFrameUrl(route, response.data)
      body.setAttribute('aria-busy', 'false')
      body.innerHTML = `<div class="jz-drawer-layout"><div class="jz-resize" data-resize role="separator" aria-label="调整抽屉宽度" aria-orientation="vertical"><div class="jz-resize-dots" aria-hidden="true"><span></span><span></span><span></span></div></div><div class="jz-drawer-content"><iframe class="jz-pricing-frame" src="${escapeHtml(iframeUrl)}" title="定价工具&利润计算器"></iframe></div></div>`
      required<HTMLIFrameElement>(body, '.jz-pricing-frame').focus()
    }).catch((error: unknown) => {
      if (isCurrent(token)) showError(errorMessage(error))
    })
  }

  const renderListingForm = (preview: PanelListingPreview): void => {
    const usableStores = preview.stores.filter(store => store.usable)
    body.setAttribute('aria-busy', 'false')
    body.innerHTML = `<form data-form="listing">
      <div class="jz-alert ${currentMode === 'mock' ? 'warning' : 'info'}"><strong>${escapeHtml(modeLabel(currentMode))}</strong><br>${currentMode === 'mock' ? '草稿与提交仅做确定性模拟，绝不会向 Ozon 发送请求。' : '创建草稿只写入鲸智 AI 后端；只有第二步明确确认后才会向 Ozon 提交。'}</div>
      <section class="jz-product">${preview.primaryImage ? `<img class="jz-product-image" src="${escapeHtml(preview.primaryImage)}" alt="商品主图">` : ''}<div><h3 class="jz-product-title">${escapeHtml(preview.title)}</h3><div class="jz-muted">Ozon 商品 ID：${escapeHtml(preview.productId)}<br>${escapeHtml(preview.sourceUrl)}</div></div></section>
      <section class="jz-section"><h3 class="jz-section-title">基础信息</h3><div class="jz-grid three">
        <label class="jz-field"><span class="jz-label">目标店铺</span><select class="jz-select" name="storeId" required><option value="">请选择店铺</option>${preview.stores.map(store => `<option value="${store.id}" ${store.usable ? '' : 'disabled'}>${escapeHtml(store.name)}${store.reason ? ` · ${escapeHtml(store.reason)}` : ''}</option>`).join('')}</select></label>
        <label class="jz-field"><span class="jz-label">描述类目 ID</span><input class="jz-input" name="descriptionCategoryId" type="number" min="1" step="1" value="${preview.descriptionCategoryId ?? ''}" required></label>
        <label class="jz-field"><span class="jz-label">商品类型 ID</span><input class="jz-input" name="typeId" type="number" min="1" step="1" value="${preview.typeId ?? ''}" required></label>
        <label class="jz-field wide"><span class="jz-label">标题</span><input class="jz-input" name="title" value="${escapeHtml(preview.title)}" required></label>
        <label class="jz-field"><span class="jz-label">品牌</span><input class="jz-input" name="brand" value="${escapeHtml(preview.brand ?? '')}"></label>
        <label class="jz-field"><span class="jz-label">Offer ID</span><input class="jz-input" name="offerId" value="JZ-${escapeHtml(preview.productId)}" required></label>
        <label class="jz-field"><span class="jz-label">类目名称</span><input class="jz-input" name="categoryName" value="Ozon ${escapeHtml(preview.productId)}" required></label>
      </div>${usableStores.length ? '' : '<div class="jz-alert" style="margin-top:12px">没有可用店铺。REAL 模式请先在 ERP 配置店铺；MOCK 模式应提供固定演示店铺。</div>'}</section>
      <section class="jz-section"><h3 class="jz-section-title">变体与价格 <span class="jz-muted">至少选择一个真实变体</span></h3><div class="jz-table-wrap"><table class="jz-table"><thead><tr><th>选择</th><th>SKU / 规格</th><th>售价 ₽</th><th>划线价 ₽</th><th>图片（每行一个 URL）</th></tr></thead><tbody>${preview.variants.map((variant, index) => `<tr data-variant="${index}"><td><input name="variantSelected-${index}" type="checkbox" ${variant.selected ? 'checked' : ''} aria-label="选择 ${escapeHtml(variant.sku)}"></td><td><strong>${escapeHtml(variant.sku)}</strong><br><input class="jz-input" name="variantName-${index}" value="${escapeHtml(variant.name)}" aria-label="变体名称"></td><td><input class="jz-input" name="variantPrice-${index}" type="number" min="0.01" step="1" value="${variant.priceRub}" required></td><td><input class="jz-input" name="variantOldPrice-${index}" type="number" min="0.01" step="1" value="${variant.oldPriceRub}" required></td><td><textarea class="jz-textarea" name="variantImages-${index}" aria-label="变体图片">${escapeHtml(variant.images.join('\n'))}</textarea></td></tr>`).join('')}</tbody></table></div></section>
      <section class="jz-section"><h3 class="jz-section-title">图片与定价处理</h3><div class="jz-grid">
        <label class="jz-check"><input name="followSourceImages" type="checkbox" checked>跟随当前来源图片</label>
        <label class="jz-check"><input name="watermarkEnabled" type="checkbox">添加鲸智水印</label>
        <label class="jz-check"><input name="randomizeImages" type="checkbox">随机调整图片顺序</label>
        <label class="jz-check"><input name="modelImagesEnabled" type="checkbox">生成模特图</label>
        <label class="jz-check"><input name="floatingPriceEnabled" type="checkbox">启用浮动定价</label>
      </div>${preview.previewOnlyTransforms.length ? `<p class="jz-hint">当前仅预览能力：${escapeHtml(preview.previewOnlyTransforms.join('、'))}。REAL 模式不支持的变换会被明确拒绝，不会静默忽略。</p>` : ''}</section>
      <div class="jz-actions"><button class="jz-button primary" type="submit" ${usableStores.length ? '' : 'disabled'}>创建上架草稿</button></div><div data-listing-result></div>
    </form>`
    required<HTMLSelectElement>(body, 'select[name="storeId"]').focus()
  }

  const listingInputFromForm = (formElement: HTMLFormElement): PanelListingDraftInput => {
    if (!listingPreview) throw new Error('商品预览已失效，请重新打开一键上架')
    const form = new FormData(formElement)
    const variants: PanelListingVariant[] = listingPreview.variants.map((variant, index) => ({
      sku: variant.sku,
      name: String(form.get(`variantName-${index}`) ?? '').trim() || variant.name,
      priceRub: finiteFormNumber(form, `variantPrice-${index}`, { required: true, positive: true }),
      oldPriceRub: finiteFormNumber(form, `variantOldPrice-${index}`, { required: true, positive: true }),
      images: String(form.get(`variantImages-${index}`) ?? '').split(/\r?\n/).map(value => value.trim()).filter(Boolean),
      selected: form.has(`variantSelected-${index}`),
    }))
    if (!variants.some(variant => variant.selected)) throw new Error('至少选择一个真实变体')
    const titleValue = String(form.get('title') ?? '').trim()
    const offerId = String(form.get('offerId') ?? '').trim()
    const categoryName = String(form.get('categoryName') ?? '').trim()
    if (!titleValue || !offerId || !categoryName) throw new Error('标题、Offer ID 与类目名称不能为空')
    return {
      storeId: finiteFormNumber(form, 'storeId', { required: true, positive: true }),
      productId: listingPreview.productId,
      sourceUrl: listingPreview.sourceUrl,
      title: titleValue,
      brand: String(form.get('brand') ?? '').trim() || undefined,
      offerId,
      descriptionCategoryId: finiteFormNumber(form, 'descriptionCategoryId', { required: true, positive: true }),
      typeId: finiteFormNumber(form, 'typeId', { required: true, positive: true }),
      categoryName,
      variants,
      followSourceImages: form.has('followSourceImages'),
      watermarkEnabled: form.has('watermarkEnabled'),
      randomizeImages: form.has('randomizeImages'),
      modelImagesEnabled: form.has('modelImagesEnabled'),
      floatingPriceEnabled: form.has('floatingPriceEnabled'),
    }
  }

  const renderListingDraft = (result: PanelListingDraftResult): void => {
    const target = required<HTMLElement>(body, '[data-listing-result]')
    target.innerHTML = `<section class="jz-section"><div class="jz-alert success"><strong>草稿 #${result.draftId} 已创建</strong><br>状态：${escapeHtml(result.status)} · Offer ID：${escapeHtml(result.offerId)} · 已选 ${result.selectedVariantCount} 个变体</div>${result.warnings.map(warning => `<div class="jz-alert warning">${escapeHtml(warning)}</div>`).join('')}<div class="jz-actions"><button class="jz-button danger" type="button" data-action="listing-confirm">下一步：确认提交${currentMode === 'mock' ? '模拟' : '到 Ozon'}</button></div><div data-submit-confirm></div></section>`
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const openListing = (source?: HTMLElement): void => {
    const token = open(source)
    listingPreview = undefined
    listingDraft = undefined
    setHeader('一键上架', '读取当前 Ozon 商品事实，编辑后先创建草稿，再单独确认外部提交')
    showLoading('正在读取当前商品与店铺...')
    void Promise.all([loadSettings(token), requestPanelTool<PanelListingPreview>({ type: 'PANEL_LISTING_PREVIEW' })]).then(([, response]) => {
      if (!isCurrent(token)) return
      updateModeBadge(response.mode)
      listingPreview = response.data
      renderListingForm(response.data)
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
      <div class="jz-form-item"><label class="jz-form-label required" for="jz-selection-sort">优先级</label><div class="jz-form-control"><div class="jz-priority-row"><input class="jz-input" id="jz-selection-sort" name="sort" type="number" min="0" max="100" step="1" placeholder="请输入优先级" value="${rule?.sort ?? 0}" required><span class="jz-tooltip" tabindex="0" title="注：这里优先级的意思是指当应用了多条规则时，&#10;卡片背景颜色以优先级高的规则为准。&#10;如果不理解请保持默认即可" aria-label="注：这里优先级的意思是指当应用了多条规则时，卡片背景颜色以优先级高的规则为准。如果不理解请保持默认即可">?</span></div><div class="jz-form-help">数值越大优先匹配</div></div></div>
      <div class="jz-form-item"><span class="jz-form-label">卡片背景颜色</span><div class="jz-form-control"><div class="jz-color-row"><input name="colorSet" type="hidden" value="${color ? '1' : '0'}"><input class="jz-color-input" name="color" type="color" value="${panelRuleColorInputValue(color)}" aria-label="卡片背景颜色"><span class="jz-color-text" data-selection-color-text>${escapeHtml(color ?? '不设置')}</span><button class="jz-button" type="button" data-action="selection-color-clear">清除</button></div></div></div>
      <div class="jz-form-item"><span class="jz-form-label">是否自动收藏</span><div class="jz-form-control"><div class="jz-radio-group"><label class="jz-radio"><input name="autoFavorite" type="radio" value="1" ${rule?.autoFavorite ? 'checked' : ''}>是</label><label class="jz-radio"><input name="autoFavorite" type="radio" value="0" ${rule?.autoFavorite ? '' : 'checked'}>否</label></div></div></div>
      <div class="jz-form-item"><span class="jz-form-label">品牌选项</span><div class="jz-form-control"><div class="jz-radio-group"><label class="jz-radio"><input name="brandOption" type="radio" value="1" ${conditions.brandOption === 1 ? 'checked' : ''}>有品牌</label><label class="jz-radio"><input name="brandOption" type="radio" value="0" ${conditions.brandOption === 0 ? 'checked' : ''}>无品牌</label><label class="jz-radio"><input name="brandOption" type="radio" value="2" ${conditions.brandOption === 2 ? 'checked' : ''}>不限</label></div></div></div>
      ${conditionItems}
    </form>`
  }

  const renderSelection = (): void => {
    body.setAttribute('aria-busy', 'false')
    body.innerHTML = `<div class="jz-selection-main"><div class="jz-selection-content"><div data-selection-main-error></div><div class="jz-selection-toolbar"><span>共 ${selectionRules.length} 条规则</span><button class="jz-button primary" type="button" data-action="selection-create">新增规则</button></div><div class="jz-selection-table-wrap"><table class="jz-selection-table"><colgroup><col style="width:200px"><col style="width:120px"><col style="width:120px"><col style="width:120px"><col style="width:100px"><col style="width:150px"><col style="width:150px"></colgroup><thead><tr><th>规则名称</th><th class="center">标签</th><th class="center">自动收藏</th><th class="center">是否启用</th><th class="center">优先级</th><th class="center">更新时间</th><th class="center">操作</th></tr></thead><tbody>${selectionRules.length ? selectionRules.map(rule => {
      const color = sanitizePanelRuleColor(rule.color)
      return `<tr><td>${escapeHtml(rule.name)}</td><td class="center"><span class="jz-selection-tag${color ? ' colored' : ''}" ${color ? `style="background:${color}"` : ''}>${escapeHtml(rule.tag)}</span></td><td class="center">${rule.autoFavorite ? '是' : '否'}</td><td class="center"><button class="jz-selection-switch${rule.enabled ? ' on' : ''}" type="button" role="switch" aria-checked="${rule.enabled}" data-action="selection-toggle" data-id="${rule.id}" data-enabled="${!rule.enabled}">${rule.enabled ? '启用' : '禁用'}</button></td><td class="center">${rule.sort}</td><td class="center">${escapeHtml(formatSelectionUpdatedAt(rule.updatedAt))}</td><td class="center jz-selection-action-cell"><div class="jz-selection-actions"><button class="jz-button link" type="button" data-action="selection-edit" data-id="${rule.id}">编辑</button><button class="jz-button link" type="button" data-action="selection-delete" data-id="${rule.id}">删除</button></div>${deletingRuleId === rule.id ? `<div class="jz-selection-popover" role="alertdialog" aria-label="确认删除"><div class="jz-selection-popover-title">确认删除</div><div class="jz-selection-popover-desc">确定要删除这个规则吗？删除后无法恢复。</div><div class="jz-selection-popover-actions"><button class="jz-button" type="button" data-action="selection-delete-cancel">取消</button><button class="jz-button danger" type="button" data-action="selection-delete-confirm" data-id="${rule.id}">确定</button></div></div>` : ''}</td></tr>`
    }).join('') : '<tr><td class="jz-selection-empty" colspan="7">暂无数据</td></tr>'}</tbody></table></div></div><footer class="jz-selection-footer"><button class="jz-button" type="button" data-action="selection-main-cancel">取消</button><button class="jz-button primary" type="button" data-action="selection-save">保存设置(规则生效)</button></footer></div>`
  }

  const renderSelectionEditor = (): void => {
    root.querySelector('[data-selection-layer]')?.remove()
    if (!selectionEditorOpen) return
    const layer = document.createElement('div')
    layer.className = 'jz-selection-layer'
    layer.dataset.selectionLayer = ''
    layer.innerHTML = `<div class="jz-selection-editor-mask"></div><section class="jz-selection-editor" role="dialog" aria-modal="true" aria-labelledby="jz-selection-editor-title"><header class="jz-selection-editor-head"><h3 class="jz-selection-editor-title" id="jz-selection-editor-title">${editingRule ? '编辑选品规则' : '新增选品规则'}</h3><button class="jz-icon-button" type="button" data-action="selection-editor-close" aria-label="关闭">✕</button></header><div class="jz-selection-editor-body">${selectionEditorFormHtml(editingRule)}</div><footer class="jz-selection-editor-footer"><button class="jz-button" type="button" data-action="selection-editor-cancel">取消</button><button class="jz-button primary" type="submit" form="jz-selection-editor-form">${editingRule ? '保存' : '确定'}</button></footer></section>`
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

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null
    if (!target) return
    const action = target.dataset.action
    if (action === 'close') {
      if (target.classList.contains('jz-tools-backdrop') && surface.classList.contains('selection')) return
      close()
    }
    else if (action === 'settings') openErp(target)
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
    const form = target.closest<HTMLFormElement>('form[data-form="selection-rule"]')
    if (!form) return
    if (target.name === 'color') {
      required<HTMLInputElement>(form, 'input[name="colorSet"]').value = '1'
      required<HTMLElement>(form, '[data-selection-color-text]').textContent = target.value
    }
    if (target.name === 'name' || target.name === 'tag') {
      const maximum = target.name === 'name' ? 15 : 6
      const count = form.querySelector<HTMLElement>(`[data-count-for="${target.name}"]`)
      if (count) count.textContent = `${target.value.length}/${maximum}`
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
        void requestPanelTool<PanelListingDraftResult>({ type: 'PANEL_LISTING_PREPARE', input }).then((response) => {
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
        required<HTMLElement>(formElement, '[data-listing-result]').innerHTML = `<div class="jz-alert" role="alert" style="margin-top:14px">${escapeHtml(errorMessage(error))}</div>`
        submit?.removeAttribute('disabled')
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
    void browser.storage.local.set({ [DRAWER_WIDTH_KEY]: Math.round(surface.getBoundingClientRect().width) })
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
      root.remove()
      shadow.querySelector('#jingzhi-panel-tools-style')?.remove()
    },
  }
  return controller
}