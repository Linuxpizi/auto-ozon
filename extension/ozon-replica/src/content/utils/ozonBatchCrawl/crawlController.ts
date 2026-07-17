import {
  addCrawlLog,
  clearCrawlProducts,
  closeCrawlOverlaySession,
  getCrawlSnapshot,
  setCrawlStatus,
  setCrawlVisible,
  subscribeCrawlState,
} from './crawlStorage'
import {
  pauseCrawlRunner,
  resetCrawlRunner,
  resumeCrawlRunner,
  startCrawlRunner,
  stopCrawlRunner,
  shouldBlockListLoad,
  isCrawlRunnerActive,
} from './crawlRunner'
import { exportCrawlToExcel } from './crawlExporter'
import { copyListingSkuPriceFormat } from './copyFormat'
import { bindOzonShopCookie } from './crawlCookieBind'
import { resetCrawlScannerState } from './crawlScanner'
import { getLocalCrawlStartMode } from './autoCrawlFields'
import { isOzonListLikePage, resolveOzonPageType } from '../ozonList/ozonPageContext'

export {
  subscribeCrawlState,
  getCrawlSnapshot,
  shouldBlockListLoad,
  isCrawlRunnerActive,
  copyListingSkuPriceFormat,
  bindOzonShopCookie,
  exportCrawlToExcel,
}

/** 从 Widget 菜单启动爬取：打开 overlay 并开始滚动采集 */
export function startBatchCrawl(): void {
  if (!isOzonListLikePage(resolveOzonPageType())) {
    throw new Error('请在 Ozon 列表或搜索页使用')
  }

  const snapshot = getCrawlSnapshot()
  if (snapshot.status === 'collecting' && isCrawlRunnerActive()) return

  // 对齐旧版 idle/stopped/clearedReady 启动：不清 skipSkus、不重置 scroll，仅复位挂起的 runner
  if (isCrawlRunnerActive()) {
    resetCrawlRunner()
  }

  const startMode = getLocalCrawlStartMode()
  if (startMode === 'viewport') {
    // 视口模式为全新区间采集，清空上次结果避免导出混入旧数据
    clearCrawlProducts(false)
  }

  setCrawlVisible(true)
  setCrawlStatus('collecting')
  addCrawlLog('采集任务已启动，右侧弹窗进入实时监控模式。', 'success')
  startCrawlRunner(startMode)
}

/** 暂停。对齐旧版：日志"用户触发暂停，采集队列已挂起。" */
export function pauseBatchCrawl(): void {
  if (!isCrawlRunnerActive()) return
  pauseCrawlRunner()
  addCrawlLog('用户触发暂停，采集队列已挂起。', 'warn')
}

/** 关闭日志覆盖层时的自动暂停（区别于用户主动点击暂停） */
export function pauseBatchCrawlFromOverlayClose(): void {
  if (!isCrawlRunnerActive()) return
  pauseCrawlRunner()
  addCrawlLog('用户关闭日志覆盖层，任务自动进入暂停状态。', 'warn')
}

/** 继续。对齐旧版："用户点击继续，采集任务恢复执行。" */
export function resumeBatchCrawl(): void {
  setCrawlStatus('collecting')
  addCrawlLog('用户点击继续，采集任务恢复执行。', 'success')
  resumeCrawlRunner()
}

/** 停止。对齐旧版："用户执行停止操作，采集任务已结束，共采集 N 条" */
export function stopBatchCrawl(): void {
  const count = getCrawlSnapshot().count
  stopCrawlRunner(false)
  addCrawlLog(
    `用户执行停止操作，采集任务已结束，共采集 ${count} 条`,
    'stop',
  )
}

export function clearBatchCrawlData(): void {
  clearCrawlProducts(true)
  setCrawlStatus('cleared_ready')
  addCrawlLog('用户清理了当前采集数据，等待继续采集（位置保留）。', 'stop')
}

/**
 * 确认关闭弹窗（对齐旧版 #bcs-crawl-confirm-ok）：
 * 停止采集中任务、清空 UI 数据，保留 skipSkus 与滚动断点。
 */
export function closeBatchCrawlOverlay(_force = false): void {
  if (isCrawlRunnerActive()) {
    stopCrawlRunner(false)
  }
  resetCrawlScannerState()
  closeCrawlOverlaySession()
}
