import { is1688CategorySearchPage, is1688WwwHost } from './categorySearchUrl'
import { isResumableDraft, readDraft } from './draftStorage'
import { waitForOfferListPage } from './listPageScanner'
import type { PendingAutoSelectPayload } from './pendingConfigStorage'
import { waitForShopOfferListPage } from './shopListPageScanner'
import { isOnAnyConfiguredStorePage } from './storeCollectUrl'
import { UNLIMITED_CATEGORY, type AiAutoSelectConfig, type AiAutoSelectDraft } from './types'

/** 判断当前页是否为 autoStart 跳转的预期落地页 */
export function isPendingAutoStartLanding(pending: PendingAutoSelectPayload): boolean {
  if (!pending.autoStart) return false
  const { config } = pending
  if (config.storeCollectEnabled && config.storeLinks.length > 0) {
    return isOnAnyConfiguredStorePage(config.storeLinks)
  }
  if (config.category === UNLIMITED_CATEGORY) {
    return is1688WwwHost()
  }
  return is1688CategorySearchPage()
}

/** 等待列表页 DOM 就绪，店铺/搜索页分别走不同检测 */
export function waitForAutoSelectLandingReady(config: AiAutoSelectConfig, timeoutMs = 30000): Promise<boolean> {
  return config.storeCollectEnabled
    ? waitForShopOfferListPage(timeoutMs)
    : waitForOfferListPage(timeoutMs)
}

/** 同页续采：若扩展域草稿可恢复则返回，否则 null */
export async function resolveAutoSelectResumeFrom(pageUrl: string, sessionId: string): Promise<AiAutoSelectDraft | null> {
  const existing = await readDraft(sessionId)
  return isResumableDraft(existing, pageUrl, sessionId) ? existing : null
}
