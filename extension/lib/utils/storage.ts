import type { PluginSettings } from './types'
import { DEFAULT_SETTINGS } from './types'

const SETTINGS_KEY = 'plugin_settings'

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
