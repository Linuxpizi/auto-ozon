import { isOzonRetailSite, isOzonListLikePage, resolveOzonPageType, type OzonPageType } from './ozonPageContext'
import { startOzonListAutoScan, stopOzonListAutoScan } from './ozonListService'
import { startDetailPageCard, stopDetailPageCard } from './detailPageService'
import {
  startImageDownloadButtons,
  stopImageDownloadButtons,
} from './imageDownloadOverlay'
import {
  preloadCardFieldPreference,
  resetCalcConfigTabCache,
} from '../ozonCardSettings/settingsController'
import { resetCardFieldPreferenceState } from '../ozonCardSettings/cardFieldStore'
import { clearSelectionOnLogout, syncSelectionRulesFromServer } from '../ozonSelectionRules/sync'
import { ensureExchangeRates } from '../ozonBatchCrawl/exportPriceUtils'
import { loadProfitCalcConfig } from '../ozonProfitCalc/profitCalcApi'
import { clearSkuDataCache } from './skuDataCache'
import { clearListSkuAccumulator } from './listSkuAccumulator'
import {
  closeQuickShelve,
  invalidateQuickShelveCaches,
} from '../ozonQuickShelve/quickShelveController'

const CARD_SELECTOR = '.mjgd_ozon_sku_card, .e1fbcs'

import { TRIGGER_SILENT_COOKIE_SYNC } from '@/lib/utils/ozon-cookie'

/** 仅在 Ozon 零售站请求 background 静默保存 Ozon Cookie，成功失败均无 UI */
export function requestSilentCookieBind(): void {
  if (!isOzonRetailSite()) return
  try {
    const extensionApi = (globalThis as typeof globalThis & {
      chrome?: {
        runtime?: {
          lastError?: unknown
          sendMessage?: (message: unknown, callback?: () => void) => void
        }
      }
    }).chrome
    if (typeof extensionApi?.runtime?.sendMessage !== 'function') return
    extensionApi.runtime.sendMessage({ action: TRIGGER_SILENT_COOKIE_SYNC }, () => {
      // 忽略 lastError（SW 未就绪等），静默绑定不允许弹任何提示
      void extensionApi.runtime?.lastError
    })
  } catch {
    // sendMessage 同步异常时同样静默忽略
  }
}

/** 移除页面上所有插件注入的 SKU 卡片 */
export function removeAllOzonSkuCards(): void {
  document.querySelectorAll(CARD_SELECTOR).forEach((el) => el.remove())
}

/** 登出 / token 失效：停止扫描、清 DOM、清账号级缓存 */
export function teardownOzonAuthSession(): void {
  stopOzonListAutoScan()
  stopDetailPageCard()
  stopImageDownloadButtons()
  removeAllOzonSkuCards()
  clearSkuDataCache()
  clearListSkuAccumulator()
  invalidateQuickShelveCaches('all')
  clearSelectionOnLogout()
  closeQuickShelve()
  resetCardFieldPreferenceState()
  // 计算器配置 tab 的 latch/表单也清掉，避免登出后残留上一个账号数据
  resetCalcConfigTabCache()
}

/**
 * 按当前页面类型激活贴卡等功能（页面导航、初次挂载用；不强制清 DOM）。
 */
export async function tryActivateOzonListFeatures(pageType?: OzonPageType): Promise<void> {
  const onRetail = isOzonRetailSite()
  const pt = pageType ?? resolveOzonPageType()
  const onList = onRetail && isOzonListLikePage(pt)
  const onDetail = onRetail && pt === 'detail'

  stopDetailPageCard()

  if (onList || onDetail) {
    startImageDownloadButtons()
  } else {
    stopImageDownloadButtons()
  }

  if (onList) {
    await Promise.all([
      preloadCardFieldPreference(),
      syncSelectionRulesFromServer(),
      ensureExchangeRates(),
    ])
    startOzonListAutoScan()
    return
  }

  stopOzonListAutoScan()

  if (onDetail) {
    await Promise.all([
      preloadCardFieldPreference(),
      syncSelectionRulesFromServer({ applyTags: false }),
      ensureExchangeRates(),
    ])
    await startDetailPageCard()
  }
}

/**
 * 重新登录后：清旧卡片与缓存，再激活贴卡/扫描。
 * 列表数据不在此立即拉取，交由 listingAutoLoad 在 ~800ms 后触发（与刷新页面路径一致，避免切账号瞬间打满 skuss/new）。
 */
async function runActivateOzonAuthSession(): Promise<void> {
  removeAllOzonSkuCards()
  clearSkuDataCache()
  clearListSkuAccumulator()
  invalidateQuickShelveCaches('all')
  // 登录/切账号后强制重拉利润计算器配置（含 5 个展示/公式偏好），避免沿用上一个账号的缓存。
  // fire-and-forget：拉回后 onProfitCalcConfigChange 自动灌缓存并刷新面板；失败（未登录等）静默忽略。
  void loadProfitCalcConfig(true).catch(() => {})
  // 切账号：重置计算器配置 tab 的加载 latch，使下次打开重新拉取当前账号数据
  resetCalcConfigTabCache()
  // 切账号时 autoLoad 可能仍在跑；先停再启，避免 startListingAutoLoad 因 observer 已存在而跳过 800ms 初始化
  stopOzonListAutoScan()
  stopDetailPageCard()

  await tryActivateOzonListFeatures()
  // 登录/切账号后静默绑定一次店铺 Cookie（无 toast）
  requestSilentCookieBind()
}

let activateDebounceTimer: ReturnType<typeof setTimeout> | null = null

/** 合并同一轮本地状态恢复中的重复 storage.onChanged 触发。 */
export function activateOzonAuthSession(): void {
  if (activateDebounceTimer) clearTimeout(activateDebounceTimer)
  activateDebounceTimer = setTimeout(() => {
    activateDebounceTimer = null
    void runActivateOzonAuthSession()
  }, 0)
}
