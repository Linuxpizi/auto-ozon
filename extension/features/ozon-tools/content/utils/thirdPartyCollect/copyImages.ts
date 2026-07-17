// 复制图片：按平台选择器采集商品主图 URL 列表（写剪贴板由调用方负责）。
// 选择器从旧插件 handleCopyImgClick 原样移植，jQuery → 原生 DOM。
import type { SourcePlatformKey } from './types'

const isBase64Image = (src: string | null | undefined): boolean =>
  typeof src === 'string' && src.indexOf('data:image/') === 0

const unique = (urls: string[]): string[] => Array.from(new Set(urls.filter(Boolean)))

const endsWithPng = (src: string): boolean => src.slice(-4) === '.png'

const isHttpImageUrl = (src: string): boolean =>
  /^https?:\/\//i.test(src) || src.startsWith('//')

/** 1688 小图 URL 转大图：去掉 _b.jpg 后缀 */
function convertSmallToLargeImageURL(smallImageURL: string): string {
  return smallImageURL.replace(/_b\.jpg$/, '')
}

/** 从 v-image-cover 的 background-image 提取轮播图 URL（1688 旧版/新版共用） */
function collect1688FromImageCovers(selector: string): string[] {
  const out: string[] = []
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    const style = el.getAttribute('style') || ''
    const match = style.match(/url\("?(.+?)"?\)/)
    if (match && match[1]) {
      const src = convertSmallToLargeImageURL(match[1])
      if (isHttpImageUrl(src) && !endsWithPng(src)) out.push(src)
    }
  })
  return unique(out)
}

/** 1688 detail-gallery-turn 轮播：img.detail-gallery-img（含 video-icon 封面需过滤） */
function collect1688FromDetailGalleryTurn(): string[] {
  const out: string[] = []
  document
    .querySelectorAll<HTMLImageElement>(
      '.detail-gallery-turn img.detail-gallery-img, .img-list-wrapper img.detail-gallery-img',
    )
    .forEach((img) => {
      const raw = (img.getAttribute('src') || '').trim()
      if (!raw || !isHttpImageUrl(raw) || endsWithPng(raw)) return

      const wrapper = img.closest('.detail-gallery-turn-wrapper')
      if (wrapper?.querySelector('img.video-icon') && /tbvideo\.jpg/i.test(raw)) return

      const src = raw.startsWith('//') ? `https:${raw}` : raw
      out.push(src)
    })
  return unique(out)
}

function collect1688(): string[] {
  // 旧版详情页轮播：.od-scroller-list
  const legacy = collect1688FromImageCovers('.od-scroller-list .v-image-cover')
  if (legacy.length > 0) return legacy
  // 新版详情页轮播：.od-picture-gallery-list
  const modern = collect1688FromImageCovers('.od-picture-gallery-list .v-image-cover')
  if (modern.length > 0) return modern
  // detail-gallery-turn 结构（img.detail-gallery-img）
  return collect1688FromDetailGalleryTurn()
}

function collectPdd(): string[] {
  const out: string[] = []
  document.querySelectorAll<HTMLImageElement>('.QFNLpbqP img').forEach((img) => {
    const src = img.getAttribute('src') || img.getAttribute('data-src') || ''
    if (src && !endsWithPng(src)) out.push(src)
  })
  return unique(out)
}

function collectTaobao(): string[] {
  const out: string[] = []
  document.querySelectorAll<HTMLImageElement>("div[class^='thumbnail--'] img").forEach((img) => {
    const src = img.getAttribute('src') || ''
    const match = src.match(/\/\/.*?\.(jpg|webp)/)
    if (match) {
      const full = 'http:' + match[0]
      if (!full.endsWith('.png')) out.push(full)
    }
  })
  return unique(out)
}

function collectAmazon(): string[] {
  // 鼠标悬停触发缩略图懒加载
  const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window })
  document
    .querySelectorAll('.a-unordered-list .a-button-inner .a-button-input')
    .forEach((item) => item.dispatchEvent(mouseOverEvent))
  const out: string[] = []
  document
    .querySelectorAll<HTMLImageElement>('ul.a-unordered-list.a-nostyle.a-horizontal.list.maintain-height li img')
    .forEach((img) => {
      const src = img.getAttribute('src') || ''
      if (src && !endsWithPng(src)) out.push(src)
    })
  return unique(out)
}

function collectAliexpress(): string[] {
  let imgs = document.querySelectorAll<HTMLImageElement>(
    '.SnowProductGallery_SnowProductGallery__container__xeihu img',
  )
  if (!imgs || imgs.length === 0) {
    imgs = document.querySelectorAll<HTMLImageElement>(
      'div[class="gallery_Gallery__gallery__wbtuw6 gallery_Gallery__aspectFill__wbtuw6"] img',
    )
  }
  const out: string[] = []
  imgs.forEach((img) => {
    const src = img.getAttribute('src') || ''
    if (src && !isBase64Image(src)) out.push(src)
  })
  return unique(out)
}

function collectWildberries(): string[] {
  const out: string[] = []
  document
    .querySelectorAll<HTMLImageElement>("div[class*='miniatureWrapper'] img, div[class*='miniatureSlide'] img")
    .forEach((img) => {
      let src = img.getAttribute('src') || ''
      if (src) {
        src = src.replace('c246x328', 'big')
        if (!endsWithPng(src)) out.push(src)
      }
    })
  return unique(out)
}

function collectTemu(): string[] {
  const out: string[] = []
  document.querySelectorAll<HTMLImageElement>('#leftContent ol img').forEach((img) => {
    let src = img.getAttribute('src')
    if (src && src.indexOf('data:image/') === 0) {
      src = img.getAttribute('data-src')
    }
    if (src && src.indexOf('data:image/') === -1) out.push(src)
  })
  return unique(out)
}

function collectPddPifa(): string[] {
  const out: string[] = []
  document.querySelectorAll<HTMLImageElement>('img.goods-img').forEach((img) => {
    const src = img.getAttribute('src') || img.getAttribute('data-src') || ''
    if (src && !endsWithPng(src)) out.push(src)
  })
  return unique(out)
}

const COLLECTORS: Record<SourcePlatformKey, () => string[]> = {
  '1688': collect1688,
  taobao: collectTaobao,
  pdd: collectPdd,
  pddPifa: collectPddPifa,
  amazon: collectAmazon,
  aliexpress: collectAliexpress,
  wildberries: collectWildberries,
  temu: collectTemu,
}

/** 采集指定平台当前详情页的主图 URL 列表（已去重、已剔除占位 png/base64） */
export function collectImagesForPlatform(key: SourcePlatformKey): string[] {
  const fn = COLLECTORS[key]
  return fn ? fn() : []
}

export { convertSmallToLargeImageURL }
