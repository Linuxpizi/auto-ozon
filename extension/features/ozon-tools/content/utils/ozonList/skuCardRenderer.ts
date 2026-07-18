import { resolveAssetUrl } from '../../../utils/runtime'
import { showToast } from '../../../utils/toast'
import { API_CONFIG } from '../../../utils/api-config'
import copyImg from '../../../assets/img/copy.png'
import newProductImg from '../../../assets/img/newProduct.png'
import fallbackNewLogo from '../../../assets/img/newlogo.png'
import { bindCardHeadActions } from './cardHeadActions'
import {
  calculateDaysDifferenceAndFormat,
  commissionTipTitleFromValues,
  commissionValue,
  dashIfEmpty,
  formatCardCountWithCommas,
  formatCardVolumeLiters,
  formatCommissionBoxDisplay,
  formatFollowPriceWithCnyApprox,
  formatMonthlySalesRubLine,
  formatNumericPriceForCopy,
  formatPercentOneDecimal,
  formatPercentTwoDecimalsFromRaw,
  formatSalesDynamicsHtml,
  isListingWithinPastDays,
  parseOzonRubPriceText,
} from '../ozonListShared/formatters'
import type { OzonSkuCardData } from './types'
import { applyCardFieldLayout } from '../ozonCardSettings/cardFieldStore'
import { ensureCardExtraRows } from './loadCardExtraData'
import { bindCardImageSearchActions } from './imageSearchActions'
import { openQuickShelve } from '../ozonQuickShelve/quickShelveController'
import { openEditUploadPopup } from '../ozonEditUpload/editUploadPopup'
import { commissionActiveTierFromPriceRub, getPriceRubFromContext } from '../ozonSelectionRules/matchUtils'
import { getCardListPriceText } from '../ozonSelectionRules/cardData'
import { collectDetailVariants, readDetailPriceText, type DetailVariant } from './detailPageContext'
import { isOzonProductPath } from './ozonPageContext'
import {
  INLINE_PROFIT_PANEL_HTML,
  notifyInlineProfitDataLoaded,
} from '../ozonProfitCalc/inlineProfitCalc'
import { getCalcLocalPrefs, hasCalcLocalPrefs } from '../ozonProfitCalc/calcLocalPrefs'

const localToolLogoUrl = resolveAssetUrl('src/assets/img/newlogo.png', fallbackNewLogo)
// 「新品」NEW 角标图：content-script 里裸 import 会解析成站点根路径(/newProduct.png)导致 404，
// 必须走 chrome.runtime.getURL（见 manifest web_accessible_resources: src/assets/img/*）。
const newProductUrl = resolveAssetUrl('src/assets/img/newProduct.png', newProductImg)

const SETTING_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
const PROFIT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><rect x="8" y="6" width="8" height="4" rx="1"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>'
const OZON_SEARCH_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
const ALI_SEARCH_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'

const COMMISSION_TIP_LOADING =
  '售价<1500卢布：加载中；1500卢布≤售价≤5000卢布：加载中；售价>5000卢布：加载中'

export interface PlaceholderCardOptions {
  isDetail?: boolean
}

function buildCardToolButtons(sku: string, img?: string, showSettingBtn = true): string {
  const imgAttr = img ? ` data-value="${img}" data-img-url="${img}"` : ''
  const settingBtn = showSettingBtn
    ? `<span class="bcs-card-circle-btn bcs-card-setting-btn" data-tooltip="卡片字段配置">${SETTING_SVG}</span>`
    : ''
  return `
    <div class="bcs-list-card-actions mjgd_ozon_card_tools">
      ${settingBtn}
      <span class="bcs-card-profit-btn-wrap"><span class="bcs-card-circle-btn bcs-card-profit-btn" data-sku="${sku}" data-tooltip="计算利润">${PROFIT_SVG}</span></span>
      <span class="bcs-card-circle-btn mjgd_ozon_img_search_btn" data-action="img_search_ozon"${imgAttr} data-tooltip="ozon以图搜图">${OZON_SEARCH_SVG}</span>
      <span class="bcs-card-circle-btn mjgd_ozon_img_search_btn" data-action="img_search_1688"${imgAttr} data-tooltip="1688以图搜图">${ALI_SEARCH_SVG}</span>
    </div>
  `
}

function buildCardHead(sku: string, productImg: string | undefined, options?: { loaded?: boolean }): string {
  const loaded = options?.loaded ?? false
  const variant = loaded ? 'loaded' : 'placeholder'
  const logoSize = 20
  const brandText = loaded ? 'Ozon 商品' : '加载中...'
  const logoHtml = `<img src="${localToolLogoUrl}" alt="" class="mjgd_ozon_card_logo" width="${logoSize}" height="${logoSize}" />`
  return `<div class="mjgd_ozon_card_head bcs-list-card-head bcs-list-card-head--${variant}">${logoHtml}<h3 class="bcs-list-card-brand"><span class="bcs-list-card-brand-full mjgd_ozon_card_loading">${brandText}</span><span class="bcs-list-card-brand-short">Ozon</span></h3>${buildCardToolButtons(sku, productImg, true)}</div>`
}

function fieldSpan(className: string, content: string): string {
  return `<span class="e1fbcs-item-data ${className}">${content}</span>`
}

function buildCommissionPlaceholderRow(
  label: string,
  fieldKey: string,
  rowClass: string,
): string {
  return `<p class="mjgd_ozon_card_row mjgd_ozon_commission_row ${rowClass} mjgd_ozon_blur_target" data-field-key="${fieldKey}">
    <span style="color:#5C5C5C">${label}</span><span class="commission-tip" data-tip="${COMMISSION_TIP_LOADING}">?</span>:
    <span class="commission-box commission-box-1">加载中...</span>
    <span class="commission-box commission-box-2">加载中...</span>
    <span class="commission-box commission-box-3">加载中...</span>
  </p>`
}

function buildDetailShopRows(): string {
  return `
    <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="shopId">
      店铺ID: <span class="mjgd_ozon_field_shop_id e1fbcs-item-data shop-id-placeholder" style="color:#ab5f08">加载中...</span>
      <a class="mjgd_ozon_shop_traffic_link" href="#" target="_blank" rel="noopener" style="opacity:.65;pointer-events:none;font-size:11px;margin-left:6px">查看店铺商品流量</a>
    </p>
    <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="corpName">
      公司名称: <span class="mjgd_ozon_field_corp_name e1fbcs-item-data corp-name-placeholder" style="color:#ab5f08">加载中...</span><span class="corp-translate-btn mjgd_ozon_corp_translate_btn" title="翻译/还原公司名称">译</span>
    </p>
    <p class="mjgd_ozon_card_row" data-field-key="subjectTags">
      主题标签: <span class="mjgd_ozon_field_subject_tags e1fbcs-item-data" style="color:#081eab">--</span>
    </p>
  `
}

function buildCardActions(sku: string, isDetail = false): string {
  const priceRow = isDetail
    ? `<p class="mjgd_ozon_price_row mjgd_ozon_price_row--detail">价格输入：<input class="mjgd_ozon_price_input price-input" id="pricess" type="text" placeholder="请输入" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="bcs_price_input" /></p>`
    : `<p class="mjgd_ozon_price_row mjgd_ozon_price_row--list"><label class="mjgd_ozon_price_label">价格：</label><input class="mjgd_ozon_price_input price-input" type="text" placeholder="请输入" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="bcs_price_input" /></p>`
  return `
    <div class="mjgd_ozon_card_actions">
      ${priceRow}
      <div class="mjgd_ozon_copy_row">
        <button type="button" class="mjgd_ozon_copy_sku_btn bcs-action-btn bcs-action-btn--secondary" data-action="copy_sku_only" data-sku="${sku}">仅复制SKU</button>
        <button type="button" class="mjgd_ozon_copy_price_btn bcs-action-btn bcs-action-btn--primary one_prices" data-action="copy_sku_price" data-sku="${sku}">
          <span class="bcs-one-prices-text">复制SKU,价格</span>
          <span class="bcs-copy-price-tip" data-tip="未自定义价格时复制商品现价，填写后复制自定义价格">!</span>
        </button>
      </div>
      <div class="mjgd_ozon_quick_shelve_row">
        <button type="button" class="edit_upload_data bcs-action-btn bcs-action-btn--primary" data-action="edit_upload" data-sku="${sku}">编辑上架</button>
        <button type="button" class="quick_upload_btn bcs-action-btn bcs-action-btn--secondary" data-action="quick_shelve" data-sku="${sku}">急速上架</button>
      </div>
    </div>
  `
}

function bindCardQuickShelveAction(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-action="quick_shelve"]').forEach((el) => {
    if (el.dataset.boundQuickShelve === '1') return
    el.dataset.boundQuickShelve = '1'
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const sku = el.getAttribute('data-sku') || ''
      if (!sku) return
      void openQuickShelve({ targetSku: sku })
    })
  })
}

function bindCardEditUploadAction(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-action="edit_upload"]').forEach((el) => {
    if (el.dataset.boundEditUpload === '1') return
    el.dataset.boundEditUpload = '1'
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      // 弹出「选择编辑上架方式」（当前变体 / 全部变体），移植旧版 .edit_upload_data 行为
      openEditUploadPopup(el)
    })
  })
}

/** 生成加载中占位卡片（对齐旧版 generatePlaceholderHtml 全字段 DOM） */
export function renderPlaceholderCard(sku: string, img?: string, options?: PlaceholderCardOptions): string {
  const isDetail = options?.isDetail ?? isOzonProductPath()
  const detailRows = isDetail ? buildDetailShopRows() : ''
  const moreDataUrl =
    `${API_CONFIG.LOCAL_FRONTEND_URL.replace(/\/$/, '')}/selectionZone/hotGoods` +
    `?tab=Sellerstats&filterArticle=${encodeURIComponent(sku)}`
  // 内嵌利润计算器：列表页默认隐藏；详情页跟随后端偏好「商品详情页默认展开」。
  // 配置未就绪时先按收起渲染，避免"先展开再收起"的闪动，待 loadProfitCalcConfig
  // 返回后由 applyDetailPanelExpandFromPrefs 校正为真实值。
  const inlineProfitPanel = INLINE_PROFIT_PANEL_HTML(sku, null, {
    defaultVisible:
      isDetail && hasCalcLocalPrefs() ? getCalcLocalPrefs().detailExpandDefault : false,
    page: isDetail ? 'detail' : 'list',
  })
  // 「新品」NEW 角标：详情/列表用不同类名（定位像素值不同，见 ozonListCard.scss）
  const newBadgeClass = isDetail ? 'bcs-new-product-icon' : 'bcs-new-product-icon-list'
  return `
    <div class="mjgd_ozon_sku_card e1fbcs bcs-list-card" data-sku="${sku}"${img ? ` data-product-img="${img}"` : ''}>
      ${buildCardHead(sku, img)}
      ${inlineProfitPanel}
      <div class="bcs-list-card-body">
      <p class="mjgd_ozon_card_row" data-field-key="sku" style="display:flex;justify-content:space-between;">
        <span>
          <span style="font-weight:normal;">sku: </span>
          <span class="skuClick mjgd_ozon_sku_val" data-sku="${sku}" style="display:inline-flex;align-items:center;gap:4px;vertical-align:middle;">
            ${sku}<img src="${copyImg}" alt="" title="复制" class="mjgd_ozon_copy_icon" data-action="copy_sku" data-sku="${sku}" width="14" height="14" style="cursor:pointer;vertical-align:middle;flex-shrink:0;" /><img src="${newProductUrl}" alt="新品" title="30天内上架" class="${newBadgeClass}" style="display:none;" />
          </span>
        </span>
        <a href="${moreDataUrl}" target="_blank" rel="noopener" class="mjgd_ozon_more_link view-more-link">更多数据</a>
      </p>
      <p class="mjgd_ozon_card_row mjgd_ozon_card_muted bcs-hide-article-brand mjgd_ozon_blur_target" data-field-key="article">货号: ${fieldSpan('mjgd_ozon_field_article article-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_card_muted bcs-hide-article-brand mjgd_ozon_blur_target" data-field-key="brand">品牌: ${fieldSpan('mjgd_ozon_field_brand brand-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="category">类目: ${fieldSpan('mjgd_ozon_field_catname catname-placeholder', '加载中...')}</p>
      ${buildCommissionPlaceholderRow('FBS佣金', 'fbsCommission', 'fbs-commission-row')}
      ${buildCommissionPlaceholderRow('FBP佣金', 'fbpCommission', 'fbp-commission-row')}
      <p class="mjgd_ozon_card_row p_monthsales" data-field-key="monthlySales"><span class="mjgd_ozon_field_monthsales monthsales">月销量: 加载中...</span></p>
      <p class="mjgd_ozon_card_row" data-field-key="monthlyRevenue">月销售额: ${fieldSpan('mjgd_ozon_field_gmv gmv-placeholder e1fbcs-value-blue mjgd_ozon_blur_target', '加载中...')}</p>
      <p class="mjgd_ozon_card_row" data-field-key="salesDynamics">月周转动态: ${fieldSpan('mjgd_ozon_field_sales_dynamics sales-dynamics-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="adCostRatio">广告费用占比: ${fieldSpan('mjgd_ozon_field_drr drr-placeholder e1fbcs-value-blue', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="promoDays">参与促销天数: ${fieldSpan('mjgd_ozon_field_promo_days promo-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="promoDiscount">参与促销的折扣: ${fieldSpan('mjgd_ozon_field_promo_discount discount-rate-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="promoConversion">促销活动的转化率: ${fieldSpan('mjgd_ozon_field_promo_conv promo-conv-placeholder e1fbcs-value-blue', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="paidPromoDays">付费推广天数: ${fieldSpan('mjgd_ozon_field_paid_promo trafarets-placeholder e1fbcs-value-blue', '加载中...')}</p>
      <p class="mjgd_ozon_card_row" data-field-key="followSellers">
        <span class="bcs-gnumber-row mjgd_ozon_field_gnumber_wrap" data-sku="${sku}" style="color:#ec0889">
          <span class="bcs-gnumber-chip"><span class="bcs-gnumber-label">跟卖列表:</span><span class="bcs-gnumber-clickable"><span class="gnumber-value mjgd_ozon_field_gnumber">加载中...</span>个跟卖卖家</span></span>
        </span>
      </p>
      <p class="mjgd_ozon_card_row mjgd_ozon_field_follow mjgd_ozon_blur_target" data-field-key="followMinPrice">
        <a class="bcs-follow-price-link bcs-follow-price-link--min" href="#" target="_blank" rel="noopener">跟卖最低价:<span class="bcs-follow-min-price-val mjgd_ozon_field_price_min">加载中...</span></a>
      </p>
      <p class="mjgd_ozon_card_row mjgd_ozon_field_follow mjgd_ozon_blur_target" data-field-key="followMaxPrice">
        <a class="bcs-follow-price-link" href="#" target="_blank" rel="noopener">跟卖最高价:<span class="bcs-follow-max-price-val mjgd_ozon_field_price_max">加载中...</span></a>
      </p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="cardViews">商品卡浏览量: ${fieldSpan('mjgd_ozon_field_card_views sessioncount-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="cartRate">商品卡加购率: ${fieldSpan('mjgd_ozon_field_cart_rate cart-conv-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="searchViews">搜索目录浏览量: ${fieldSpan('mjgd_ozon_field_search_views search-views-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="searchCartRate">搜索目录加购率: ${fieldSpan('mjgd_ozon_field_search_cart search-dir-cart-placeholder', '--')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="totalViews">商品展示总量: ${fieldSpan('mjgd_ozon_field_total_views views-count-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="viewConversion">展示转化率: ${fieldSpan('mjgd_ozon_field_view_conv conv-view-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="clickRate">商品点击率: ${fieldSpan('mjgd_ozon_field_click_rate product-click-rate-placeholder e1fbcs-value-orange', '--')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="shipMode">发货模式: ${fieldSpan('mjgd_ozon_field_ship_mode sources-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="returnRate">退货取消率: ${fieldSpan('mjgd_ozon_field_return_rate return-cancel-rate-placeholder e1fbcs-value-red', '--')}</p>
      <p class="mjgd_ozon_card_row" data-field-key="volume">体积: ${fieldSpan('mjgd_ozon_field_volume volume-placeholder', '加载中...')} 公升(长x宽x高)</p>
      <p class="mjgd_ozon_card_row" data-field-key="avgPrice">平均价格: ${fieldSpan('mjgd_ozon_field_avg_price avgprice-placeholder', '加载中...')}</p>
      <p class="mjgd_ozon_card_row" data-field-key="dimensions">长 宽 高: ${fieldSpan('mjgd_ozon_field_packaging', '--')}</p>
      <p class="mjgd_ozon_card_row" data-field-key="weight">重量: ${fieldSpan('mjgd_ozon_field_packaging_weight', '--')}</p>
      <p class="mjgd_ozon_card_row" data-field-key="listDate">上架时间: ${fieldSpan('mjgd_ozon_field_list_date create-date-placeholder', '加载中...')}</p>
      ${detailRows}
      ${buildCardActions(sku, isDetail)}
      </div>
    </div>
  `
}

function readPriceRubFromCard(card: HTMLElement): number | null {
  const listPrice = getCardListPriceText(card)
  if (listPrice) {
    const rub = getPriceRubFromContext(listPrice)
    if (rub !== null) return rub
  }
  if (isOzonProductPath()) {
    const rub = getPriceRubFromContext(readDetailPriceText())
    if (rub !== null) return rub
  }
  return null
}

function updateCommissionRow(
  card: HTMLElement,
  fieldKey: string,
  comm: OzonSkuCardData['commission'] | null | undefined,
  prefix: 'rfbs' | 'fbp',
  tier: number,
) {
  // 对齐旧版 handlers.js:updateLocalData 的佣金分支：
  // 只要 row 存在就无条件刷新三档 box，comm 为空时 commissionValue → '--'，
  // 避免后端 commission 字段缺失导致占位"加载中..."永久残留。
  const row = card.querySelector<HTMLElement>(`[data-field-key="${fieldKey}"]`)
  if (!row) return
  const k1 = prefix === 'rfbs' ? comm?.rfbs1500 : comm?.fbp1500
  const k2 = prefix === 'rfbs' ? comm?.rfbs1500To5000 : comm?.fbp1500To5000
  const k3 = prefix === 'rfbs' ? comm?.rfbsGreater5000 : comm?.fbpGreater5000
  const v1 = commissionValue(k1)
  const v2 = commissionValue(k2)
  const v3 = commissionValue(k3)
  const tip = row.querySelector<HTMLElement>('.commission-tip')
  if (tip) {
    tip.setAttribute('data-tip', commissionTipTitleFromValues(k1, k2, k3))
  }
  const boxes = row.querySelectorAll<HTMLElement>('.commission-box')
  const values = [v1, v2, v3]
  boxes.forEach((box, idx) => {
    box.className = `commission-box commission-box-${idx + 1}${tier === idx ? ' commission-box--active' : ''}`
    box.innerHTML = formatCommissionBoxDisplay(values[idx], tier === idx)
  })
}

function setInnerHtml(card: HTMLElement, sel: string, html: string) {
  const el = card.querySelector(sel)
  if (el) el.innerHTML = html
}

function setText(card: HTMLElement, sel: string, text: string) {
  const el = card.querySelector(sel)
  if (el) el.textContent = text
}

/**
 * 「新品」NEW 角标显隐：上架时间在 30 天内才显示（对齐旧版 handlers.js）。
 * 角标已随卡片模板渲染在 SKU 行 <p> 内，绝对定位锚在该行（见 ozonListCard.scss）。
 */
function applyNewProductBadge(card: HTMLElement, createDate: unknown) {
  const show = isListingWithinPastDays(createDate, 30)
  card
    .querySelectorAll<HTMLElement>('.bcs-new-product-icon, .bcs-new-product-icon-list')
    .forEach((icon) => {
      icon.style.display = show ? '' : 'none'
    })
}

/** 将 API 数据填充到已注入的卡片 DOM */
export function fillCardWithData(card: HTMLElement, data: OzonSkuCardData) {
  setText(card, '.mjgd_ozon_field_article', dashIfEmpty(data.article))
  setText(card, '.mjgd_ozon_field_brand', dashIfEmpty(data.brand))
  setText(card, '.mjgd_ozon_field_catname', dashIfEmpty(data.catname))
  setText(card, '.mjgd_ozon_field_monthsales', `月销量: ${dashIfEmpty(data.monthsales)}`)
  setInnerHtml(card, '.mjgd_ozon_field_gmv', formatMonthlySalesRubLine(data.gmvSum, data.monthsales))
  setInnerHtml(card, '.mjgd_ozon_field_sales_dynamics', formatSalesDynamicsHtml(data.salesDynamics))
  setText(card, '.mjgd_ozon_field_drr', formatPercentTwoDecimalsFromRaw(data.drr))
  setText(card, '.mjgd_ozon_field_promo_days', dashIfEmpty(data.daysInPromo))
  setText(card, '.mjgd_ozon_field_promo_discount', formatPercentTwoDecimalsFromRaw(data.discount))
  setText(card, '.mjgd_ozon_field_promo_conv', formatPercentTwoDecimalsFromRaw(data.promoRevenueShare))
  setText(card, '.mjgd_ozon_field_paid_promo', dashIfEmpty(data.daysWithTrafarets))
  if (data.gnumber != null && data.gnumber !== '') {
    setText(card, '.mjgd_ozon_field_gnumber', String(data.gnumber))
  }
  setText(card, '.mjgd_ozon_field_card_views', formatCardCountWithCommas(data.sessioncount))
  setText(card, '.mjgd_ozon_field_cart_rate', formatPercentTwoDecimalsFromRaw(data.convTocartPdp))
  setText(card, '.mjgd_ozon_field_search_views', formatCardCountWithCommas(data.sessionCountSearch))
  setText(card, '.mjgd_ozon_field_search_cart', formatPercentOneDecimal(data.convToCartSearchRate))
  setText(card, '.mjgd_ozon_field_total_views', formatCardCountWithCommas(data.views))
  setText(card, '.mjgd_ozon_field_view_conv', formatPercentTwoDecimalsFromRaw(data.convViewToOrder))
  setText(card, '.mjgd_ozon_field_click_rate', formatPercentOneDecimal(data.goodsClickRate))
  setText(card, '.mjgd_ozon_field_ship_mode', dashIfEmpty(data.sources))
  setText(card, '.mjgd_ozon_field_return_rate', formatPercentOneDecimal(data.returnCancelRate))
  setText(card, '.mjgd_ozon_field_volume', formatCardVolumeLiters(data.volume))
  setText(card, '.mjgd_ozon_field_avg_price', data.avgprice ? `${data.avgprice} ₽` : '--')
  setText(
    card,
    '.mjgd_ozon_field_list_date',
    data.createDate ? calculateDaysDifferenceAndFormat(data.createDate) : '--',
  )
  // 上架时间在 30 天内时，在 Ozon 商品格子/详情容器右上角叠加「NEW」角标
  applyNewProductBadge(card, data.createDate)
  const brandFull = card.querySelector('.bcs-list-card-brand-full')
  if (brandFull) brandFull.textContent = data.brand || 'Ozon 商品'
  // 对齐旧版列表：头部始终保持 placeholder 样式，不切换 head--loaded（避免负偏移把顶栏按钮顶出卡片）
  if (data.gnumber != null || data.priceMin != null || data.priceMax != null) {
    applyFollowFieldsToCard(card, {
      gnumber: data.gnumber,
      priceMin: data.priceMin,
      priceMax: data.priceMax,
      priceMinSku: data.priceMinSku,
      priceMaxSku: data.priceMaxSku,
    })
  }

  const priceRub = readPriceRubFromCard(card)
  const tier = commissionActiveTierFromPriceRub(priceRub)
  // 无条件刷新两行佣金占位：comm 为空时降级为 '--'，与旧版行为一致。
  updateCommissionRow(card, 'fbsCommission', data.commission, 'rfbs', tier)
  updateCommissionRow(card, 'fbpCommission', data.commission, 'fbp', tier)

  ensureCardExtraRows(card)
  syncCardImageSearchButtons(card)

  // 同步卡片接口数据到内嵌利润计算器（commission 三档兜底 + 卢布参考价）
  const sku = card.getAttribute('data-sku') || ''
  if (sku) {
    notifyInlineProfitDataLoaded(sku, { commission: data.commission as any }, priceRub ?? 0)
  }

  card.classList.add('is_loaded')
  applyCardFieldLayout(card)
}

export interface FollowFieldsPatch {
  gnumber?: number | string | null
  priceMin?: number | string | null
  priceMax?: number | string | null
  priceMinSku?: string | number
  priceMaxSku?: string | number
  /** 原价币种符号（₽/$/¥），决定展示符号与 ≈￥ 换算系数；空则按卢布 */
  priceUnit?: string
}

function productOrigin(): string {
  return /ozon\.kz/i.test(window.location.hostname) ? 'https://ozon.kz' : 'https://www.ozon.ru'
}

/** 更新跟卖列表/最低价/最高价 DOM */
export function applyFollowFieldsToCard(card: HTMLElement, patch: FollowFieldsPatch) {
  setText(card, '.mjgd_ozon_field_gnumber', dashIfEmpty(patch.gnumber))

  const minSku = String(patch.priceMinSku || '')
  const maxSku = String(patch.priceMaxSku || '')
  const minLink = card.querySelector<HTMLAnchorElement>('[data-field-key="followMinPrice"] a')
  const maxLink = card.querySelector<HTMLAnchorElement>('[data-field-key="followMaxPrice"] a')
  const origin = productOrigin()

  if (minLink) {
    minLink.href = minSku ? `${origin}/product/${minSku}` : '#'
    const minVal = minLink.querySelector('.mjgd_ozon_field_price_min')
    if (minVal) {
      minVal.innerHTML = formatFollowPriceWithCnyApprox(patch.priceMin, patch.priceUnit)
    }
  }
  if (maxLink) {
    maxLink.href = maxSku ? `${origin}/product/${maxSku}` : '#'
    const maxVal = maxLink.querySelector('.mjgd_ozon_field_price_max')
    if (maxVal) {
      maxVal.innerHTML = formatFollowPriceWithCnyApprox(patch.priceMax, patch.priceUnit)
    }
  }

  // 只更新数据，不强制 display。跟卖三行（followSellers/followMinPrice/followMaxPrice）
  // 的显隐完全交由「卡片字段配置」（applyCardFieldVisibility）掌控——本函数由异步跟卖加载器
  // (loadCardFollowData) 调用，若在此强制 display=''，会覆盖用户在偏好里隐藏这些字段的设置，
  // 导致跟卖请求最后返回的卡片把已隐藏的行又显示出来。占位 HTML 默认即可见，无需在此兜底。
}

/** 同步以图搜图按钮的商品图 URL（来自 data-product-img，非 BCS logo） */
export function syncCardImageSearchButtons(card: HTMLElement) {
  const img = card.dataset.productImg || ''
  if (!img) return
  card.querySelectorAll<HTMLElement>('[data-action^="img_search"]').forEach((btn) => {
    btn.dataset.imgUrl = img
    btn.dataset.value = img
  })
}

/** API 失败时将占位文案替换为 -- */
export function markCardFillFailed(card: HTMLElement) {
  card.querySelectorAll<HTMLElement>(
    '.article-placeholder, .brand-placeholder, .catname-placeholder, .gmv-placeholder, .sales-dynamics-placeholder, .drr-placeholder, .promo-placeholder, .discount-rate-placeholder, .promo-conv-placeholder, .trafarets-placeholder, .sessioncount-placeholder, .cart-conv-placeholder, .search-views-placeholder, .views-count-placeholder, .conv-view-placeholder, .sources-placeholder, .volume-placeholder, .avgprice-placeholder, .create-date-placeholder, .commission-box',
  ).forEach((el) => {
    el.textContent = '--'
  })
  const gnumber = card.querySelector('.mjgd_ozon_field_gnumber')
  if (gnumber?.textContent?.includes('加载中')) gnumber.textContent = '--'
  const followVals = card.querySelectorAll('.mjgd_ozon_field_price_min, .mjgd_ozon_field_price_max')
  followVals.forEach((el) => {
    if (el.textContent?.includes('加载中')) el.textContent = '--'
  })
  const brandFull = card.querySelector('.bcs-list-card-brand-full')
  if (brandFull) brandFull.textContent = 'Ozon 商品'
}

/** webAspects 变体现价原文 → 复制用价格（解析卢布/币种文本，失败则去空格原样返回） */
function variantPriceForCopy(v: DetailVariant): string {
  const n = parseOzonRubPriceText(v.priceText)
  if (Number.isFinite(n)) return formatNumericPriceForCopy(n)
  return v.priceText.replace(/\s+/g, '').trim()
}

function resolveCardPriceForCopy(card: HTMLElement, sku: string): string {
  const input = card.querySelector<HTMLInputElement>('.mjgd_ozon_price_input')
  const custom = String(input?.value || '').trim()
  if (custom) return custom

  const listPrice = getCardListPriceText(card)
  if (listPrice) {
    const n = parseOzonRubPriceText(listPrice)
    if (Number.isFinite(n)) return formatNumericPriceForCopy(n)
    const stripped = listPrice.replace(/\s+/g, '').trim()
    if (stripped) return stripped
  }

  if (isOzonProductPath()) {
    const detailPrice = readDetailPriceText()
    const n = parseOzonRubPriceText(detailPrice)
    if (Number.isFinite(n)) return formatNumericPriceForCopy(n)
    const stripped = detailPrice.replace(/\s+/g, '').trim()
    if (stripped) return stripped
  }

  return sku ? '' : ''
}

/** 绑定卡片内复制点击 */
export function bindCardCopyActions(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-action="copy_sku"]').forEach((el) => {
    if (el.dataset.bound === '1') return
    el.dataset.bound = '1'
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const sku = el.getAttribute('data-sku') || ''
      if (sku) void navigator.clipboard.writeText(sku).then(() => showToast('复制成功！'))
    })
  })

  root.querySelectorAll<HTMLElement>('[data-action="copy_sku_only"]').forEach((el) => {
    if (el.dataset.boundCopyOnly === '1') return
    el.dataset.boundCopyOnly = '1'
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const sku = el.getAttribute('data-sku') || ''
      // 详情页：复制当前商品全部变体 SKU（对齐旧版 one_pricesSku）；列表页/单变体回退单个 SKU
      let text = sku
      if (isOzonProductPath()) {
        const variants = collectDetailVariants()
        if (variants.length) text = variants.map((v) => v.sku).join('\n')
      }
      if (!text) return
      void navigator.clipboard.writeText(text).then(
        () => showToast('复制成功！'),
        () => showToast('复制失败！'),
      )
    })
  })

  root.querySelectorAll<HTMLElement>('[data-action="copy_sku_price"]').forEach((el) => {
    if (el.dataset.boundCopyPrice === '1') return
    el.dataset.boundCopyPrice = '1'
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const sku = el.getAttribute('data-sku') || ''
      const card = el.closest('.mjgd_ozon_sku_card') as HTMLElement | null
      if (!sku || !card) return

      // 详情页：复制全部变体「SKU,价格」（对齐旧版 handleOnePricesClick）
      // 输入框有值 → 所有变体用该自定义价；为空 → 各变体用自身现价，当前变体兜底用卡片现价
      if (isOzonProductPath()) {
        const variants = collectDetailVariants()
        if (variants.length) {
          const input = card.querySelector<HTMLInputElement>('.mjgd_ozon_price_input')
          const custom = String(input?.value || '').trim()
          const lines = variants.map((v) => {
            let price = custom
            if (!price) price = variantPriceForCopy(v)
            if (!price && v.sku === sku) price = resolveCardPriceForCopy(card, sku)
            return `${v.sku},${price}`
          })
          void navigator.clipboard.writeText(lines.join('\n')).then(
            () => showToast('复制成功！'),
            () => showToast('复制失败！'),
          )
          return
        }
      }

      // 列表页 / 单变体兜底：单个 SKU,价格
      const price = resolveCardPriceForCopy(card, sku)
      if (!price) {
        showToast('未识别到该SKU对应价格，请先输入价格后再复制！')
        return
      }
      void navigator.clipboard.writeText(`${sku},${price}`).then(
        () => showToast('复制成功！'),
        () => showToast('复制失败！'),
      )
    })
  })

  bindCardImageSearchActions(root)
  bindCardHeadActions(root)
  bindCardEditUploadAction(root)
  bindCardQuickShelveAction(root)
}
