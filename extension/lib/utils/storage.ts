import type { AuthSession, PluginSettings } from './types'
import { DEFAULT_SETTINGS } from './types'

const SETTINGS_KEY = 'plugin_settings'
const AUTH_KEY = 'plugin_auth'

/** 获取插件设置 */
export async function getSettings(): Promise<PluginSettings> {
  const result = await browser.storage.local.get(SETTINGS_KEY)
  const stored = (result[SETTINGS_KEY] || {}) as Partial<PluginSettings>
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    ozon: { ...DEFAULT_SETTINGS.ozon, ...stored.ozon },
    wb: { ...DEFAULT_SETTINGS.wb, ...stored.wb },
    '1688': { ...DEFAULT_SETTINGS['1688'], ...stored['1688'] },
    pdd: { ...DEFAULT_SETTINGS.pdd, ...stored.pdd },
  }
}

/** 保存插件设置 */
export async function saveSettings(settings: PluginSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings })
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const result = await browser.storage.local.get(AUTH_KEY)
  return (result[AUTH_KEY] as AuthSession | undefined) || null
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  await browser.storage.local.set({ [AUTH_KEY]: session })
}

export async function clearAuthSession(): Promise<void> {
  await browser.storage.local.remove(AUTH_KEY)
}
