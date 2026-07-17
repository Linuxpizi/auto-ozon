import { createDraftItemId } from './types'

const TAB_SESSION_PREFIX = 'auto_select_tab_'

type ChromeTabsLike = {
  getCurrent?: (callback: (tab: { id?: number } | undefined) => void) => void
}

type ChromeSessionStorageLike = {
  get?: (keys: string[] | string, callback: (items: Record<string, unknown>) => void) => void
  set?: (items: Record<string, unknown>, callback?: () => void) => void
}

function getChromeTabs(): ChromeTabsLike | null {
  const tabs = (globalThis as { chrome?: { tabs?: ChromeTabsLike } }).chrome?.tabs
  return tabs?.getCurrent ? tabs : null
}

function getChromeSessionStorage(): ChromeSessionStorageLike | null {
  const storage = (globalThis as { chrome?: { storage?: { session?: ChromeSessionStorageLike } } }).chrome?.storage?.session
  if (!storage?.get || !storage?.set) return null
  return storage
}

/** 创建选品会话 ID，与 draft item id 同策略 */
export function createSessionId(): string {
  return createDraftItemId()
}

function tabSessionKey(tabId: number): string {
  return `${TAB_SESSION_PREFIX}${tabId}`
}

async function getCurrentTabId(): Promise<number | null> {
  const tabs = getChromeTabs()
  if (!tabs?.getCurrent) return null
  return new Promise((resolve) => {
    tabs.getCurrent!((tab) => resolve(tab?.id ?? null))
  })
}

/** 读取当前标签页绑定的选品 sessionId */
export async function getTabSessionId(): Promise<string | null> {
  const tabId = await getCurrentTabId()
  if (tabId == null) return null
  const storage = getChromeSessionStorage()
  if (!storage) return null
  return new Promise((resolve) => {
    storage.get!([tabSessionKey(tabId)], (result) => {
      const value = result?.[tabSessionKey(tabId)]
      resolve(typeof value === 'string' && value ? value : null)
    })
  })
}

/** 将 sessionId 绑定到当前标签页（跨子域跳转后由 pending 恢复时调用） */
export async function setTabSessionId(sessionId: string): Promise<void> {
  const tabId = await getCurrentTabId()
  if (tabId == null) return
  const storage = getChromeSessionStorage()
  if (!storage) return
  return new Promise((resolve) => {
    storage.set!({ [tabSessionKey(tabId)]: sessionId }, () => resolve())
  })
}

/** 无绑定则创建新 sessionId 并写入当前 Tab */
export async function ensureTabSessionId(): Promise<string> {
  const existing = await getTabSessionId()
  if (existing) return existing
  const sessionId = createSessionId()
  await setTabSessionId(sessionId)
  return sessionId
}

/** 显式指定 sessionId 绑定到当前 Tab（autoStart 落地、续采恢复） */
export async function assignTabSessionId(sessionId: string): Promise<void> {
  await setTabSessionId(sessionId)
}
