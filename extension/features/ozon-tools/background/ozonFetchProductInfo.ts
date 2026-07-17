
/**
 * M09：ERP 触发后台打开 Ozon Tab 采集商品原始 JSON，回传 ERP 页
 */
const pendingOzonFetchProductInfo: Record<
  string,
  { erpTabId?: number; erpWindowId?: number; pages: Record<string, number> }
> = {}

const ozonFetchTabMeta: Record<
  number,
  { taskId: string; page: string; sku: string; collected: boolean; startUrl?: string }
> = {}

let fetchListenerInstalled = false

function parseOzonFetchParamsFromUrl(tabUrl: string) {
  const out = { taskId: '', page: '', sku: '' }
  if (!tabUrl) return out
  try {
    const parsed = new URL(tabUrl)
    out.taskId = parsed.searchParams.get('bcsFetchTaskId') || ''
    out.page = parsed.searchParams.get('page') || ''
    out.sku = parsed.searchParams.get('sku') || ''
  } catch {
    const taskMatch = tabUrl.match(/[?&]bcsFetchTaskId=([^&]+)/)
    const pageMatch = tabUrl.match(/[?&]page=([^&]+)/)
    const skuMatch = tabUrl.match(/[?&]sku=([^&]+)/)
    out.taskId = taskMatch ? decodeURIComponent(taskMatch[1]) : ''
    out.page = pageMatch ? decodeURIComponent(pageMatch[1]) : ''
    out.sku = skuMatch ? decodeURIComponent(skuMatch[1]) : ''
  }
  return out
}

function buildOzonFetchProductInfoPayload(
  tabUrl: string,
  rawText: string | null,
  pageOverride?: string,
) {
  const params = parseOzonFetchParamsFromUrl(tabUrl)
  const page =
    pageOverride != null && pageOverride !== '' ? String(pageOverride) : params.page
  const type =
    page === '1'
      ? 'fetchProductInfoPage1'
      : page === '2'
        ? 'fetchProductInfoPage2'
        : 'fetchProductInfo'
  if (rawText) {
    return { type, sku: params.sku, page, url: tabUrl, text: rawText }
  }
  return {
    type,
    sku: params.sku,
    page,
    url: tabUrl,
    text: '空',
    error: '没有找到<body>下的第一个<pre>元素',
  }
}

function getOzonFetchTabMeta(tabId: number) {
  if (ozonFetchTabMeta[tabId]) return ozonFetchTabMeta[tabId]
  for (const taskId of Object.keys(pendingOzonFetchProductInfo)) {
    const pending = pendingOzonFetchProductInfo[taskId]
    if (!pending?.pages) continue
    for (const pageKey of Object.keys(pending.pages)) {
      if (pending.pages[pageKey] === tabId) {
        ozonFetchTabMeta[tabId] = {
          taskId,
          page: pageKey,
          sku: '',
          collected: false,
        }
        return ozonFetchTabMeta[tabId]
      }
    }
  }
  return null
}

function refocusErpTab(erpWindowId?: number, erpTabId?: number) {
  if (erpWindowId != null) {
    chrome.windows.update(erpWindowId, { focused: true })
  }
  if (erpTabId != null) {
    chrome.tabs.update(erpTabId, { active: true })
  }
}

function deliverOzonFetchProductInfoResult(taskId: string, payload: Record<string, unknown>) {
  const pending = taskId ? pendingOzonFetchProductInfo[taskId] : null
  if (!pending || pending.erpTabId == null) return
  refocusErpTab(pending.erpWindowId, pending.erpTabId)
  chrome.tabs.sendMessage(
    pending.erpTabId,
    { action: 'OZON_FETCH_PRODUCT_INFO_DELIVER', payload },
    () => {
      if (chrome.runtime.lastError) {
        console.warn('[mjgd][fetchProductInfo] deliver:', chrome.runtime.lastError.message)
      }
    },
  )
}

function closeOzonFetchTabAfterCollect(tabId: number, taskId?: string) {
  chrome.tabs.remove(tabId, () => {
    if (chrome.runtime.lastError) {
      console.warn('[mjgd][fetchProductInfo] close tab:', chrome.runtime.lastError.message)
    }
  })
  if (taskId && pendingOzonFetchProductInfo[taskId]?.pages) {
    const pages = pendingOzonFetchProductInfo[taskId].pages
    Object.keys(pages).forEach((pageKey) => {
      if (pages[pageKey] === tabId) delete pages[pageKey]
    })
  }
}

function collectOzonFetchProductInfoFromTab(tabId: number, tabUrl: string, attempt = 0) {
  const meta = getOzonFetchTabMeta(tabId)
  if (!meta || meta.collected) return

  chrome.scripting.executeScript(
    {
      target: { tabId },
      func: () => {
        const pre = document.querySelector<HTMLElement>('body > pre:first-child')
        return pre ? pre.innerText : null
      },
    },
    (results) => {
      if (chrome.runtime.lastError) {
        if (attempt < 4) {
          setTimeout(() => collectOzonFetchProductInfoFromTab(tabId, tabUrl, attempt + 1), 400)
          return
        }
        meta.collected = true
        const payload = buildOzonFetchProductInfoPayload(tabUrl, null, meta.page)
        payload.error = chrome.runtime.lastError.message
        deliverOzonFetchProductInfoResult(meta.taskId, payload)
        closeOzonFetchTabAfterCollect(tabId, meta.taskId)
        delete ozonFetchTabMeta[tabId]
        return
      }
      const rawText = results?.[0]?.result as string | null
      if ((!rawText || !String(rawText).trim()) && attempt < 4) {
        setTimeout(() => collectOzonFetchProductInfoFromTab(tabId, tabUrl, attempt + 1), 400)
        return
      }
      meta.collected = true
      const payload = buildOzonFetchProductInfoPayload(tabUrl, rawText, meta.page)
      deliverOzonFetchProductInfoResult(meta.taskId, payload)
      closeOzonFetchTabAfterCollect(tabId, meta.taskId)
      delete ozonFetchTabMeta[tabId]
    },
  )
}

function appendBcsFetchTaskIdToUrl(url: string, taskId: string): string {
  if (!url || !taskId) return url
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('bcsFetchTaskId')) {
      parsed.searchParams.set('bcsFetchTaskId', taskId)
    }
    return parsed.toString()
  } catch {
    const joiner = url.includes('?') ? '&' : '?'
    return `${url}${joiner}bcsFetchTaskId=${encodeURIComponent(taskId)}`
  }
}

/**
 * @description:
 * @author: wdn
 * @date: 2026/7/7 13:33
 * @return 获取ozon 域名
 */
function getOzonHostFromUrls(urls: Array<{ url?: string }>) {
  const hit = urls.find((item) => item?.url && String(item.url).includes('ozon.kz'))
  return hit ? 'https://www.ozon.kz' : 'https://www.ozon.ru'
}

/**
 * @description:
 * @author: wdn
 * @date: 2026/7/7 13:34
 * @return 获取参数
 */
function getFirstSkuFromUrls(urls: Array<{ url?: string }>) {
  for (const item of urls) {
    const params = parseOzonFetchParamsFromUrl(item?.url || '')
    if (params.sku) return params.sku
  }
  return ''
}

/**
 * @description:
 * @author: wdn
 * @date: 2026/7/7 11:47
 * @return  等待页面加载完成
 */
function waitTabComplete(tabId: number, timeoutMs = 15000) {
  return new Promise<boolean>((resolve) => {
    let done = false
    const timer = setTimeout(() => finish(false), timeoutMs)
    function finish(ok: boolean) {
      if (done) return
      done = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve(ok)
    }
    function listener(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish(true)
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

/**
 * @description:
 * @author: wdn
 * @date: 2026/7/7 13:34
 * @return 切换语言
 */
async function prepareOzonRussianLocaleInPage(urls: Array<{ url?: string }>) {
  const sku = getFirstSkuFromUrls(urls)
  if (!sku) return

  const host = getOzonHostFromUrls(urls)
  const tab = await chrome.tabs.create({
    url: `${host}/product/${encodeURIComponent(sku)}/`,
    active: false,//后台打开
  })
  if (!tab.id) return

  try {
    //等待页面加载完成
    await waitTabComplete(tab.id)
    //执行一段js 模拟
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async () => {
        const langEl = document.getElementsByClassName('uw_n9a')[0]
        const language = langEl ? String((langEl as HTMLElement).innerText || '').trim() : ''
        const htmlLang = String(document.documentElement?.lang || '').toLowerCase()
        const isRussian = language === 'RU' || htmlLang === 'ru' || htmlLang.startsWith('ru-')
        if (isRussian) {
          return { switched: false, localeOk: true, currencyOk: true }
        }

        //模拟用户在页面请求 切换语言
        async function post(action: string, body: Record<string, unknown>) {
          const res = await fetch(`/api/composer-api.bx/_action/${action}`, {
            method: 'POST',
            credentials: 'include',//请求需要携带 cookie
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          return res.ok
        }

        const localeOk = await post('saveLocale', { locale: 'ru' })
        const currencyOk = await post('changeCurrency', { currency_code: 'RUB' })
        return { switched: localeOk, localeOk, currencyOk }
      },
    })

    const result = results?.[0]?.result as { switched?: boolean } | undefined
    if (result?.switched) {
      //刷新页面
      chrome.tabs.reload(tab.id)
      await waitTabComplete(tab.id)
      //等待500ms
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  } catch (error) {
    console.warn('[mjgd][fetchProductInfo] prepare RU locale failed:', error)
  } finally {
    //关闭临时页
    chrome.tabs.remove(tab.id, () => {
      if (chrome.runtime.lastError) {
        console.warn('[mjgd][fetchProductInfo] close locale prep tab:', chrome.runtime.lastError.message)
      }
    })
  }
}

function openOzonTabInBackground(
  url: string,
  sourceTabId?: number,
  sourceWindowId?: number,
  taskId?: string,
  pageKey?: string | number,
): Promise<{ ok: boolean; tabId?: number; error?: string }> {
  return new Promise((resolve) => {
    const fullUrl = appendBcsFetchTaskIdToUrl(url, taskId || '')
    chrome.tabs.create(
      {
        url: fullUrl,
        active: false,
        openerTabId: sourceTabId != null ? sourceTabId : undefined,
      },
      (tab) => {
        if (chrome.runtime.lastError || !tab?.id) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError?.message || 'create tab failed',
          })
          return
        }
        if (taskId && pageKey != null && pendingOzonFetchProductInfo[taskId]) {
          pendingOzonFetchProductInfo[taskId].pages[String(pageKey)] = tab.id
        }
        const params = parseOzonFetchParamsFromUrl(fullUrl)
        ozonFetchTabMeta[tab.id] = {
          taskId: taskId || params.taskId,
          page: params.page || String(pageKey ?? ''),
          sku: params.sku,
          startUrl: fullUrl,
          collected: false,
        }
        resolve({ ok: true, tabId: tab.id })
      },
    )
  })
}

export async function handleOzonFetchProductInfoStart(
  request: {
    taskId?: string
    urls?: Array<{ url?: string; page?: string | number }>
    erpTabId?: number
    erpWindowId?: number
  },
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; taskId?: string; tabIds?: number[]; error?: string }> {
  const taskId = request.taskId
  const urls = Array.isArray(request.urls) ? request.urls : []
  if (!taskId || !urls.length) {
    return { success: false, error: 'missing taskId or urls' }
  }

  let sourceTabId = sender?.tab?.id ?? request.erpTabId
  let sourceWindowId = sender?.tab?.windowId ?? request.erpWindowId

  if (sourceTabId == null) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tabs[0]) {
      sourceTabId = tabs[0].id
      sourceWindowId = tabs[0].windowId
    }
  }

  pendingOzonFetchProductInfo[taskId] = {
    erpTabId: sourceTabId,
    erpWindowId: sourceWindowId,
    pages: {},
  }

  //切换语言
  await prepareOzonRussianLocaleInPage(urls)

  const openedTabIds: number[] = []
  for (const item of urls) {
    if (!item?.url) continue
    const res = await openOzonTabInBackground(
      item.url,
      sourceTabId,
      sourceWindowId,
      taskId,
      item.page != null ? item.page : '',
    )
    if (res.ok && res.tabId != null) openedTabIds.push(res.tabId)
  }

  refocusErpTab(sourceWindowId, sourceTabId)
  ;[80, 200, 500, 1200].forEach((ms) => {
    setTimeout(() => refocusErpTab(sourceWindowId, sourceTabId), ms)
  })

  return { success: true, taskId, tabIds: openedTabIds }
}

export async function handleOpenTabBackgroundRequest(
  request: {
    url?: string
    taskId?: string
    page?: string | number
    erpTabId?: number
    erpWindowId?: number
  },
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; tabId?: number; error?: string }> {
  const sourceTabId = sender?.tab?.id ?? request.erpTabId
  const sourceWindowId = sender?.tab?.windowId ?? request.erpWindowId
  let taskId: string | null = request.taskId || null
  try {
    if (!taskId && request.url) {
      taskId = new URL(request.url).searchParams.get('bcsFetchTaskId')
    }
  } catch {
    taskId = null
  }

  if (!request.url) {
    return { success: false, error: 'missing url' }
  }

  const res = await openOzonTabInBackground(
    request.url,
    sourceTabId,
    sourceWindowId,
    taskId || undefined,
    request.page,
  )
  if (!res.ok) {
    return { success: false, error: res.error }
  }

  refocusErpTab(sourceWindowId, sourceTabId)
  ;[80, 200, 500, 1200].forEach((ms) => {
    setTimeout(() => refocusErpTab(sourceWindowId, sourceTabId), ms)
  })

  return { success: true, tabId: res.tabId }
}

export function handleCloseTabRequest(
  request: { tabId?: number },
  sendResponse: (response?: unknown) => void,
) {
  const tabId = request.tabId
  if (tabId == null) {
    sendResponse({ success: false, error: 'missing tabId' })
    return
  }
  chrome.tabs.remove(tabId, () => {
    sendResponse({
      success: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message,
    })
  })
}

export function setupOzonFetchProductInfoListener() {
  if (fetchListenerInstalled) return
  fetchListenerInstalled = true

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab?.url) return

    let meta = getOzonFetchTabMeta(tabId)
    if (!meta) {
      if (!tab.url.includes('ac=fetchProductInfo')) return
      const params = parseOzonFetchParamsFromUrl(tab.url)
      if (!params.taskId) return
      ozonFetchTabMeta[tabId] = {
        taskId: params.taskId,
        page: params.page,
        sku: params.sku,
        collected: false,
      }
      meta = ozonFetchTabMeta[tabId]
    }

    const collectUrl = tab.url.includes('ac=fetchProductInfo')
      ? tab.url
      : meta.startUrl || tab.url
    collectOzonFetchProductInfoFromTab(tabId, collectUrl, 0)
  })
}
