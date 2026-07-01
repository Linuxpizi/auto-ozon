import type { PluginSettings } from './types'
import { DEFAULT_SETTINGS } from './types'

const SETTINGS_KEY = 'plugin_settings'

/** 获取插件设置 */
export async function getSettings(): Promise<PluginSettings> {
  const result = await browser.storage.local.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) }
}

/** 保存插件设置 */
export async function saveSettings(settings: PluginSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings })
}
