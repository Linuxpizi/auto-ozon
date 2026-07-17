import { apiService } from '../../../utils/api'
import { applyTransformUrl } from '../../../utils/imageTransform'
import { ensureHttpImageUrlOnOss } from '../../../utils/imageOssUpload'
import { processImageWithOptions, type ProcessImageOptions } from '../../../utils/imageProcessor'
import {
  FEATURE_SCOPE_STORAGE_KEY,
  SKU_VARIANT_FEATURE_STORAGE_KEY,
  normalizeFeatureName,
} from '../ozonAiFillAndSubmit'
// @ts-ignore local JS utility has no declaration file
import dataConverter from '../../components/richTextEditor/utils/dataConverter.js'
import type { ResolvedAiStepRuntime } from './aiStepConfig'
import { recordSessionStepFailure } from './sessionSerialize'
import type { ProductSession } from './types'

type ImgTranslateItem = { transformUrl: string; resultUrl: string }

export function getGoodsImgFromTransformed(
  transformed: Record<string, unknown> | null,
  getAll = false,
): { goodsImgList: string[]; otherImgList: string[]; allImgList: string[] } {
  if (!transformed) return { goodsImgList: [], otherImgList: [], allImgList: [] }
  const skuMatrix = Array.isArray(transformed.sku_matrix) ? transformed.sku_matrix : []
  const detailList = Array.isArray(transformed.detailImgList) ? transformed.detailImgList : []
  const goodsImgList: string[] = []
  skuMatrix.forEach((sku: Record<string, unknown>) => {
    const imgList = Array.isArray(sku?.skuImgList) ? sku.skuImgList : []
    imgList.forEach((skuItem: Record<string, unknown>) => {
      if (getAll || skuItem.transformUrl === skuItem.url) {
        goodsImgList.push(String(skuItem.transformUrl ?? ''))
      }
    })
  })
  const otherImgList = getAll
    ? detailList.map((i: Record<string, unknown>) => String(i.transformUrl ?? ''))
    : detailList.filter((i: Record<string, unknown>) => i.transformUrl === i.url).map((i: Record<string, unknown>) => String(i.transformUrl ?? ''))
  const all = [...goodsImgList, ...otherImgList].filter(Boolean)
  return { goodsImgList: [...new Set(goodsImgList)], otherImgList: [...new Set(otherImgList)], allImgList: [...new Set(all)] }
}

export function replaceImageUrlsOnSession(session: ProductSession, resultUrlList: ImgTranslateItem[]): void {
  const transformed = session.transformed
  if (!transformed) return
  const skuMatrix = Array.isArray(transformed.sku_matrix) ? transformed.sku_matrix : []
  skuMatrix.forEach((sku: Record<string, unknown>) => {
    const imgList = Array.isArray(sku?.skuImgList) ? sku.skuImgList : []
    imgList.forEach((skuItem: Record<string, unknown>) => {
      resultUrlList.forEach((resItem) => {
        if (skuItem.transformUrl === resItem.transformUrl && resItem.resultUrl) {
          applyTransformUrl(skuItem as { url: string; transformUrl: string }, resItem.resultUrl)
        }
      })
    })
  })
  const detailImgList = Array.isArray(transformed.detailImgList) ? transformed.detailImgList : []
  detailImgList.forEach((detailItem: Record<string, unknown>) => {
    resultUrlList.forEach((resItem) => {
      if (detailItem.transformUrl === resItem.transformUrl && resItem.resultUrl) {
        applyTransformUrl(detailItem as { url: string; transformUrl: string }, resItem.resultUrl)
      }
    })
  })
}

async function pollingImgTranslateResult(requestIds: string[], service: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    let attempt = 0
    const timer = setInterval(async () => {
      attempt += 1
      if (attempt >= 20) {
        clearInterval(timer)
        reject(new Error('翻译任务超时'))
        return
      }
      if (service === 'ali') {
        const aliRes = await apiService.queryBatchImageTranslateALI(requestIds)
        if (aliRes.code === 200) {
          const list = aliRes.data || []
          const first = list[0] as { taskStatus?: string }
          if (first?.taskStatus === 'SUCCEEDED') {
            clearInterval(timer)
            resolve(list as Record<string, unknown>[])
          } else if (first?.taskStatus !== 'PENDING' && first?.taskStatus !== 'RUNNING') {
            clearInterval(timer)
            reject(new Error(`翻译失败：${first?.taskStatus}`))
          }
        }
      } else {
        const xjRes = await apiService.queryBatchImageTranslate(requestIds)
        if (xjRes.code === 200) {
          const data = xjRes.data?.content || {}
          const value = (data as Record<string, Record<string, unknown>>)[requestIds[0]!]
          if (value?.code === 200 && value?.sslUrl) {
            clearInterval(timer)
            resolve([value])
          } else if (value?.code !== 114) {
            clearInterval(timer)
            reject(new Error(`翻译失败：${value?.code}`))
          }
        }
      }
    }, 3000)
  })
}

async function translateUrls(resultUrlList: ImgTranslateItem[], service: 'ali' | 'xiangji'): Promise<ImgTranslateItem[]> {
  for (let index = 0; index < resultUrlList.length; index++) {
    const urlItem = resultUrlList[index]!
    if (service === 'ali') {
      const aliRes = await apiService.addBatchImageTranslateALI({ imageUrls: [urlItem.transformUrl], sourceLang: 'zh', targetLang: 'ru' })
      const taskIds = aliRes.data?.taskIds ?? []
      if (aliRes.code === 200 && taskIds.length) {
        try {
          const list = await pollingImgTranslateResult(taskIds, 'ali')
          urlItem.resultUrl = String((list[0] as { imageUrl?: string })?.imageUrl ?? '')
        } catch { /* skip */ }
      }
    } else {
      const xjRes = await apiService.addBatchImageTranslate({ urls: [urlItem.transformUrl], language: 'CHS>RUS' })
      const content = xjRes.data?.content || []
      if (xjRes.code === 200 && content.length) {
        try {
          const list = await pollingImgTranslateResult(content, 'xiangji')
          urlItem.resultUrl = String((list[0] as { sslUrl?: string })?.sslUrl ?? '')
        } catch { /* skip */ }
      }
    }
  }
  return resultUrlList
}

export async function translateImagesOnSession(session: ProductSession, aiStep: ResolvedAiStepRuntime) {
  const { goodsImgList, allImgList } = getGoodsImgFromTransformed(session.transformed)
  const urls = aiStep.imageTranslateSelect === 'sku_and_other' ? allImgList : goodsImgList
  if (!urls.length) return { failedCount: 0, totalCount: 0 }
  const list = await translateUrls(urls.map((url) => ({ transformUrl: url, resultUrl: '' })), aiStep.imageTranslateType === 'points' ? 'ali' : 'xiangji')
  replaceImageUrlsOnSession(session, list)
  const failedCount = list.filter((i) => !i.resultUrl).length
  if (failedCount > 0) recordSessionStepFailure(session, 'translate')
  return { failedCount, totalCount: urls.length }
}

function templateToOptions(template: Record<string, unknown> | undefined): ProcessImageOptions {
  if (!template) return {}
  const num = (v: unknown) => (v != null && v !== '' ? Number(v) : undefined)
  const str = (v: unknown) => (v != null && v !== '' ? String(v) : undefined)
  const isOn = (v: unknown) => v === '0' || v === 0
  const watermarkType = template.imageWatermarkUrl ? 'image' : 'text'
  const textWatermark = str(template.textWatermark) || ''
  const imageWatermarkUrl = str(template.imageWatermarkUrl) || ''
  const watermarkPosition = str(template.watermarkPosition) || 'bottom-right'
  const isFillWatermark = watermarkPosition === 'fill'
  return {
    enableZoom: isOn(template.isEnlarge),
    enableBorder: isOn(template.isFrame),
    customBorderUrl: str(template.customFrameUrl) || null,
    enableWatermark: isOn(template.isWatermark),
    enablePixelPerturbation: isOn(template.isPct),
    enableAspectRatio: isOn(template.isImgSize),
    aspectRatioWidth: num(template.width) ?? 1,
    aspectRatioHeight: num(template.height) ?? 1,
    watermarkType,
    textWatermark,
    imageWatermarkUrl,
    watermarkOptions: {
      fill: isFillWatermark,
      ...(isFillWatermark ? {} : { position: watermarkPosition }),
    },
  }
}

export async function refineImagesOnSession(session: ProductSession, aiStep: ResolvedAiStepRuntime): Promise<number> {
  const { goodsImgList, allImgList } = getGoodsImgFromTransformed(session.transformed, true)
  const workingUrls = aiStep.imageRefineSelect === 'sku_and_other' ? allImgList : goodsImgList
  if (!workingUrls.length) return 0
  const res = await apiService.getRefineTemplateList()
  const template = (Array.isArray(res?.rows) ? res.rows : []).find((t: Record<string, unknown>) => String(t.id) === String(aiStep.imageRefineTemplate))
  const options = templateToOptions(template)
  if (!options.enableZoom && !options.enableBorder && !options.enableWatermark && !options.enablePixelPerturbation && !options.enableAspectRatio) return 0
  const resultUrlList: ImgTranslateItem[] = []
  let failedCount = 0
  for (let i = 0; i < workingUrls.length; i++) {
    try {
      const dataUrl = await processImageWithOptions(workingUrls[i]!, options)
      const ossUrl = await ensureHttpImageUrlOnOss(dataUrl, `template_src_${i}_${Date.now()}`)
      resultUrlList.push({ transformUrl: workingUrls[i]!, resultUrl: ossUrl })
    } catch { failedCount += 1 }
  }
  replaceImageUrlsOnSession(session, resultUrlList)
  if (failedCount > 0) recordSessionStepFailure(session, 'refine')
  return failedCount
}

function isJsonRichTextFeatureAttr(attr: Record<string, unknown>): boolean {
  return normalizeFeatureName(String(attr?.name || '')).includes('JSON富内容')
}

export async function richContentOnSession(session: ProductSession, aiStep: ResolvedAiStepRuntime): Promise<void> {
  const data = session.transformed
  if (!data) { recordSessionStepFailure(session, 'rich_content'); return }
  const attr = (session.featureAttrs as Record<string, unknown>[]).find((a) => isJsonRichTextFeatureAttr(a))
  if (!attr?.id) { recordSessionStepFailure(session, 'rich_content'); return }
  const { goodsImgList, otherImgList, allImgList } = getGoodsImgFromTransformed(data, true)
  let selectedUrls: string[] = otherImgList
  if (aiStep.imageRichContentTemplate === 'sku') selectedUrls = goodsImgList
  else if (aiStep.imageRichContentTemplate === 'sku_and_other') selectedUrls = allImgList
  const newWidget = { widgetName: 'raImage', items: selectedUrls.map((url) => ({ img: { src: url, srcMobile: url, alt: '', link: '', position: 'to_the_edge', positionMobile: 'to_the_edge', width: 'full', widthMobile: 'full', scale: 100 } })) }
  data.global_data = (data.global_data as Record<string, unknown>) || {}
  ;(data.global_data as Record<string, unknown>)[FEATURE_SCOPE_STORAGE_KEY] = { ...((data.global_data as Record<string, unknown>)[FEATURE_SCOPE_STORAGE_KEY] as Record<string, unknown> || {}), [String(attr.id)]: 'variant' }
  const skuList = aiStep.imageRichContentSelect === 'sku' ? ((data.sku_matrix as Record<string, unknown>[]) || []) : []
  skuList.forEach((sku, idx) => {
    const variantFeatureValues = (sku[SKU_VARIANT_FEATURE_STORAGE_KEY] as Record<string, unknown>) || {}
    if (String(variantFeatureValues[String(attr.id)] ?? '').trim()) return
    const nextValue = JSON.stringify(dataConverter.convertToCompetitorFormat({ widgets: [newWidget], version: 0.3 }))
    sku[SKU_VARIANT_FEATURE_STORAGE_KEY] = { ...variantFeatureValues, [String(attr.id)]: nextValue }
    const skuMatrix = data.sku_matrix as Record<string, unknown>[]
    if (skuMatrix[idx]) skuMatrix[idx] = sku
  })
}

export async function executePostAiStepsOnSession(session: ProductSession, aiStep: ResolvedAiStepRuntime): Promise<void> {
  if (aiStep.imageTranslateCheck) await translateImagesOnSession(session, aiStep)
  if (aiStep.imageRefineCheck) await refineImagesOnSession(session, aiStep)
  if (aiStep.imageRichContentCheck) await richContentOnSession(session, aiStep)
}
