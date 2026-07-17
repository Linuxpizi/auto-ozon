// 一键采集分发：对齐旧插件快路径（1688 立即回传 / 淘宝拼多多 Background 精简取数）；
// 失败时回退 DOM 简单载荷。AI 采集仍走 requestMainWorldWindowData + getWindowData，与此分离。
import type { CollectGoodData, SourcePlatform } from './types'
import { collectSimplePayloadFromDom } from './domExtractors'
import {
  fetchPddRawDataFromPage,
  fetchTaobaoIceResFromPage,
  requestLegacy1688WindowData,
} from './legacyBridge'
import { assembleGoodDataFromPddRaw, assembleGoodDataFromTaobaoIce } from './legacyAssembler'
import { assembleRichPayloadFromBridge, collectRichTextImagesWithRetry } from './richAssembler'

async function collect1688Legacy(platform: SourcePlatform): Promise<CollectGoodData | null> {
  try {
    // 对齐旧插件 handleOneClickProcurement：立即取 window 数据 → 富文本图重试 → 组装提交
    const raw = await requestLegacy1688WindowData()
    const richTextList = await collectRichTextImagesWithRetry()
    const rich = assembleRichPayloadFromBridge(raw, platform.platformType, richTextList)
    if (rich && (rich.title || rich.images)) return rich
  } catch (e) {
    console.warn('[thirdPartyCollect][1688Legacy]', e)
  }
  return collectSimplePayloadFromDom(platform)
}

async function collectTaobaoLegacy(platform: SourcePlatform): Promise<CollectGoodData | null> {
  try {
    const bundle = await fetchTaobaoIceResFromPage()
    const payload = assembleGoodDataFromTaobaoIce(bundle)
    if (payload && (payload.title || payload.images)) return payload
  } catch (e) {
    console.warn('[thirdPartyCollect][taobaoLegacy]', e)
  }
  return collectSimplePayloadFromDom(platform)
}

async function collectPddLegacy(platform: SourcePlatform): Promise<CollectGoodData | null> {
  try {
    const raw = await fetchPddRawDataFromPage()
    const payload = assembleGoodDataFromPddRaw(raw)
    if (payload && (payload.title || payload.images)) return payload
  } catch (e) {
    console.warn('[thirdPartyCollect][pddLegacy]', e)
  }
  return collectSimplePayloadFromDom(platform)
}

/** 采集当前详情页商品数据为后端载荷（保证非详情页校验已在调用方完成） */
export async function collectProductData(platform: SourcePlatform): Promise<CollectGoodData | null> {
  switch (platform.key) {
    case '1688':
      return collect1688Legacy(platform)
    case 'taobao':
      return collectTaobaoLegacy(platform)
    case 'pdd':
      return collectPddLegacy(platform)
    default:
      return collectSimplePayloadFromDom(platform)
  }
}
