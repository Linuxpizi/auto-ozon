import {
  addCrawlLog,
  getCrawlSnapshot,
  getCrawlStatus,
  isCrawlCollecting,
  setCrawlStatus,
} from './crawlStorage'
import { beginViewportCrawl, clearViewportCrawl, scanVisibleListingProducts } from './crawlScanner'
import { getCrawlScrollIntervalMs, getLocalCrawlScrollMode, type CrawlStartMode } from './autoCrawlFields'

const SCROLL_SPEED = 50
const DEFAULT_SCROLL_INTERVAL_MS = 20
const BOTTOM_WAIT_MS = 2000
const BOTTOM_RETRY_LIMIT = 10
const UI_THROTTLE_MS = 500
const BATCH_LOG_MS = 3000
// 对齐旧版 resumeCrawlFromSavedPos：跳跃后保留的缓冲像素 + 定位过渡期心跳间隔
const RESUME_BUFFER_PX = 300
const HEARTBEAT_INTERVAL_MS = 2500

let running = false
let paused = false
let scrollTimer: ReturnType<typeof setTimeout> | null = null
let bottomRetry = 0
let savedScrollTop = 0
/** 记录页面已加载到的最大高度，恢复时跳过已采集区（对齐旧版 prevMaxScrollHeight） */
let prevMaxScrollHeight = 0
let lastUiUpdate = 0
let batchCount = 0
let lastBatchLog = 0
/** 续爬「定位过渡期」：跳到断点后、撞到第一个新 SKU 前（对齐旧版 _resumingPhase） */
let resumingPhase = false
let lastHeartbeat = 0
/** 本次任务滚动步进间隔（启动时快照，暂停/继续沿用） */
let currentScrollIntervalMs = DEFAULT_SCROLL_INTERVAL_MS

// 页面切到后台标签页时浏览器会暂停 rAF → Ozon 停止加载新商品，此时继续滚动会撞
// 「假底」并在约 20s 后误触发自动停止。这里在「持续隐藏超过防抖时长」后让采集静默
// 挂起（停掉滚动循环、保留断点、不再累计到底计数），回到前台自动继续；短暂切换
// （< 防抖）不反应，避免频繁切换时来回挂起/恢复。
const BACKGROUND_IDLE_DEBOUNCE_MS = 3000
let visibilityBound = false
let hiddenDebounceTimer: ReturnType<typeof setTimeout> | null = null
let backgroundIdle = false

function clearScrollTimer() {
  if (scrollTimer) {
    clearTimeout(scrollTimer)
    scrollTimer = null
  }
}

function clearHiddenDebounce() {
  if (hiddenDebounceTimer) {
    clearTimeout(hiddenDebounceTimer)
    hiddenDebounceTimer = null
  }
}

/** 持续隐藏超过防抖时长后进入后台空转：停掉滚动循环、保留断点，不再累计到底计数 */
function enterBackgroundIdle() {
  hiddenDebounceTimer = null
  if (!running || paused || !isCrawlCollecting()) return
  backgroundIdle = true
  bottomRetry = 0
  saveCrawlScrollPosition()
  clearScrollTimer()
}

/** 回到前台：若处于后台空转则从断点无缝继续采集 */
function exitBackgroundIdle() {
  if (!backgroundIdle) return
  backgroundIdle = false
  bottomRetry = 0
  if (running && !paused && isCrawlCollecting()) {
    scheduleScroll(scrollStep, 100)
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    // 仅在「持续隐藏超过防抖时长」后才挂起；短暂切换忽略，避免频繁切换来回挂起/恢复
    if (!running || paused || backgroundIdle || hiddenDebounceTimer) return
    hiddenDebounceTimer = setTimeout(enterBackgroundIdle, BACKGROUND_IDLE_DEBOUNCE_MS)
  } else {
    clearHiddenDebounce()
    exitBackgroundIdle()
  }
}

function bindVisibilityHandling() {
  if (visibilityBound) return
  visibilityBound = true
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

function getDocMetrics() {
  const docHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight,
  )
  const windowHeight =
    window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight
  const scrollTop =
    window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
  return { docHeight, windowHeight, scrollTop }
}

function scheduleScroll(fn: () => void, delay = currentScrollIntervalMs) {
  if (!running) return
  clearScrollTimer()
  scrollTimer = setTimeout(fn, delay)
}

/** 续爬定位：跳到 max(savedScrollTop, 上次最远点 - 一屏 - buffer)，跳过已采集区（对齐旧版 resumeCrawlFromSavedPos） */
function locateAndPrepareResume() {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  let jumpTarget = savedScrollTop || 0
  if (prevMaxScrollHeight > 0 && viewportHeight > 0) {
    const farPoint = prevMaxScrollHeight - viewportHeight - RESUME_BUFFER_PX
    if (farPoint > jumpTarget) jumpTarget = farPoint
  }
  const curScrollHeight = Math.max(
    document.body.scrollHeight || 0,
    document.documentElement.scrollHeight || 0,
  )
  const curMaxScrollTop = Math.max(0, curScrollHeight - viewportHeight)
  if (curMaxScrollTop > 0 && jumpTarget > curMaxScrollTop) jumpTarget = curMaxScrollTop
  if (jumpTarget < 0) jumpTarget = 0

  if (jumpTarget > 0) {
    resumingPhase = true
    lastHeartbeat = Date.now()
    window.scrollTo(0, jumpTarget)
    addCrawlLog('系统正在定位上次暂停节点，定位完成后将自动从该位置继续爬取...', 'info')
  }
}

function tickCrawlUi(added: number) {
  const now = Date.now()
  if (now - lastUiUpdate < UI_THROTTLE_MS) return
  lastUiUpdate = now

  if (added > 0) batchCount += added
  if (batchCount > 0 && now - lastBatchLog > BATCH_LOG_MS) {
    const total = getCrawlSnapshot().count
    addCrawlLog(
      `本轮扫描新增 ${batchCount} 条，累计 ${total} 条`,
      'info',
    )
    batchCount = 0
    lastBatchLog = now
  }
}

function scrollStep() {
  if (!running || paused || !isCrawlCollecting()) return
  if (backgroundIdle) return

  const added = scanVisibleListingProducts()
  // 撞到第一个新 SKU，结束定位过渡期
  if (resumingPhase && added > 0) resumingPhase = false
  tickCrawlUi(added)

  // 定位过渡期心跳：长时间没新 SKU 时兜底一条日志，防止用户以为卡死
  const now = Date.now()
  if (resumingPhase && now - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = now
    addCrawlLog('扫描中... 正在向下查找新商品。', 'info')
  }

  const { docHeight, windowHeight, scrollTop } = getDocMetrics()
  const atBottom = scrollTop + windowHeight >= docHeight - 1

  if (atBottom) {
    scheduleScroll(() => {
      if (!running || paused) return
      if (bottomRetry >= BOTTOM_RETRY_LIMIT) {
        const total = getCrawlSnapshot().count
        addCrawlLog(
          `采集任务达到页面底部阈值，已自动停止，共采集 ${total} 条`,
          'success',
        )
        stopCrawlRunner(true)
        return
      }
      bottomRetry += 1
      window.scrollTo(0, scrollTop + SCROLL_SPEED)
      scrollStep()
    }, BOTTOM_WAIT_MS)
    return
  }

  bottomRetry = 0
  window.scrollTo(0, scrollTop + SCROLL_SPEED)
  scheduleScroll(scrollStep, currentScrollIntervalMs)
}

export function isCrawlRunnerActive(): boolean {
  return running
}

export function saveCrawlScrollPosition() {
  savedScrollTop =
    window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
  const curScrollHeight = Math.max(
    document.body.scrollHeight || 0,
    document.documentElement.scrollHeight || 0,
  )
  if (curScrollHeight > prevMaxScrollHeight) prevMaxScrollHeight = curScrollHeight
}

/**
 * 启动采集。startMode 仅对「新任务」生效：
 *  - 'pageTop'：清掉断点并滚到页面顶部，从第一个商品完整采集（随后 locateAndPrepareResume 自然 no-op）
 *  - 'viewport'：保持当前滚动位置，整次任务只采视口起点及以下的商品
 *  - 不传：保持原有行为（供 resumeCrawlRunner 续爬回退调用，续爬定位逻辑不受影响）
 */
export function startCrawlRunner(startMode?: CrawlStartMode) {
  if (running) return
  running = true
  currentScrollIntervalMs = getCrawlScrollIntervalMs(getLocalCrawlScrollMode())
  paused = false
  bottomRetry = 0
  batchCount = 0
  lastBatchLog = Date.now()
  lastUiUpdate = 0
  resumingPhase = false
  backgroundIdle = false
  clearHiddenDebounce()
  bindVisibilityHandling()

  if (startMode === 'pageTop') {
    clearViewportCrawl()
    savedScrollTop = 0
    prevMaxScrollHeight = 0
    window.scrollTo(0, 0)
    locateAndPrepareResume()
  } else if (startMode === 'viewport') {
    beginViewportCrawl()
    saveCrawlScrollPosition()
  } else {
    locateAndPrepareResume()
  }

  scheduleScroll(scrollStep, 100)
}

export function pauseCrawlRunner() {
  if (!running) return
  paused = true
  backgroundIdle = false
  clearHiddenDebounce()
  saveCrawlScrollPosition()
  clearScrollTimer()
  setCrawlStatus('paused')
}

export function resumeCrawlRunner() {
  if (!running) {
    startCrawlRunner()
    return
  }
  paused = false
  backgroundIdle = false
  clearHiddenDebounce()
  setCrawlStatus('collecting')
  locateAndPrepareResume()
  scheduleScroll(scrollStep, 100)
}

export function stopCrawlRunner(_auto = false) {
  running = false
  paused = false
  resumingPhase = false
  backgroundIdle = false
  clearHiddenDebounce()
  clearScrollTimer()
  saveCrawlScrollPosition()
  setCrawlStatus('stopped')
}

export function resetCrawlRunner() {
  running = false
  paused = false
  resumingPhase = false
  bottomRetry = 0
  savedScrollTop = 0
  prevMaxScrollHeight = 0
  backgroundIdle = false
  clearHiddenDebounce()
  clearScrollTimer()
}

/** 防止列表贴卡在爬取时抢请求 */
export function shouldBlockListLoad(): boolean {
  return running && !paused && getCrawlStatus() === 'collecting'
}
