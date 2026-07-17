import { readStorageValue } from '../../../utils/runtime'
import {
  DEFAULT_AI_STEP_CONFIG,
  normalizeAiStepConfig,
  type AiAutoSelectAiStepConfig,
} from '../aiAutoSelect/types'
import { isSettingsMissing, syncFromServer } from '../userSystemSettings/userSystemSettingsSync'

export type ResolvedAiStepRuntime = AiAutoSelectAiStepConfig

/** 读取 AI 流程配置：优先 override，否则读取并初始化本地 mjgd_ai_step。 */
export async function resolveAiStepRuntime(
  override?: AiAutoSelectAiStepConfig | null,
): Promise<ResolvedAiStepRuntime> {
  if (override) {
    return normalizeAiStepConfig(override)
  }
  let raw = await readStorageValue('mjgd_ai_step')
  if (await isSettingsMissing()) {
    try {
      await syncFromServer()
      raw = await readStorageValue('mjgd_ai_step')
    } catch (error) {
      console.warn('[aiStepConfig] 初始化本地配置失败:', error)
    }
  }
  if (raw) {
    try {
      return normalizeAiStepConfig(JSON.parse(String(raw)))
    } catch {
      return { ...DEFAULT_AI_STEP_CONFIG }
    }
  }
  return { ...DEFAULT_AI_STEP_CONFIG }
}

export function hasPostAiStepEnabled(config: ResolvedAiStepRuntime): boolean {
  return config.imageTranslateCheck || config.imageRefineCheck || config.imageRichContentCheck
}
