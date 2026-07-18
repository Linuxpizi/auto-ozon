import { applyCardFieldLayout, isCardFieldEnabled, isCardFieldPreferenceLoaded } from '../ozonCardSettings/cardFieldStore'
import { applySelectionTagForCard } from '../ozonSelectionRules'
import { formatPackagingDimsLong, formatPackagingWeightG } from '../ozonListShared/formatters'
import { loadSellerInfoToCard, watchSellerInfoForCard } from './sellerInfo'
import { collectOzonSkuMetrics, type OzonCharacteristic } from './ozonMetricCollector'
import { parsePackagingAttrs, type PackagingInfo } from './ozonPackagingParser'
import {
  notifyInlineProfitPackagingFilled,
} from '../ozonProfitCalc/inlineProfitCalc'

/**
 * 仅「详情主卡」才补全店铺ID / 公司名称 / 主题标签三行。详情主卡在注入时会被打上
 * mjgd_ozon_detail_card 类（detailPageService.ensureCardOnHost）。
 *
 * 注意：不能用页面级 isOzonProductPath() 判断——详情页下方「相似商品/加载更多」也是
 * 列表卡（isDetail:false 渲染），它们同样运行在 /product/ 路径下。用页面级判断会把详情
 * 主卡的店铺信息错误地灌进这些列表卡。对齐旧版：列表占位 generatePlaceholderHtml 不含这
 * 三行，仅详情占位 generateDetailPagePlaceholderHtml 才含（LIST_PAGE_HIDDEN_FIELDS）。
 */
function isDetailMainCard(card: HTMLElement): boolean {
  return card.classList.contains('mjgd_ozon_detail_card')
}

/** 内嵌利润面板当前可见（展开态需 categories/包装数据） */
function isInlineProfitPanelVisible(card: HTMLElement): boolean {
  const panel = card.querySelector<HTMLElement>('.bcs-ipc-root')
  return !!panel && panel.style.display !== 'none'
}

/** 包装/主题标签字段或利润面板可见时才需解析 Ozon Page2 属性。 */
export function needsCardShopsApi(card: HTMLElement): boolean {
  if (!isCardFieldPreferenceLoaded()) return true
  if (isCardFieldEnabled('dimensions') || isCardFieldEnabled('weight')) return true
  if (isDetailMainCard(card) && isCardFieldEnabled('subjectTags')) return true
  if (isInlineProfitPanelVisible(card)) return true
  return false
}

const shopsLoadInFlight = new WeakMap<HTMLElement, Promise<void>>()

/** 利润面板展开等场景补拉 shops（贴卡时曾跳过） */
export function lazyLoadCardShopsIfNeeded(card: HTMLElement | null, sku: string): void {
  if (!card || !sku || card.dataset.shopsLoaded === '1') return
  if (shopsLoadInFlight.has(card)) return
  if (!needsCardShopsApi(card)) return
  void loadCardExtraData(card, sku)
}

/** 确保包装/详情专属行已注入（占位 --，异步填充） */
export function ensureCardExtraRows(card: HTMLElement) {
  const insertBefore = card.querySelector('.mjgd_ozon_card_actions')

  const rows: Array<{ key: string; html: string }> = [
    {
      key: 'dimensions',
      html: '<p class="mjgd_ozon_card_row" data-field-key="dimensions">长 宽 高: <span class="mjgd_ozon_field_packaging">--</span></p>',
    },
    {
      key: 'weight',
      html: '<p class="mjgd_ozon_card_row" data-field-key="weight">重量: <span class="mjgd_ozon_field_packaging_weight">--</span></p>',
    },
  ]

  if (isDetailMainCard(card)) {
    rows.push(
      {
        key: 'shopId',
        html:
          '<p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="shopId">' +
          '店铺ID: <span class="mjgd_ozon_field_shop_id e1fbcs-item-data shop-id-placeholder" style="color:#ab5f08">加载中...</span> ' +
          '<a class="mjgd_ozon_shop_traffic_link" href="#" target="_blank" rel="noopener" ' +
          'style="opacity:.65;pointer-events:none;font-size:11px;margin-left:6px">查看店铺商品流量</a></p>',
      },
      {
        key: 'corpName',
        html:
          '<p class="mjgd_ozon_card_row mjgd_ozon_blur_target" data-field-key="corpName">' +
          '公司名称: <span class="mjgd_ozon_field_corp_name e1fbcs-item-data corp-name-placeholder" style="color:#ab5f08">加载中...</span>' +
          '<span class="corp-translate-btn mjgd_ozon_corp_translate_btn" title="翻译/还原公司名称">译</span></p>',
      },
      {
        key: 'subjectTags',
        html: '<p class="mjgd_ozon_card_row" data-field-key="subjectTags">主题标签: <span class="mjgd_ozon_field_subject_tags">--</span></p>',
      },
    )
  }

  for (const row of rows) {
    if (card.querySelector(`[data-field-key="${row.key}"]`)) continue
    if (insertBefore) {
      insertBefore.insertAdjacentHTML('beforebegin', row.html)
    } else {
      card.insertAdjacentHTML('beforeend', row.html)
    }
  }
}

function applyPackagingToCard(card: HTMLElement, info: PackagingInfo) {
  const dimsEnabled = isCardFieldEnabled('dimensions')
  const weightEnabled = isCardFieldEnabled('weight')
  const tagsEnabled = isCardFieldEnabled('subjectTags')

  if (dimsEnabled) {
    const dimsEl = card.querySelector('.mjgd_ozon_field_packaging')
    if (dimsEl) dimsEl.textContent = formatPackagingDimsLong(info.length, info.width, info.height)
    const l = parseFloat(info.length)
    const w = parseFloat(info.width)
    const h = parseFloat(info.height)
    if (Number.isFinite(l)) card.dataset.lengthMm = String(l)
    if (Number.isFinite(w)) card.dataset.widthMm = String(w)
    if (Number.isFinite(h)) card.dataset.heightMm = String(h)
  }

  if (weightEnabled) {
    const weightEl = card.querySelector('.mjgd_ozon_field_packaging_weight')
    if (weightEl) weightEl.textContent = formatPackagingWeightG(info.weight)
    const wg = parseFloat(String(info.weight).replace(/^重量\s*[:：]?\s*/i, ''))
    if (Number.isFinite(wg)) card.dataset.weightG = String(wg)
  }

  if (tagsEnabled) {
    const tagsEl = card.querySelector('.mjgd_ozon_field_subject_tags')
    if (tagsEl) tagsEl.textContent = info.subjectTags ? String(info.subjectTags) : '--'
  }
}

/** 列表/详情卡片从 Ozon Page2 characteristics 补全长宽高、重量、主题标签。 */
export async function loadCardExtraData(card: HTMLElement, sku: string): Promise<void> {
  if (!card.isConnected || !sku) return

  ensureCardExtraRows(card)

  // 详情主卡：店铺 ID / 公司名称与包装接口解耦，避免包装失败导致不回显
  if (isDetailMainCard(card)) {
    void loadSellerInfoToCard(card).then((filled) => {
      if (!filled && card.isConnected) watchSellerInfoForCard(card)
    })
  }

  if (!needsCardShopsApi(card)) return

  const inflight = shopsLoadInFlight.get(card)
  if (inflight) return inflight

  const loadPromise = (async () => {
    try {
      const data = await collectOzonSkuMetrics(sku)
      if (!card.isConnected) return

      const characteristics = Array.isArray(data.characteristics)
        ? data.characteristics as OzonCharacteristic[]
        : []
      const info = parsePackagingAttrs(characteristics)
      applyPackagingToCard(card, info)
      // Page2 失败时保留可重试状态，不能把一次临时失败固化成永久空字段。
      if (data.page2Loaded === true) {
        card.dataset.shopsLoaded = '1'
        delete card.dataset.shopsLoadFailed
      } else {
        delete card.dataset.shopsLoaded
        card.dataset.shopsLoadFailed = '1'
      }
      applyCardFieldLayout(card)
      // 包装数据到位后重新打标，使尺寸/重量规则可命中
      applySelectionTagForCard(card)
      // 同步包装数据（mm/g）到内嵌利润计算器
      notifyInlineProfitPackagingFilled(sku, {
        l_mm: info.length,
        w_mm: info.width,
        h_mm: info.height,
        weight_g: info.weight,
      })
      if (isDetailMainCard(card)) {
        await loadSellerInfoToCard(card)
        applyCardFieldLayout(card)
      }
    } catch (e) {
      console.warn('[mjgd][ozonList] 包装数据加载失败', sku, e)
      if (isDetailMainCard(card)) {
        await loadSellerInfoToCard(card)
        applyCardFieldLayout(card)
      }
    } finally {
      shopsLoadInFlight.delete(card)
    }
  })()

  shopsLoadInFlight.set(card, loadPromise)
  return loadPromise
}
