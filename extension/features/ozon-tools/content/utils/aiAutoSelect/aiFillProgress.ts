import type { TransformedGoodsData } from '../collectedGoodsTransform'
import { readStorageValue } from '../../../utils/runtime'
import type { AiAutoSelectAiStepConfig } from './types'

/** AI 帮填进度模拟：基础信息固定耗时 + 每条 SKU 耗时 */
export const BASIC_INFO_SECONDS = 15
export const SKU_PER_ITEM_SECONDS = 5
export const TRANSLATE_PER_IMAGE_SECONDS = 1
export const REFINE_PER_IMAGE_SECONDS = 0.5
export const RICH_CONTENT_SECONDS = 1
export const AI_FILL_PROGRESS_CAP = 99

const AI_STEP_STORAGE_KEY = 'mjgd_ai_step'

export type AiFillStepOptions = {
  imageTranslateCheck: boolean
  imageTranslateSelect: 'sku' | 'sku_and_other'
  imageRefineCheck: boolean
  imageRefineSelect: 'sku' | 'sku_and_other'
  imageRichContentCheck: boolean
}

const DEFAULT_AI_FILL_STEP_OPTIONS: AiFillStepOptions = {
  imageTranslateCheck: false,
  imageTranslateSelect: 'sku',
  imageRefineCheck: false,
  imageRefineSelect: 'sku',
  imageRichContentCheck: false,
}

type GoodsImageLists = {
  goodsImgList: string[]
  otherImgList: string[]
  allImgList: string[]
}

/** 将选品 config.aiStep 转为帮填流程选项（不含模板 id 等执行细节外的字段） */
export function toAiFillStepOptions(config: AiAutoSelectAiStepConfig): AiFillStepOptions {
  return {
    imageTranslateCheck: config.imageTranslateCheck,
    imageTranslateSelect:
      config.imageTranslateSelect === 'sku_and_other' ? 'sku_and_other' : 'sku',
    imageRefineCheck: config.imageRefineCheck,
    imageRefineSelect:
      config.imageRefineSelect === 'sku_and_other' ? 'sku_and_other' : 'sku',
    imageRichContentCheck: config.imageRichContentCheck,
  }
}

/** 优先使用本次选品覆盖配置，否则读全局设置页 */
export async function resolveAiFillStepOptions(
  override?: AiAutoSelectAiStepConfig | null,
): Promise<AiFillStepOptions> {
  if (override) {
    return toAiFillStepOptions(override)
  }
  return readAiFillStepOptions()
}

/** 从插件 storage 读取设置页 AI 执行流程选项 */
export async function readAiFillStepOptions(): Promise<AiFillStepOptions> {
  try {
    const raw = await readStorageValue(AI_STEP_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AI_FILL_STEP_OPTIONS }
    const step = JSON.parse(raw) as Record<string, unknown>
    return {
      imageTranslateCheck: Boolean(step.imageTranslateCheck),
      imageTranslateSelect:
        step.imageTranslateSelect === 'sku_and_other' ? 'sku_and_other' : 'sku',
      imageRefineCheck: Boolean(step.imageRefineCheck),
      imageRefineSelect:
        step.imageRefineSelect === 'sku_and_other' ? 'sku_and_other' : 'sku',
      imageRichContentCheck: Boolean(step.imageRichContentCheck),
    }
  } catch {
    return { ...DEFAULT_AI_FILL_STEP_OPTIONS }
  }
}

/** 对齐 AiCollectModal.getGoodsImg：统计变体图与详情图 */
export function collectTransformedGoodsImages(
  transformed: TransformedGoodsData | null | undefined,
  getAll: boolean,
): GoodsImageLists {
  if (!transformed) {
    return { goodsImgList: [], otherImgList: [], allImgList: [] }
  }

  const goodsImgList: string[] = []
  const skuMatrix = transformed.sku_matrix ?? []
  skuMatrix.forEach((sku) => {
    const imgList = sku.skuImgList ?? []
    imgList.forEach((skuItem) => {
      const transformUrl = skuItem.transformUrl
      if (!transformUrl) return
      if (getAll) {
        goodsImgList.push(transformUrl)
      } else if (transformUrl === skuItem.url) {
        goodsImgList.push(transformUrl)
      }
    })
  })

  const detailImgList = transformed.detailImgList ?? []
  let otherImgList: string[] = []
  if (getAll) {
    otherImgList = detailImgList
      .map((item) => item.transformUrl)
      .filter((url): url is string => Boolean(url))
  } else {
    otherImgList = detailImgList
      .filter((item) => item.transformUrl === item.url && item.transformUrl)
      .map((item) => item.transformUrl)
      .filter((url): url is string => Boolean(url))
  }

  return {
    goodsImgList: [...new Set(goodsImgList)],
    otherImgList: [...new Set(otherImgList)],
    allImgList: [...new Set([...goodsImgList, ...otherImgList])],
  }
}

/** 按执行流程设置统计待翻译/待改图张数 */
export function countImagesForAiStep(
  transformed: TransformedGoodsData | null | undefined,
  stepOptions: AiFillStepOptions,
  step: 'translate' | 'refine',
): number {
  const getAll = step === 'refine'
  const { goodsImgList, allImgList } = collectTransformedGoodsImages(transformed, getAll)

  if (step === 'translate') {
    if (!stepOptions.imageTranslateCheck) return 0
    return stepOptions.imageTranslateSelect === 'sku_and_other'
      ? allImgList.length
      : goodsImgList.length
  }

  if (!stepOptions.imageRefineCheck) return 0
  return stepOptions.imageRefineSelect === 'sku_and_other'
    ? allImgList.length
    : goodsImgList.length
}

/** 计算 AI 帮填预计耗时
 * @param skuCount 商品数量
 * @param stepOptions 执行流程选项
 * @param transformed 转换后的商品数据
 * @returns 预计耗时（秒）
 */
export function calcAiFillEstimatedSeconds(
  skuCount: number,
  stepOptions: AiFillStepOptions = DEFAULT_AI_FILL_STEP_OPTIONS,
  transformed?: TransformedGoodsData | null,
): number {
  let seconds = BASIC_INFO_SECONDS + skuCount * SKU_PER_ITEM_SECONDS

  if (transformed) {
    if (stepOptions.imageTranslateCheck) {
      seconds +=
        countImagesForAiStep(transformed, stepOptions, 'translate') *
        TRANSLATE_PER_IMAGE_SECONDS
    }
    if (stepOptions.imageRefineCheck) {
      seconds +=
        countImagesForAiStep(transformed, stepOptions, 'refine') *
        REFINE_PER_IMAGE_SECONDS
    }
  }

  if (stepOptions.imageRichContentCheck) {
    seconds += RICH_CONTENT_SECONDS
  }

  return seconds
}

/** 计算 AI 帮填预计耗时（毫秒）
 * @param skuCount 商品数量
 * @param stepOptions 执行流程选项
 * @param transformed 转换后的商品数据
 * @returns 预计耗时（毫秒）
 */
export function calcAiFillEstimatedMs(
  skuCount: number,
  stepOptions: AiFillStepOptions = DEFAULT_AI_FILL_STEP_OPTIONS,
  transformed?: TransformedGoodsData | null,
): number {
  return calcAiFillEstimatedSeconds(skuCount, stepOptions, transformed) * 1000
}

/** 格式化为「预计耗时x分x秒」 */
export function formatEstimatedDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds === 0) return '预计耗时0秒'
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (minutes > 0 && remainSeconds > 0) {
    return `预计耗时${minutes}分${remainSeconds}秒`
  }
  if (minutes > 0) {
    return `预计耗时${minutes}分`
  }
  return `预计耗时${remainSeconds}秒`
}

export type AiFillProgressSimulator = {
  start: () => void
  complete: (onFinish?: () => void) => void
  dispose: () => void
}

/** requestAnimationFrame 模拟进度：线性增至 99%，接口返回后由 complete 跳至 100% */
export function createAiFillProgressSimulator(options: {
  estimatedMs: number
  onUpdate: (percent: number) => void
  completeDelayMs?: number
}): AiFillProgressSimulator {
  let rafId: number | null = null
  let startTime = 0
  let disposed = false
  let completed = false

  const cancelRaf = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const tick = () => {
    if (disposed || completed) return
    const elapsed = performance.now() - startTime
    const ratio = options.estimatedMs > 0 ? elapsed / options.estimatedMs : 1
    const percent = Math.min(AI_FILL_PROGRESS_CAP, ratio * AI_FILL_PROGRESS_CAP)
    options.onUpdate(percent)
    if (percent < AI_FILL_PROGRESS_CAP) {
      rafId = requestAnimationFrame(tick)
    }
  }

  return {
    start() {
      if (disposed || completed) return
      cancelRaf()
      startTime = performance.now()
      rafId = requestAnimationFrame(tick)
    },
    complete(onFinish?: () => void) {
      if (disposed) {
        onFinish?.()
        return
      }
      completed = true
      cancelRaf()
      options.onUpdate(100)
      const delay = options.completeDelayMs ?? 300
      window.setTimeout(() => {
        if (!disposed) onFinish?.()
      }, delay)
    },
    dispose() {
      disposed = true
      completed = true
      cancelRaf()
    },
  }
}
