/**
 * 巡查跟卖后台抓取：PC 页派发 bcs-ozon-fetch-start → 用「后台不激活标签页 + 抓 body>pre」
 * 拿到 ozon entrypoint-api 的原始 JSON（获得带 cookie 的真实首方上下文，绕过 SW 跨站 fetch 的 403）
 * → 按旧内容脚本规则处理成 text → 逐 key 回传 PC 页。
 *
 * 标签页策略（方案 B：一个商品复用一个后台标签）：
 *   - 一个 bcs-ozon-fetch-start（一个商品/taskId）只开【一个】后台标签：
 *     chrome.tabs.create({ url, active:false })，复用当前窗口、不聚焦、全程不 activate。
 *   - 在这个标签里顺序导航每个 request 的 url（chrome.tabs.update）→ 抓取 → 处理 → 逐 key 回传。
 *   - 该商品所有 key 抓完（无论成功/失败/超时）后，统一关闭这个标签（try/finally 保障），绝不残留。
 *   - 每个 key 的抓取加 15s 超时，超时回传 { key, text:'', error:'timeout' } 后继续下一个 key。
 *   - 同时进行的商品（标签）上限 MAX_CONCURRENT_TASKS，超出排队。
 *   - service worker 重启后，清理此前打开、尚未关闭的标签（tabId 记录在 storage.session）。
 *
 * text 的格式 / 字段名 / "空" 语义与 src/content/ozonDataPageBridge.ts 完全一致：
 *   - sellers ：对齐 page_changed 分支（webSellerList* → JSON.stringify(sellers)，无数据 "空"）
 *   - getprice：对齐 ac=getprice 分支（webPrice-3121879-default-1 原样字符串，无数据 "空"）
 */

type OzonFetchRequestItem = { key?: string; url?: string }

export type OzonGenericFetchDeliverPayload = {
  source: 'bcs-plugin'
  type: 'ozonFetchDeliver'
  taskId: string
  sku: string
  key: string
  text: string
  error?: string
}

/** 单个 key 抓取的整体超时（≤ PC 侧 20s） */
const REQUEST_TIMEOUT_MS = 15000
/** 标签页加载等待的内层兜底（> 外层超时，保证 "timeout" 语义由外层判定，同时避免监听器泄漏） */
const TAB_LOAD_TIMEOUT_MS = 20000
/** 抓取 <pre> 的最大重试次数 */
const SCRAPE_MAX_ATTEMPTS = 5
/** 每次抓取重试间隔 */
const SCRAPE_RETRY_MS = 400
/** 同时进行的商品（标签）上限 */
const MAX_CONCURRENT_TASKS = 2
/** storage.session 里记录本功能已打开标签页的 key（供 SW 重启清理孤儿标签） */
const OPEN_TABS_KEY = 'bcsOzonPatrolOpenTabs'

/** sellers 处理：对齐 ozonDataPageBridge.ts page_changed 分支 */
function processSellersText(rawText: string): string {
  const jsonObject = JSON.parse(rawText)
  if (jsonObject.widgetStates) {
    const webSellerKeys = Object.keys(jsonObject.widgetStates).filter(function (key) {
      return key.startsWith('webSellerList')
    })
    const firstKey = webSellerKeys.length > 0 ? webSellerKeys[0] : null
    if (firstKey) {
      if (jsonObject.widgetStates[firstKey] != null) {
        const sellersData = JSON.parse(jsonObject.widgetStates[firstKey]).sellers
        return JSON.stringify(sellersData)
      }
      return '空'
    }
    return '空'
  }
  return '空'
}

/** getprice 处理：对齐 ozonDataPageBridge.ts ac=getprice 分支 */
function processGetpriceText(rawText: string): string {
  const jsonObject2 = JSON.parse(rawText)
  if (jsonObject2.widgetStates['webPrice-3121879-default-1'] != null) {
    return jsonObject2.widgetStates['webPrice-3121879-default-1']
  }
  return '空'
}

function processByKey(key: string, rawText: string): string {
  if (key === 'sellers') return processSellersText(rawText)
  if (key === 'getprice') return processGetpriceText(rawText)
  // 未知 key：原样返回响应文本（不做处理），保持通道可用
  return rawText
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------- 孤儿标签记录（跨 SW 重启，用 storage.session） ----------
const openTabIds = new Set<number>()

function persistOpenTabs() {
  if (!chrome.storage?.session) return
  chrome.storage.session.set({ [OPEN_TABS_KEY]: [...openTabIds] }, () => {
    if (chrome.runtime.lastError) {
      /* storage.session 写入失败可忽略：仅影响重启清理兜底 */
    }
  })
}

function trackTab(tabId: number) {
  openTabIds.add(tabId)
  persistOpenTabs()
}

/** 关闭并从记录中移除标签页（幂等） */
function closeTrackedTab(tabId: number) {
  openTabIds.delete(tabId)
  persistOpenTabs()
  chrome.tabs.remove(tabId, () => {
    if (chrome.runtime.lastError) {
      /* 标签页可能已被关闭，忽略 */
    }
  })
}

/** SW（重）启动时清理此前遗留、未关闭的抓取标签页 */
function cleanupOrphanTabsOnStartup() {
  const session = chrome.storage?.session
  if (!session) return
  session.get(OPEN_TABS_KEY, (items) => {
    if (chrome.runtime.lastError) return
    const ids = Array.isArray(items?.[OPEN_TABS_KEY]) ? (items[OPEN_TABS_KEY] as number[]) : []
    ids.forEach((id) => {
      chrome.tabs.remove(id, () => {
        if (chrome.runtime.lastError) {
          /* 可能已不存在，忽略 */
        }
      })
    })
    session.set({ [OPEN_TABS_KEY]: [] }, () => {
      if (chrome.runtime.lastError) {
        /* 忽略 */
      }
    })
  })
}

// ---------- 并发上限：同时最多 MAX_CONCURRENT_TASKS 个商品（标签） ----------
let runningTasks = 0
const waitingQueue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (runningTasks < MAX_CONCURRENT_TASKS) {
    runningTasks += 1
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => waitingQueue.push(resolve))
}

function releaseSlot() {
  const next = waitingQueue.shift()
  if (next) {
    // 名额直接交给等待者，runningTasks 保持不变
    next()
  } else {
    runningTasks -= 1
  }
}

async function scheduleTask(fn: () => Promise<void>): Promise<void> {
  await acquireSlot()
  try {
    await fn()
  } finally {
    releaseSlot()
  }
}

// ---------- 标签页原语 ----------
/** 后台创建不激活标签页（active:false，复用当前窗口；不设 opener 避免旧 ozonDataPageBridge 走 window.opener 分支） */
function createBackgroundTab(url: string, windowId?: number): Promise<number | null> {
  return new Promise((resolve) => {
    const opts: chrome.tabs.CreateProperties = { url, active: false }
    if (windowId != null) opts.windowId = windowId
    chrome.tabs.create(opts, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        console.warn('[ozonGenericFetch] create tab:', chrome.runtime.lastError?.message)
        resolve(null)
        return
      }
      resolve(tab.id)
    })
  })
}

/**
 * 等待标签页加载完成。
 * - navigate=true 时先 chrome.tabs.update 导航到新 url，并要求先看到 loading 再看到 complete，
 *   规避「导航前的旧 complete」误判（复用同一标签顺序抓多个 url 的关键）。
 * - navigate=false（初次创建）时补一次 tabs.get 兜底，防止 addListener 前就已 complete。
 */
function waitForTabLoaded(tabId: number, options: { navigate: boolean; url?: string }): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    let sawLoading = !options.navigate
    const finish = () => {
      if (done) return
      done = true
      chrome.tabs.onUpdated.removeListener(listener)
      clearTimeout(timer)
      resolve()
    }
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId) return
      if (changeInfo.status === 'loading') sawLoading = true
      if (changeInfo.status === 'complete' && sawLoading) finish()
    }
    const timer = setTimeout(finish, TAB_LOAD_TIMEOUT_MS)
    chrome.tabs.onUpdated.addListener(listener)

    if (options.navigate && options.url) {
      chrome.tabs.update(tabId, { url: options.url }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[ozonGenericFetch] navigate tab:', chrome.runtime.lastError.message)
          finish()
        }
      })
    } else {
      chrome.tabs.get(tabId, (t) => {
        if (!chrome.runtime.lastError && t && t.status === 'complete') finish()
      })
    }
  })
}

/** 抓取 body>pre 的原始文本 */
function scrapePreText(tabId: number): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          const pre = document.querySelector('body > pre:first-child')
          return pre ? (pre as HTMLElement).innerText : null
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve(null)
          return
        }
        resolve((results?.[0]?.result as string | null) ?? null)
      },
    )
  })
}

async function scrapePreWithRetry(tabId: number): Promise<string | null> {
  for (let attempt = 0; attempt < SCRAPE_MAX_ATTEMPTS; attempt += 1) {
    const text = await scrapePreText(tabId)
    if (text && String(text).trim()) return text
    await delay(SCRAPE_RETRY_MS)
  }
  return null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('__TIMEOUT__')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function deliverToTab(tabId: number, payload: OzonGenericFetchDeliverPayload) {
  chrome.tabs.sendMessage(tabId, { action: 'OZON_GENERIC_FETCH_DELIVER', payload }, () => {
    if (chrome.runtime.lastError) {
      console.warn('[ozonGenericFetch] deliver:', chrome.runtime.lastError.message)
    }
  })
}

/** 在标签页里加载指定 url 并抓取原始 JSON 文本；抓不到内容抛 __NO_CONTENT__ */
async function loadUrlAndScrape(
  tabId: number,
  options: { navigate: boolean; url?: string },
): Promise<string> {
  await waitForTabLoaded(tabId, options)
  const rawText = await scrapePreWithRetry(tabId)
  if (rawText == null) throw new Error('__NO_CONTENT__')
  return rawText
}

/**
 * 单个巡查任务（一个商品）：复用同一个后台标签顺序抓每个 {key,url}，逐 key 回传，
 * 全部结束后在 finally 里统一关闭这个标签，绝不残留。
 */
async function runTaskWithTab(
  taskId: string,
  sku: string,
  requests: OzonFetchRequestItem[],
  deliverTabId: number,
  windowId?: number,
): Promise<void> {
  const deliver = (key: string, text: string, error?: string) => {
    const payload: OzonGenericFetchDeliverPayload = {
      source: 'bcs-plugin',
      type: 'ozonFetchDeliver',
      taskId,
      sku,
      key,
      text,
    }
    if (error) payload.error = error
    deliverToTab(deliverTabId, payload)
  }

  let tabId: number | null = null
  try {
    for (const item of requests) {
      const key = String(item?.key || '')
      const url = String(item?.url || '').trim()
      if (!url) {
        deliver(key, '', '缺少 url')
        continue
      }

      let rawText: string | null = null
      let errorMsg: string | null = null
      try {
        if (tabId == null) {
          tabId = await createBackgroundTab(url, windowId)
          if (tabId == null) {
            deliver(key, '', '创建标签页失败')
            continue
          }
          trackTab(tabId)
          rawText = await withTimeout(loadUrlAndScrape(tabId, { navigate: false }), REQUEST_TIMEOUT_MS)
        } else {
          rawText = await withTimeout(
            loadUrlAndScrape(tabId, { navigate: true, url }),
            REQUEST_TIMEOUT_MS,
          )
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : ''
        errorMsg =
          m === '__TIMEOUT__'
            ? 'timeout'
            : m === '__NO_CONTENT__'
              ? '未获取到响应内容（可能被拦截或非 JSON 页面）'
              : m || '抓取失败'
      }

      if (errorMsg != null) {
        deliver(key, '', errorMsg)
        continue
      }
      try {
        deliver(key, processByKey(key, rawText as string))
      } catch (parseErr) {
        deliver(key, '', parseErr instanceof Error ? parseErr.message : '解析响应失败')
      }
    }
  } finally {
    // 无论成功/失败/超时，商品所有 key 抓完后统一关闭这个标签
    if (tabId != null) closeTrackedTab(tabId)
  }
}

/**
 * 处理 PC 页发来的 bcs-ozon-fetch-start（经内容脚本转发）。
 * 立即应答；一个商品复用一个后台标签顺序抓取、逐 key 回传，商品并发受 MAX_CONCURRENT_TASKS 限制。
 */
export function handleOzonGenericFetchStart(
  request: { taskId?: string; sku?: string; requests?: OzonFetchRequestItem[] },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean {
  const taskId = String(request?.taskId || '')
  const sku = String(request?.sku || '')
  const requests = Array.isArray(request?.requests) ? request.requests : []
  const deliverTabId = sender?.tab?.id
  const windowId = sender?.tab?.windowId

  if (deliverTabId == null) {
    sendResponse({ success: false, error: 'missing sender tab' })
    return false
  }
  if (!requests.length) {
    sendResponse({ success: false, error: 'missing requests' })
    return false
  }

  void scheduleTask(() => runTaskWithTab(taskId, sku, requests, deliverTabId, windowId))

  sendResponse({ success: true, taskId })
  return true
}

// SW（重）启动时清理遗留标签页
cleanupOrphanTabsOnStartup()
