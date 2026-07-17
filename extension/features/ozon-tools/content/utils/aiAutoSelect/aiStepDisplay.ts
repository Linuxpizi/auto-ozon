import { isListingPriceAdjustActive, isListingPriceAdjustPercentOp } from './listingPriceAdjust'
import { normalizeAiStepConfig, type AiAutoSelectAiStepConfig, type AutomationMode, type KeywordMatchMode, type ListingPriceAdjustConfig } from './types'

export const KEYWORD_MATCH_MODE_LABELS: Record<KeywordMatchMode, string> = {
  fuzzy: '模糊匹配',
  strict: '精准匹配',
}

export const AUTOMATION_MODE_LABELS: Record<AutomationMode, string> = {
  semi: '半自动',
  full: '全自动',
}

/** 与 AiProcessStepBlock 选项文案对齐 */
const IMAGE_TRANSLATE_TYPE_LABELS = {
  package: '本地翻译服务',
  points: '备用翻译服务',
} as const

const IMAGE_SELECT_LABELS = {
  sku: '全部变体图片',
  sku_and_other: '全部变体图片+详情图',
} as const

const IMAGE_RICH_CONTENT_TEMPLATE_LABELS = {
  other: '详情图',
  sku: '商品图',
  sku_and_other: '商品图+详情图',
} as const

const IMAGE_RICH_CONTENT_SELECT_LABELS = {
  sku: '全部变体',
} as const

const AI_FILL_STEP_LABEL = 'AI帮填'

const LISTING_PRICE_ADJUST_OP_LABELS: Record<ListingPriceAdjustConfig['op'], string> = {
  add: '加',
  sub: '减',
  mul: '乘',
  div: '除',
  pct_up: '上涨 (百分比)',
  pct_down: '下调 (百分比)',
}

/** 全自动模式：售价调整配置展示行 */
export function formatListingPriceAdjustLine(config?: ListingPriceAdjustConfig | null): string | null {
  if (!isListingPriceAdjustActive(config)) return null
  const opLabel = LISTING_PRICE_ADJUST_OP_LABELS[config.op]
  const valueText = isListingPriceAdjustPercentOp(config.op) ? `${config.value}%` : String(config.value)
  return `售价调整：${opLabel} ${valueText}`
}

/** 全自动模式：生成已启用 AI 流程项的详情行（名称-子选项-执行内容），直接读 config.aiStep 固化值 */
export function formatAiStepDetailLines(
  aiStep: Partial<AiAutoSelectAiStepConfig> | null | undefined,
  maxVariantExecutionCount?: number,
): string[] {
  const step = normalizeAiStepConfig(aiStep)
  const fillLabel = maxVariantExecutionCount != null ? `${AI_FILL_STEP_LABEL}：最大执行变体数量：${maxVariantExecutionCount}` : AI_FILL_STEP_LABEL
  const lines: string[] = [fillLabel]
  if (step.imageTranslateCheck) {
    const typeLabel = IMAGE_TRANSLATE_TYPE_LABELS[step.imageTranslateType]
    const selectLabel = IMAGE_SELECT_LABELS[step.imageTranslateSelect]
    lines.push(`图片翻译：${typeLabel}-${selectLabel}`)
  }
  if (step.imageRefineCheck) {
    const templateLabel = step.imageRefineTemplateName?.trim() || step.imageRefineTemplate.trim() || '未选择模板'
    const selectLabel = IMAGE_SELECT_LABELS[step.imageRefineSelect]
    lines.push(`AI改图：${templateLabel}-${selectLabel}`)
  }
  if (step.imageRichContentCheck) {
    const templateLabel = IMAGE_RICH_CONTENT_TEMPLATE_LABELS[step.imageRichContentTemplate]
    const selectLabel = IMAGE_RICH_CONTENT_SELECT_LABELS[step.imageRichContentSelect]
    lines.push(`富内容：${templateLabel}-${selectLabel}`)
  }
  return lines
}
