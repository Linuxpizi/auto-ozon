const STORAGE_PREFIX = 'mjgd:host:'

type ChromeRuntimeLike = {
  id?: string
  getURL?: (path: string) => string
  sendMessage?: (message: any, callback?: (response: any) => void) => void
  onMessage?: {
    addListener?: (listener: (...args: any[]) => void) => void
    removeListener?: (listener: (...args: any[]) => void) => void
  }
  lastError?: { message?: string }
}

type ChromeStorageAreaLike = {
  get?: (keys: string[] | string | null, callback: (items: Record<string, any>) => void) => void
  set?: (items: Record<string, any>, callback?: () => void) => void
  remove?: (keys: string[] | string, callback?: () => void) => void
}

const getChromeLike = (): any => {
  if (typeof globalThis === 'undefined') {
    return undefined
  }

  return (globalThis as any).chrome
}

export const getExtensionRuntime = (): ChromeRuntimeLike | null => {
  const runtime = getChromeLike()?.runtime as ChromeRuntimeLike | undefined
  if (!runtime?.id) {
    return null
  }

  return runtime
}

export const hasExtensionRuntime = (): boolean => !!getExtensionRuntime()

export const hasExtensionMessaging = (): boolean => {
  const runtime = getExtensionRuntime()
  return !!runtime?.sendMessage && !!runtime?.onMessage?.addListener
}

export const getExtensionAssetUrl = (path: string): string | null => {
  const runtime = getExtensionRuntime()
  if (!runtime?.getURL) {
    return null
  }

  return runtime.getURL(path)
}

export const resolveAssetUrl = (
  extensionPath: string,
  fallbackUrl: string
): string => getExtensionAssetUrl(extensionPath) || fallbackUrl

const getChromeStorageArea = (): ChromeStorageAreaLike | null => {
  const storage = getChromeLike()?.storage?.local as ChromeStorageAreaLike | undefined
  if (!storage?.get || !storage?.set || !storage?.remove) {
    return null
  }

  return storage
}

export const getLocalStorageItem = (key: string): string | null => {
  if (typeof localStorage === 'undefined') {
    return null
  }

  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${key}`)
  } catch {
    return null
  }
}

export const setLocalStorageItem = (key: string, value: string): void => {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, value)
  } catch {
    // ignore write failures in restricted hosts
  }
}

export const removeLocalStorageItem = (key: string): void => {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`)
  } catch {
    // ignore delete failures in restricted hosts
  }
}

export const readStorageValue = async (key: string): Promise<any> => {
  const storage = getChromeStorageArea()
  if (storage?.get) {
    return new Promise((resolve) => {
      storage.get?.([key], (result) => resolve(result?.[key] ?? null))
    })
  }

  return getLocalStorageItem(key)
}

export const writeStorageValue = async (key: string, value: any): Promise<void> => {
  const storage = getChromeStorageArea()
  if (storage?.set) {
    return new Promise((resolve) => {
      storage.set?.({ [key]: value }, () => resolve())
    })
  }

  if (value !== undefined && value !== null) {
    setLocalStorageItem(key, String(value))
  }
}

export const removeStorageValue = async (key: string): Promise<void> => {
  const storage = getChromeStorageArea()
  if (storage?.remove) {
    return new Promise((resolve) => {
      storage.remove?.([key], () => resolve())
    })
  }

  removeLocalStorageItem(key)
}

/** 按前缀批量删除 chrome.storage.local 键（登出清 scoped 配置等） */
export const removeStorageKeysByPrefix = async (prefix: string): Promise<void> => {
  const storage = getChromeStorageArea()
  if (!storage?.get || !storage?.remove) return
  return new Promise((resolve) => {
    storage.get!(null, (items) => {
      const keys = Object.keys(items || {}).filter(
        (key) => key === prefix || key.startsWith(`${prefix}_`),
      )
      if (!keys.length) {
        resolve()
        return
      }
      storage.remove!(keys, () => resolve())
    })
  })
}
