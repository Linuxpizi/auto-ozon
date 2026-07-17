// 旧插件一键采集载荷组装（淘宝 ICE / 拼多多 rawData），移植自 ozon_old/taobao/crawler.js
import type { CollectGoodData } from './types'
import type { TaobaoIceBundle } from './legacyBridge'

function normalizeUrl(u: unknown): string {
  if (u == null || u === '') return ''
  let s = String(u)
  if (s.indexOf('//') === 0) s = 'https:' + s
  return s
}

function uniqueOrdered(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    if (!u || seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

/** 从淘宝 ICE 精简 bundle 组装 ozonCollect 富载荷 */
export function assembleGoodDataFromTaobaoIce(bundle: TaobaoIceBundle | null): CollectGoodData | null {
  try {
    if (!bundle?.skuBase?.skus?.length) return null

    const item = bundle.item || {}
    const skuBase = bundle.skuBase
    const skuCore = bundle.skuCore || {}
    const sku2info = skuCore.sku2info || {}
    const headImageVO = bundle.headImageVO || {}
    const titleVO = bundle.titleVO || {}

    const props = skuBase.props || []
    const propsByPid: Record<string, any> = {}
    for (const pr of props) {
      if (pr?.pid != null) propsByPid[String(pr.pid)] = pr
    }

    function specAndThumbForPropPath(propPath: string): { spec: string; thumb: string } {
      const parts: string[] = []
      let thumb = ''
      if (!propPath) return { spec: '', thumb: '' }
      for (const seg of propPath.split(';')) {
        if (!seg) continue
        const colon = seg.indexOf(':')
        if (colon < 0) continue
        const pid = seg.slice(0, colon)
        const vid = seg.slice(colon + 1)
        const prop = propsByPid[pid]
        if (!prop) continue
        const vm = prop.valueMap?.[vid] || null
        const propName = prop.name ? String(prop.name) : pid
        const valName = vm?.name ? String(vm.name) : vid
        parts.push(`${propName}:${valName}`)
        if (!thumb && vm?.image) thumb = normalizeUrl(vm.image)
      }
      return { spec: parts.join(';'), thumb }
    }

    let carousel: string[] = []
    if (headImageVO.images?.length) {
      carousel = headImageVO.images.map((u: unknown) => normalizeUrl(u)).filter(Boolean)
    } else if (item.images?.length) {
      carousel = item.images.map((u: unknown) => normalizeUrl(u)).filter(Boolean)
    }
    carousel = uniqueOrdered(carousel)

    let title = ''
    if (item.title != null && String(item.title).trim()) title = String(item.title)
    else if (titleVO.title?.title != null) title = String(titleVO.title.title)

    const skus = skuBase.skus
    const skuIds: string[] = []
    const prices: string[] = []
    const skuThumbs: string[] = []
    const specNames: string[] = []

    for (const row of skus) {
      const sid = row.skuId != null ? String(row.skuId) : ''
      skuIds.push(sid)
      const info = sku2info[sid]
      let pt = ''
      if (info?.price) {
        pt = info.price.priceText != null ? String(info.price.priceText) : ''
        if (!pt && info.price.priceMoney != null) {
          const pm = Number(info.price.priceMoney)
          if (!Number.isNaN(pm)) pt = String(pm / 100)
        }
      }
      prices.push(pt)
      const st = specAndThumbForPropPath(row.propPath || '')
      specNames.push(st.spec)
      skuThumbs.push(st.thumb || carousel[0] || '')
    }

    const mainImage = carousel[0] || skuThumbs[0] || normalizeUrl(item.images?.[0]) || ''
    const images = uniqueOrdered(carousel.concat(skuThumbs)).join(';')

    const fileListBt: Array<{ xgImages: Array<{ name: string; url: string }>; imgs: string }> = []
    for (let fi = 0; fi < skus.length; fi++) {
      const specName = specNames[fi] || String(skuIds[fi])
      const thumb = skuThumbs[fi] || ''
      const otherThumbs = skuThumbs.filter((_, oi) => oi !== fi).filter(Boolean)
      const imgsArr = uniqueOrdered([thumb].concat(otherThumbs).concat(carousel))

      const xgImages: Array<{ name: string; url: string }> = []
      const xgSeen = new Set<string>()
      const pushXg = (label: string, u: string) => {
        if (!u || xgSeen.has(u)) return
        xgSeen.add(u)
        xgImages.push({ name: label, url: u })
      }
      if (thumb) pushXg(specName, thumb)
      else if (carousel[0]) pushXg(specName, carousel[0])
      let carouselN = 0
      for (const vu of carousel) {
        if (!vu || xgSeen.has(vu)) continue
        carouselN++
        pushXg(`${specName} · 轮播${carouselN}`, vu)
      }
      fileListBt.push({ xgImages, imgs: JSON.stringify(imgsArr) })
    }

    const variantRows = skus.map(() => ({}))
    let video: string | null = null
    if (headImageVO.videos?.length) {
      const v0 = headImageVO.videos[0]
      video = v0?.url || v0?.videoUrl ? normalizeUrl(v0.url || v0.videoUrl) : null
    }

    return {
      platformType: 3,
      orderUrl: window.location.href,
      title,
      description: '',
      mainImage,
      images,
      goodsSkuList: JSON.stringify(skuIds),
      priceList: JSON.stringify(prices),
      fileListBt: JSON.stringify(fileListBt),
      variantCollection: JSON.stringify(variantRows),
      features: '[]',
      videos: video,
    }
  } catch (e) {
    console.error('[thirdPartyCollect][taobaoLegacy]', e)
    return null
  }
}

/** 从拼多多 rawData 组装 ozonCollect 富载荷 */
export function assembleGoodDataFromPddRaw(raw: any): CollectGoodData | null {
  try {
    const goods = raw?.store?.initDataObj?.goods
    if (!goods) return null

    function normalizePddSkus(g: any): any[] {
      let a = g.skus
      if (Array.isArray(a) && a.length) return a
      a = g.sku
      if (Array.isArray(a) && a.length) return a
      a = g.skuList
      if (Array.isArray(a) && a.length) return a
      if (g.skuMap && typeof g.skuMap === 'object') {
        const keys = Object.keys(g.skuMap)
        if (keys.length) return keys.map((k) => g.skuMap[k]).filter(Boolean)
      }
      const gid = g.goodsId != null ? g.goodsId : g.goodsID
      if (gid != null && (g.thumbUrl || g.hdThumbUrl || g.viewImageData?.length)) {
        return [
          {
            skuId: gid,
            thumbUrl: g.thumbUrl || g.hdThumbUrl || '',
            groupPrice: g.minGroupPrice,
            normalPrice: g.minNormalPrice != null ? g.minNormalPrice : g.maxNormalPrice,
            specs: [],
          },
        ]
      }
      return []
    }

    const skus = normalizePddSkus(goods)
    if (!skus.length) return null

    function variantDimFromSku(sku: any): Record<string, string> {
      const o: Record<string, string> = {}
      if (sku.specs?.length) {
        for (const sp of sku.specs) {
          const key = sp.spec_key != null ? sp.spec_key : sp.specKey
          if (!key) continue
          let val = (sp.spec_value != null ? sp.spec_value : sp.specValue) || ''
          if (sp.spec_note) val += String(sp.spec_note)
          o[String(key)] = String(val)
        }
      }
      return o
    }

    const viewUrls: string[] = []
    if (goods.viewImageData?.length) {
      for (const u of goods.viewImageData) viewUrls.push(String(u))
    } else if (goods.topGallery?.length) {
      for (const item of goods.topGallery) {
        if (item?.url) viewUrls.push(String(item.url))
      }
    }

    const skuThumbs = uniqueOrdered(
      skus.map((s: any) => s.thumbUrl).filter(Boolean).map(String),
    )
    const mainImage =
      viewUrls[0] ||
      skuThumbs[0] ||
      (goods.thumbUrl ? String(goods.thumbUrl) : '') ||
      (goods.hdThumbUrl ? String(goods.hdThumbUrl) : '')
    const images = uniqueOrdered(viewUrls.concat(skuThumbs)).join(';')

    const skuIds: string[] = []
    const prices: string[] = []
    for (const s of skus) {
      const id = s.skuId != null ? s.skuId : s.skuID
      skuIds.push(String(id != null ? id : ''))
      const pr =
        s.groupPrice != null && s.groupPrice !== ''
          ? String(s.groupPrice)
          : s.normalPrice != null
            ? String(s.normalPrice)
            : ''
      prices.push(pr)
    }

    const fileListBt: Array<{ xgImages: Array<{ name: string; url: string }>; imgs: string }> = []
    for (let fi = 0; fi < skus.length; fi++) {
      const sku = skus[fi]
      const thumb = sku.thumbUrl ? String(sku.thumbUrl) : ''
      const specParts: string[] = []
      if (sku.specs?.length) {
        for (const spec of sku.specs) {
          const note = spec.spec_note ? String(spec.spec_note) : ''
          specParts.push(`${spec.spec_key || ''}:${spec.spec_value || ''}${note}`)
        }
      }
      const specName = specParts.join(';') || String(sku.skuId != null ? sku.skuId : sku.skuID || '')
      const otherThumbs = skus
        .filter((_: any, oi: number) => oi !== fi)
        .map((x: any) => x.thumbUrl)
        .filter(Boolean)
        .map(String)
      const imgsArr = uniqueOrdered([thumb].concat(otherThumbs).concat(viewUrls))

      const xgImages: Array<{ name: string; url: string }> = []
      const xgSeen = new Set<string>()
      const pushXg = (label: string, u: string) => {
        if (!u || xgSeen.has(u)) return
        xgSeen.add(u)
        xgImages.push({ name: label, url: u })
      }
      if (thumb) pushXg(specName, thumb)
      else if (viewUrls[0]) pushXg(specName, String(viewUrls[0]))
      let carouselN = 0
      for (const vu of viewUrls) {
        const s = String(vu)
        if (!s || xgSeen.has(s)) continue
        carouselN++
        pushXg(`${specName} · 轮播${carouselN}`, s)
      }
      fileListBt.push({ xgImages, imgs: JSON.stringify(imgsArr) })
    }

    const variantRows = skus.map((s: any) => [variantDimFromSku(s)])
    let video: string | null = null
    if (goods.videoGallery?.length) {
      const v0 = goods.videoGallery[0]
      video = v0?.url || v0?.videoUrl ? String(v0.url || v0.videoUrl) : null
    }

    return {
      platformType: 2,
      orderUrl: window.location.href,
      title: goods.goodsName != null ? String(goods.goodsName) : '',
      description: goods.shareDesc != null ? String(goods.shareDesc) : '',
      mainImage,
      images,
      goodsSkuList: JSON.stringify(skuIds),
      priceList: JSON.stringify(prices),
      fileListBt: JSON.stringify(fileListBt),
      variantCollection: JSON.stringify(variantRows),
      features: '[]',
      videos: video,
    }
  } catch (e) {
    console.error('[thirdPartyCollect][pddLegacy]', e)
    return null
  }
}
