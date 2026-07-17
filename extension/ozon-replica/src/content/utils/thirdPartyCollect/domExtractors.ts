// DOM 简单载荷采集：title + images + video，对齐旧插件 handleOneClickProcurement 的 DOM 路径。
// 用于：亚马逊/速卖通/Wildberries/Temu（无内置 JSON），以及 1688/拼多多/淘宝/拼多多批发 数据桥取数失败时的兜底。
import type { CollectGoodData, SourcePlatform } from './types'
import { collectImagesForPlatform } from './copyImages'
import { getFallbackProductTitleFromDom } from '../profitDrawerPageContext'

/** 取首个匹配元素的纯文本 */
function pickText(selector: string): string {
  const el = document.querySelector(selector)
  return (el?.textContent || '').trim()
}

/** 取首个匹配 video/元素的 src */
function pickVideoSrc(selector: string): string | null {
  const el = document.querySelector(selector)
  const src = el?.getAttribute('src')
  return src || null
}

/** 各平台标题选择器（对齐旧插件，jQuery :first → querySelector 取首个） */
function extractTitle(platform: SourcePlatform): string {
  switch (platform.key) {
    case 'amazon':
      return pickText('#productTitle')
    case 'aliexpress':
      return pickText("div[data-header-mark='true'] h1")
    case 'wildberries':
      return pickText("[class*='productTitle']")
    case 'temu':
      return pickText('h1.HZ_BBbqn')
    case 'pdd':
      return pickText('.Vrv3bF_E span')
    case 'taobao':
      return pickText("span[class*='mainTitle']")
    case 'pddPifa':
      return pickText('.goods-n-title')
    case '1688':
      return getFallbackProductTitleFromDom()
    default:
      return getFallbackProductTitleFromDom()
  }
}

/** 各平台主图视频选择器（对齐旧插件） */
function extractVideo(platform: SourcePlatform): string | null {
  switch (platform.key) {
    case 'amazon':
      return pickVideoSrc('.gridImageBlockViewLayoutIn1x7 video')
    case 'aliexpress':
      return pickVideoSrc('.gallery_Gallery__video__15bdcj video')
    case 'wildberries':
      return pickVideoSrc('.product-page__mix-block video')
    case 'temu':
      return pickVideoSrc('#leftContent video')
    case 'pdd':
      return pickVideoSrc('.pdd-video-container video')
    case 'taobao':
      return pickVideoSrc('.innerWrap--tD6LdQYX video')
    default:
      return null
  }
}

/**
 * 纯 DOM 采集为简单载荷：{ platformType, orderUrl, title, mainImage, images, videos }。
 * 后端 /system/ozonCollect 接受简单载荷（对齐旧插件亚马逊等平台直采）。
 */
export function collectSimplePayloadFromDom(platform: SourcePlatform): CollectGoodData {
  const images = collectImagesForPlatform(platform.key)
  const title = extractTitle(platform)
  const videos = extractVideo(platform)
  return {
    platformType: platform.platformType,
    orderUrl: window.location.href,
    title,
    mainImage: images[0] || '',
    images: images.join(';'),
    videos,
  }
}
