import type { ProductAttribute, ScrapedProduct } from '@/utils/types'

// ─── 通用工具 ───────────────────────────────────────────────

function getText(selector: string, parent: Element | Document = document): string {
  const el = parent.querySelector(selector)
  return el?.textContent?.trim() || ''
}

function parsePrice(text: string): number {
  const match = text.replace(/\s/g, '').match(/(\d[\d,.]*)/)
  return match ? parseFloat(match[1].replace(',', '.')) : 0
}

// ─── 页面类型检测 ────────────────────────────────────────────

function detectPageType(): 'product' | 'list' | 'unknown' {
  const path = location.pathname
  // 列表页优先检测 — 分类/品牌/搜索/卖家/集合页 URL 末尾可能也带数字
  // 例如 /category/krupnaya-bytovaya-tehnika-10501/ 末尾有 10501
  if (/\/(category|brand|search|seller|collection|c)\//i.test(path)) {
    return 'list'
  }
  // 商品详情页:路径片段数>=2 且最后一段是纯数字(如 /product/xxx-123456/)
  // 但要排除 category/brand 等列表页前缀
  if (/\/\d+\/?$/.test(path) &&
      path.split('/').filter(Boolean).length >= 2) {
    return 'product'
  }
  return 'unknown'
}

// ═══════════════════════════════════════════════════════════════
//  商品详情页 采集
// ═══════════════════════════════════════════════════════════════

function extractDetailSourceId(): string {
  const match = location.pathname.match(/\/(\d+)\/?$/)
  return match?.[1] || ''
}

function extractDetailImages(): string[] {
  const imgs = Array.from(document.querySelectorAll('[data-widget="webGallery"] img'))
    .map((img) => (img as HTMLImageElement).src)
    .filter((src) => src && !src.includes('icon') && !src.includes('logo'))
  const hd = imgs.map((s) => s.replace(/\/wc\d+\//, '/wc500/'))
  return [...new Set(hd.length ? hd : imgs)].slice(0, 10)
}

function extractDetailPrice(): number {
  const mainPrice = document.querySelector('[data-widget="webPrice"] .tsHeadline600Large')
  if (mainPrice) return parsePrice(mainPrice.textContent || '')
  const el = document.querySelector('[data-widget="webPrice"] span[class*="Headline"]')
  return parsePrice(el?.textContent || '')
}

function extractDetailOldPrice(): number {
  const oldEl = document.querySelector('[data-widget="webPrice"] span.pdp_bj')
  if (oldEl) return parsePrice(oldEl.textContent || '')
  const spans = document.querySelectorAll('[data-widget="webPrice"] span')
  for (const span of Array.from(spans)) {
    if (window.getComputedStyle(span).textDecorationLine.includes('line-through')) {
      return parsePrice(span.textContent || '')
    }
  }
  return 0
}

function extractDetailRating(): number {
  const el = document.querySelector('[data-widget="webReviewProductScore"]')
  if (el) {
    const match = el.textContent.match(/([\d.]+)/)
    return match ? parseFloat(match[1]) : 0
  }
  const star = document.querySelector('[class*="rating"], [class*="star"]')
  const match = star?.textContent?.match(/([\d.]+)/)
  return match ? parseFloat(match[1]) : 0
}

function extractDetailReviewCount(): number {
  const el = document.querySelector('[data-widget="webReviewProductScore"]')
  if (el) {
    const match = el.textContent.replace(/\s/g, '').match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }
  return 0
}

function extractDetailBrand(): string {
  const brandEl = document.querySelector('[data-widget="webBrandName"] a, [data-widget="webBrandName"] span')
  if (brandEl) return brandEl.textContent?.trim() || ''
  const links = Array.from(document.querySelectorAll('a[href*="/brand/"]'))
  return links[0]?.textContent?.trim() || ''
}

function extractDetailCategory(): string {
  const breadcrumbs = Array.from(document.querySelectorAll('[data-widget="webBreadcrumb"] a'))
  const cats = breadcrumbs.map((a) => a.textContent?.trim() || '').filter(Boolean)
  return cats.length > 1 ? cats.slice(1).join(' > ') : cats.join(' > ')
}

function extractDetailSellerName(): string {
  const merchantEl = document.querySelector('[data-widget="webMerchantInfo"] a, [data-widget="webMerchantInfo"] span')
  if (merchantEl) return merchantEl.textContent?.trim() || ''
  const bestEl = document.querySelector('[data-widget="webBestSeller"] button span')
  if (bestEl) {
    const text = bestEl.textContent?.trim() || ''
    return text.replace(/\d+\s*₽.*$/, '').trim() || text
  }
  return ''
}

function extractDetailAttributes(): ProductAttribute[] {
  const attrs: ProductAttribute[] = []

  // 策略 1: 先尝试点击「展开全部」按钮,让折叠的属性显示出来
  const expandBtns = document.querySelectorAll(
    'button[class*="show-more"], button[class*="expand"], [data-widget="webCharacteristics"] button, [class*="characteristic"] button'
  )
  expandBtns.forEach((btn) => {
    const text = btn.textContent?.trim() || ''
    if (/показать все|展开|show more|все характеристики/i.test(text)) {
      try { (btn as HTMLElement).click() } catch { /* ignore */ }
    }
  })

  // 策略 2: 多种选择器尝试匹配属性区域
  const selectors = [
    '[data-widget="webCharacteristics"]',
    '[class*="characteristic"]',
    '[class*="specification"]',
    '[class*="product-detail"] [class*="param"]',
    '[class*="pdp-page"] [class*="attr"]',
  ]
  for (const sel of selectors) {
    const container = document.querySelector(sel)
    if (!container) continue
    // 尝试多种行结构
    const rows = container.querySelectorAll('div > div, dl > div, tr, li')
    rows.forEach((row) => {
      const children = Array.from(row.children)
      if (children.length >= 2) {
        const name = children[0]?.textContent?.trim() || ''
        const value = children[1]?.textContent?.trim() || ''
        if (name && value && name.length < 100 && value.length < 200 && name !== value) {
          attrs.push({ name, value })
        }
      }
    })
    if (attrs.length > 0) break
  }

  // 策略 3: 通用名值对检测 — 查找所有 dt/dd 或 name:value 格式的元素
  if (attrs.length === 0) {
    document.querySelectorAll('dt, [class*="param-name"], [class*="attr-name"]').forEach((el) => {
      const name = el.textContent?.trim() || ''
      const valueEl = el.nextElementSibling
      const value = valueEl?.textContent?.trim() || ''
      if (name && value && name.length < 100 && value.length < 200) {
        attrs.push({ name, value })
      }
    })
  }

  return attrs
}

/** 提取 SKU / article 编号 — Ozon 商品页有专门的 SKU 展示区域 */
function extractDetailSku(): string {
  // Ozon 通常在「Артикул」或「SKU」标签附近显示编号
  const allText = document.body.innerText || ''
  const skuMatch = allText.match(/(?:Артикул|SKU|Артикул\s+поставщика)[:\s]*([\w\-\.]+)/i)
  if (skuMatch) return skuMatch[1].trim()
  // 尝试从 meta 标签提取
  const metaSku = document.querySelector('meta[itemprop="sku"]')
  if (metaSku) return metaSku.getAttribute('content') || ''
  // 尝试从 JSON-LD 提取
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const s of Array.from(scripts)) {
    try {
      const json = JSON.parse(s.textContent || '{}')
      if (json.sku) return String(json.sku)
      if (json.productID) return String(json.productID)
    } catch { /* ignore */ }
  }
  return ''
}

/** 提取商品页变体/SKU 信息 */
function extractDetailVariants(): string {
  const variants: string[] = []
  // 颜色/内存/尺寸变体按钮
  const variantEls = document.querySelectorAll(
    '[data-widget="webOfferSelector"] button, [class*="variant"] button, [class*="offer"] [class*="option"] button'
  )
  variantEls.forEach((el) => {
    const text = el.textContent?.trim() || ''
    if (text && text.length < 50) variants.push(text)
  })
  return variants.join(', ')
}

function extractDetailDescription(): string {
  const el = document.querySelector('[data-widget="webDescription"]')
  return el?.textContent?.trim()?.slice(0, 2000) || ''
}

function scrapeOzonProduct(): ScrapedProduct | null {
  const sourceId = extractDetailSourceId()
  if (!sourceId) return null

  // 先展开全部属性,等待 500ms 让 DOM 更新
  const expandAllBtns = document.querySelectorAll(
    'button[class*="show-more"], button[class*="expand"]'
  )
  expandAllBtns.forEach((btn) => {
    try { (btn as HTMLElement).click() } catch { /* ignore */ }
  })

  const attributes = extractDetailAttributes()

  // 把 SKU 和变体信息也追加到 attributes 中
  const sku = extractDetailSku()
  if (sku) attributes.unshift({ name: 'Артикул (SKU)', value: sku })
  const variants = extractDetailVariants()
  if (variants) attributes.push({ name: '变体选项', value: variants })

  // 从 JSON-LD 补充额外结构化数据
  let jsonLd: any = null
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const data = JSON.parse(s.textContent || '{}')
      if (data['@type'] === 'Product' || data.productID) jsonLd = data
    } catch { /* ignore */ }
  })
  if (jsonLd) {
    if (jsonLd.sku && !sku) attributes.unshift({ name: 'SKU', value: String(jsonLd.sku) })
    if (jsonLd.brand?.name) { /* brand 已单独提取 */ }
    if (jsonLd.weight) attributes.push({ name: '重量', value: String(jsonLd.weight) })
    if (jsonLd.color) attributes.push({ name: '颜色', value: String(jsonLd.color) })
  }

  return {
    platform: 'ozon',
    sourceId,
    title: getText('h1') || getText('[data-widget="webProductHeading"] span'),
    price: extractDetailPrice(),
    oldPrice: extractDetailOldPrice(),
    images: extractDetailImages(),
    rating: extractDetailRating(),
    reviewCount: extractDetailReviewCount(),
    brand: extractDetailBrand() || (jsonLd?.brand?.name ?? ''),
    category: extractDetailCategory(),
    sellerName: extractDetailSellerName(),
    sellerUrl: '',
    attributes,
    description: extractDetailDescription(),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
  }
}

// ═══════════════════════════════════════════════════════════════
//  列表页 采集 (分类/品牌/搜索结果页 → 滚动采集)
// ═══════════════════════════════════════════════════════════════

interface ListCard {
  sourceId: string
  title: string
  price: number
  oldPrice: number
  imageUrl: string
  rating: number
  reviewCount: number
  sourceUrl: string
}

/** 从一个商品卡片 DOM 元素提取摘要 */
function parseCard(el: HTMLElement): ListCard | null {
  // Ozon href 格式: /product/...-1425179442/?at=xxx 或 /product/...-1425179442/
  // ID 在 slug 末尾,紧跟查询参数(可能有 ?at=...)
  const links = Array.from(el.querySelectorAll('a[href*="/product/"]')) as HTMLAnchorElement[]
  if (links.length === 0) return null

  let href = ''
  let sourceId = ''
  for (const l of links) {
    const rawHref = l.getAttribute('href') || ''
    const cleanHref = rawHref.split('?')[0]
    // ID 是末尾连续数字(≥6位),例如 ...-1425179442/
    const idMatch = cleanHref.match(/([\d]{6,})\/?$/)
    if (idMatch) {
      href = rawHref
      sourceId = idMatch[1]
      break
    }
  }
  if (!sourceId) return null

  // 标题 — Ozon 实际用 tsBody500Medium 类名
  const titleEl =
    el.querySelector('span.tsBody500Medium') ||
    el.querySelector('span[class*="tsBody500"]') ||
    el.querySelector('span[class*="tsBody"]') ||
    el.querySelector('a[href*="/product/"] span') ||
    el.querySelector('[class*="title"]')
  const title = titleEl?.textContent?.trim() || ''

  // 价格 — Ozon 用 tsHeadline500Medium 做当前价,带 line-through 的是原价
  const priceEls = el.querySelectorAll('span')
  let price = 0
  let oldPrice = 0
  for (const sp of Array.from(priceEls)) {
    const text = sp.textContent || ''
    if (!text.includes('\u20BD') && !/\d/.test(text)) continue
    const val = parsePrice(text)
    if (val === 0) continue
    const isStrike = window.getComputedStyle(sp).textDecorationLine.includes('line-through')
    if (isStrike) {
      oldPrice = val
    } else if (val > price) {
      price = val
    }
  }

  // 图片
  const img = el.querySelector('img') as HTMLImageElement | null
  const imageUrl = img?.src?.replace(/\/wc\d+\//, '/wc500/') || ''

  // 评分
  let rating = 0
  const ratingEl = el.querySelector('[class*="rating"], [class*="star"]')
  if (ratingEl) {
    const m = ratingEl.textContent?.match(/([\d.]+)/)
    if (m) rating = parseFloat(m[1])
  }

  // 评论数
  let reviewCount = 0
  const reviewEl = el.querySelector('[class*="review"], [class*="comment"]')
  if (reviewEl) {
    const m = reviewEl.textContent?.match(/(\d+)/)
    if (m) reviewCount = parseInt(m[1])
  }

  const fullUrl = new URL(href, location.origin).href

  return { sourceId, title, price, oldPrice, imageUrl, rating, reviewCount, sourceUrl: fullUrl }
}

/** 扫描页面上所有可见的商品卡片 */
function scanListCards(): ListCard[] {
  const seen = new Set<string>()
  const cards: ListCard[] = []

  // Ozon 列表页商品卡片的常见容器
  const selectors = [
    '[class*="tile-root"]',                           // Ozon 实际卡片类(从DOM验证)
    '[data-widget="tileGridDesktop"] > div',          // 标准网格
    '[data-widget="searchResults"] > div',            // 搜索结果
    '[class*="widget-search-result"] > div',          // 搜索结果备选
    '[data-widget*="tile"] > div',                    // 任意 tile widget
    '[class*="tile-hover"]',                          // tile-hover 卡片类
    'a[href*="/product/"]',                           // 所有商品链接的父级
  ]

  for (const sel of selectors) {
    const els = document.querySelectorAll(sel)
    if (els.length === 0) continue

    console.log(`[Auto-Ozon] scanListCards: selector "${sel}" matched ${els.length} elements`)

    els.forEach((el) => {
      // 如果元素本身不是卡片容器,向上找一层
      const cardEl = (el.querySelector('a[href*="/product/"]') ? el : el.parentElement) as HTMLElement | null
      if (!cardEl) return
      const card = parseCard(cardEl)
      if (card && !seen.has(card.sourceId)) {
        seen.add(card.sourceId)
        cards.push(card)
      }
    })
    if (cards.length > 0) break
  }

  // 最终兜底:扫描页面上所有包含 product 链接的最近卡片容器
  if (cards.length === 0) {
    console.log('[Auto-Ozon] scanListCards: primary selectors failed, trying fallback')
    const allLinks = document.querySelectorAll('a[href*="/product/"]')
    console.log(`[Auto-Ozon] scanListCards: found ${allLinks.length} product links on page`)
    allLinks.forEach((a) => {
      // 向上遍历找到最近的合理卡片容器(有子图片或子链接的 div)
      let container: HTMLElement | null = a.parentElement
      for (let i = 0; i < 5 && container; i++) {
        if (container.querySelector('img') || container.querySelectorAll('a[href*="/product/"]').length <= 3) break
        container = container.parentElement
      }
      if (!container) return
      const card = parseCard(container)
      if (card && !seen.has(card.sourceId)) {
        seen.add(card.sourceId)
        cards.push(card)
      }
    })
  }

  console.log(`[Auto-Ozon] scanListCards: found ${cards.length} cards total`)
  return cards
}

/**
 * 查找并点击"下一页"按钮
 * Ozon 分页有多种形态:
 *   1. [data-widget="paginator"] 内的 <a> / <button>
 *   2. 带有 rel="next" 的链接
 *   3. 文本为 "Далее" 或 ">" 的按钮
 *   4. URL 含 page=N 的链接中当前页+1 的那个
 */
function findAndClickNextPage(): boolean {
  // 策略 1: data-widget="paginator" 内的下一页链接
  const paginator = document.querySelector('[data-widget="paginator"]')
  if (paginator) {
    // 查找 rel="next" 或文本含 "Далее" / ">" 的按钮
    const nextBtn =
      (paginator.querySelector('a[rel="next"]') as HTMLElement) ||
      Array.from(paginator.querySelectorAll('a, button')).find((el) => {
        const text = el.textContent?.trim() || ''
        return text === 'Далее' || text === '>' || text === '»'
      }) as HTMLElement
    if (nextBtn) {
      console.log('[Auto-Ozon] Found next page button via paginator:', nextBtn.textContent?.trim())
      nextBtn.click()
      return true
    }
  }

  // 策略 2: 全局查找 rel="next"
  const relNext = document.querySelector('a[rel="next"]') as HTMLElement | null
  if (relNext) {
    console.log('[Auto-Ozon] Found next page via rel="next"')
    relNext.click()
    return true
  }

  // 策略 3: 查找所有分页链接,找到当前页码的下一个
  const currentUrl = new URL(location.href)
  const currentPageMatch = currentUrl.search.match(/[?&]page=(\d+)/)
  const currentPage = currentPageMatch ? parseInt(currentPageMatch[1]) : 1
  const nextPage = currentPage + 1

  // 查找 href 中包含 page=nextPage 的链接
  const allLinks = document.querySelectorAll('a[href*="page="]') as NodeListOf<HTMLAnchorElement>
  for (const link of allLinks) {
    const href = link.getAttribute('href') || ''
    if (new RegExp(`[?&]page=${nextPage}(?:&|$)`).test(href)) {
      console.log(`[Auto-Ozon] Found next page link: page=${nextPage}`)
      link.click()
      return true
    }
  }

  // 策略 4: 查找 Ozon 常见的分页组件中 "下一个" 的按钮
  const allButtons = document.querySelectorAll('button, a')
  for (const btn of allButtons) {
    const text = btn.textContent?.trim() || ''
    const ariaLabel = btn.getAttribute('aria-label') || ''
    if (
      text === 'Далее' || text === '>' || text === '»' ||
      ariaLabel.toLowerCase().includes('next') ||
      ariaLabel.toLowerCase().includes('далее')
    ) {
      // 确认它是分页按钮(附近有数字按钮)
      const parent = btn.closest('[class*="paginator"], [class*="pagination"], nav')
      if (parent) {
        console.log(`[Auto-Ozon] Found next page button: "${text || ariaLabel}"`)
        btn.click()
        return true
      }
    }
  }

  console.log('[Auto-Ozon] No next page button found')
  return false
}

/** 等待页面内容更新(检测商品卡片变化) */
function waitForPageUpdate(oldFirstId: string, timeout = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const cards = scanListCards()
      if (cards.length > 0 && cards[0]?.sourceId !== oldFirstId) {
        resolve(true)
        return
      }
      if (Date.now() - start > timeout) {
        resolve(false)
        return
      }
      setTimeout(check, 500)
    }
    setTimeout(check, 1000)
  })
}

/** 滚动并采集:反复滚动到底部,等待新内容加载,直到无新商品或达到上限 */
async function scrollAndCollect(
  maxItems: number,
  scrollDelay: number,
  onProgress: (count: number) => void,
  shouldStop?: () => boolean,
): Promise<ListCard[]> {
  // Ozon 用虚拟滚动:卡片滚出视口就从 DOM 移除
  // 所以必须用持久 Map 跨 tick 记录已采集的卡片
  const allCards = new Map<string, ListCard>()
  let maxPages = 10 // 安全上限,防止无限翻页

  while (allCards.size < maxItems && maxPages > 0) {
    // 检查停止信号
    if (shouldStop && shouldStop()) {
      console.log('[Auto-Ozon] scrollAndCollect: stopped by user')
      break
    }

    // ── 当前页:滚动并采集 ──
    let stableRounds = 0
    const MAX_STABLE = 3

    const tick = (): Promise<void> => {
      return new Promise((resolveTick) => {
        // 检查停止信号
        if (shouldStop && shouldStop()) {
          resolveTick()
          return
        }
        const freshCards = scanListCards()
        for (const c of freshCards) {
          allCards.set(c.sourceId, c)
        }
        const totalCount = allCards.size
        onProgress(totalCount)

        if (totalCount >= maxItems) {
          resolveTick()
          return
        }

        if (freshCards.length === 0) {
          stableRounds++
          if (stableRounds >= MAX_STABLE) {
            resolveTick()
            return
        }
        } else {
          stableRounds = 0
        }

        window.scrollBy(0, window.innerHeight)
        setTimeout(() => tick().then(resolveTick), scrollDelay)
      })
    }

    await tick()

    if (allCards.size >= maxItems) break

    // ── 当前页已滚动完毕,尝试翻到下一页 ──
    // 先滚动到页面底部,确保分页按钮可见
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((r) => setTimeout(r, 800))

    // 记录当前第一个卡片的 ID,用于判断页面是否已更新
    const currentCards = scanListCards()
    const oldFirstId = currentCards.length > 0 ? currentCards[0].sourceId : ''

    const clicked = findAndClickNextPage()
    if (!clicked) {
      console.log(`[Auto-Ozon] No more pages. Collected ${allCards.size} products total.`)
      break
    }

    console.log(`[Auto-Ozon] Clicked next page, waiting for content update...`)
    maxPages--

    // 等待页面内容更新
    const updated = await waitForPageUpdate(oldFirstId)
    if (!updated) {
      console.log(`[Auto-Ozon] Page did not update after clicking next. Stopping.`)
      break
    }

    // 新页面加载后先滚回顶部,让虚拟滚动渲染新卡片
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 1000))
  }

  return Array.from(allCards.values()).slice(0, maxItems)
}

// ═══════════════════════════════════════════════════════════════
//  后台补全:通过 Ozon 内部 JSON API 获取商品详情
//  不打开页面、不导航,纯粹后台 fetch 请求
// ═══════════════════════════════════════════════════════════════

const OZON_INTERNAL_API = 'https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2'

/**
 * 通过 Ozon 内部 JSON API 获取单个商品的完整详情
 * sourceId 如 "1425179442"
 * 返回的 JSON 结构中有 "widgetStates" 包含所有 widget 数据
 */
async function fetchProductDetailFromApi(sourceId: string): Promise<Partial<ScrapedProduct> | null> {
  try {
    const url = `${OZON_INTERNAL_API}?url=/product/-${sourceId}/`
    const resp = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      credentials: 'include', // 携带用户 cookies
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return parseInternalApiResponse(data, sourceId)
  } catch (e) {
    console.warn(`[Auto-Ozon] 补全 ${sourceId} 失败:`, e)
    return null
  }
}

/**
 * 解析 Ozon 内部 API 的 JSON 响应,提取结构化商品数据
 */
function parseInternalApiResponse(data: any, sourceId: string): Partial<ScrapedProduct> | null {
  const result: Partial<ScrapedProduct> = {
    platform: 'ozon',
    sourceId,
    attributes: [],
    images: [],
  }

  // 内部 API 返回的 widgetStates 是一个对象,key 是 widget ID
  const states = data?.widgetStates || data || {}

  for (const [key, val] of Object.entries(states)) {
    if (typeof val !== 'string') continue
    try {
      const widget = JSON.parse(val as string)

      // 提取商品标题
      if (key.includes('webProductHeading') || key.includes('pdptitle')) {
        result.title = widget.title || widget.text || result.title
      }

      // 提取图片
      if (key.includes('webGallery') || key.includes('gallery')) {
        const images = widget.images || widget.items || []
        result.images = images.map((img: any) => {
          const url = img.big || img.medium || img.small || img.url || ''
          return url.startsWith('//') ? 'https:' + url : url
        }).filter(Boolean)
      }

      // 提取价格
      if (key.includes('webPrice') || key.includes('price')) {
        const priceStr = widget.price || widget.actionPrice || ''
        const oldPriceStr = widget.oldPrice || widget.basePrice || ''
        result.price = parseFloat(String(priceStr).replace(/\s/g, '').replace(',', '.')) || result.price
        result.oldPrice = parseFloat(String(oldPriceStr).replace(/\s/g, '').replace(',', '.')) || result.oldPrice
      }

      // 提取评分和评论数
      if (key.includes('webReviewProductScore') || key.includes('review')) {
        const ratingStr = widget.rating || widget.score || ''
        result.rating = parseFloat(String(ratingStr)) || result.rating
        const countStr = widget.reviewCount || widget.count || ''
        result.reviewCount = parseInt(String(countStr).replace(/\s/g, '')) || result.reviewCount
      }

      // 提取品牌
      if (key.includes('webBrandName') || key.includes('brand')) {
        result.brand = widget.brand?.name || widget.text || widget.name || result.brand
      }

      // 提取属性/特征
      if (key.includes('webCharacteristics') || key.includes('characteristic')) {
        const chars = widget.options || widget.characteristics || widget.items || []
        for (const c of chars) {
          const name = c.title || c.name || c.label || ''
          const value = c.value || c.text || ''
          if (name && value) {
            result.attributes!.push({ name, value })
          }
        }
      }

      // 提取描述
      if (key.includes('webDescription') || key.includes('description')) {
        result.description = widget.text || widget.content || widget.description || result.description
      }

      // 提取卖家信息
      if (key.includes('webMerchantInfo') || key.includes('webBestSeller') || key.includes('merchant')) {
        result.sellerName = widget.merchantName || widget.text || widget.name || result.sellerName
      }

      // 提取分类面包屑
      if (key.includes('webBreadcrumb') || key.includes('breadcrumb')) {
        const crumbs = widget.items || widget.links || []
        const cats = crumbs.map((c: any) => c.title || c.text || c.label || '').filter(Boolean)
        if (cats.length > 1) {
          result.category = cats.slice(1).join(' > ')
        }
      }
    } catch {
      // 不是 JSON 字符串,跳过
    }
  }

  return result.images!.length > 0 || result.title || result.attributes!.length > 0 ? result : null
}

/**
 * 批量补全商品详情
 * 从后端获取需要补全的商品列表,逐个调用内部 API 获取详情
 * 每个请求间隔 2~5 秒随机延时,避免触发风控
 */
async function enrichProductsFromApi(
  products: Array<{ id: number; sourceId: string; sourceUrl: string }>,
  onProgress: (done: number, total: number, current: string) => void,
): Promise<Array<{ id: number; data: Partial<ScrapedProduct> }>> {
  const results: Array<{ id: number; data: Partial<ScrapedProduct> }> = []
  const DELAY_MIN = 2000  // 最短延时 2 秒
  const DELAY_MAX = 5000  // 最长延时 5 秒

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    onProgress(i + 1, products.length, p.sourceId)

    const detail = await fetchProductDetailFromApi(p.sourceId)
    if (detail) {
      results.push({ id: p.id, data: detail })
    }

    // 随机延时 2~5 秒
    if (i < products.length - 1) {
      const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return results
}

// ═══════════════════════════════════════════════════════════════
//  Content Script 入口
// ═══════════════════════════════════════════════════════════════

export default defineContentScript({
  matches: ['*://*.ozon.ru/*'],
  main() {
    console.log('[Auto-Ozon] Ozon content script loaded, path:', location.pathname)

    // SPA 导航时动态更新 pageType (Ozon 是 SPA,URL 变化不触发 content script 重载)
    let pageType = detectPageType()
    let scrapeStopFlag = false

    // 监听 URL 变化 (popstate + pushState)
    const onNavigate = () => {
      const newType = detectPageType()
      if (newType !== pageType) {
        pageType = newType
        console.log('[Auto-Ozon] Page type changed to:', pageType)
      }
    }
    window.addEventListener('popstate', onNavigate)
    const origPushState = history.pushState.bind(history)
    history.pushState = (...args) => { origPushState(...args); setTimeout(onNavigate, 500) }
    const origReplaceState = history.replaceState.bind(history)
    history.replaceState = (...args) => { origReplaceState(...args); setTimeout(onNavigate, 500) }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      // 后台补全:通过 Ozon 内部 JSON API 获取商品详情 (不需要打开页面)
      if (message.action === 'enrichProducts') {
        const products = message.products || []
        console.log(`[Auto-Ozon] enrichProducts: ${products.length} items to enrich`)
        enrichProductsFromApi(products, (done, total, current) => {
          browser.runtime.sendMessage({ action: 'enrichProgress', done, total, current }).catch(() => {})
        }).then((results) => {
          sendResponse({ success: true, results })
        }).catch((e) => {
          sendResponse({ success: false, error: String(e) })
        })
        return true // 异步 sendResponse
      }

      // 检查页面类型
      if (message.action === 'checkPage') {
        sendResponse({
          pageType,
          platform: 'ozon',
          isProductPage: pageType === 'product',
          isListPage: pageType === 'list',
        })
        return true
      }

      // 采集单个商品详情
      if (message.action === 'scrape') {
        const product = scrapeOzonProduct()
        sendResponse({ success: !!product, data: product })
        return true
      }

      // 列表页滚动采集
      if (message.action === 'scrapeList') {
        const maxItems = message.maxItems || 50
        const scrollDelay = message.scrollDelay || 1500
        const batchSize = message.batchSize || 10
        scrapeStopFlag = false

        console.log(`[Auto-Ozon] scrapeList: pageType=${pageType}, maxItems=${maxItems}, scrollDelay=${scrollDelay}, batchSize=${batchSize}`)

        // 先扫描一次看当前有多少
        const initialCards = scanListCards()
        console.log(`[Auto-Ozon] scrapeList: initial scan found ${initialCards.length} cards`)

        if (initialCards.length === 0 && pageType !== 'list') {
          console.log('[Auto-Ozon] scrapeList: aborting — not a list page and no cards found')
          sendResponse({ success: false, error: '当前页面不是列表页' })
          return true
        }

        // 滚动采集
        scrollAndCollect(maxItems, scrollDelay, (count) => {
          browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: count, enriched: 0, synced: 0, total: count, phase: 'scroll' } })
        }, () => scrapeStopFlag).then(async (cards) => {
          let products: ScrapedProduct[] = cards.map((c) => ({
            platform: 'ozon' as const,
            sourceId: c.sourceId,
            title: c.title,
            price: c.price,
            oldPrice: c.oldPrice,
            images: c.imageUrl ? [c.imageUrl] : [],
            rating: c.rating,
            reviewCount: c.reviewCount,
            brand: '',
            category: '',
            sellerName: '',
            sellerUrl: '',
            attributes: [],
            description: '',
            sourceUrl: c.sourceUrl,
            scrapedAt: new Date().toISOString(),
          }))

          const total = products.length
          let enriched = 0
          let synced = 0

          // 增量批量: 每 batchSize 个商品,补全详情后立即上报后端
          for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
            if (scrapeStopFlag) {
              console.log('[Auto-Ozon] scrapeList: stopped by user')
              break
            }

            const batchEnd = Math.min(batchStart + batchSize, total)
            const batch = products.slice(batchStart, batchEnd)

            // Phase: enrich batch
            browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'enrich' } })

            for (let i = 0; i < batch.length; i++) {
              if (scrapeStopFlag) break
              const p = batch[i]
              const detail = await fetchProductDetailFromApi(p.sourceId)
              if (detail) {
                batch[i] = {
                  ...p,
                  title: detail.title || p.title,
                  brand: detail.brand || p.brand,
                  category: detail.category || p.category,
                  sellerName: detail.sellerName || p.sellerName,
                  description: detail.description || p.description,
                  images: (detail.images && detail.images.length > 0) ? detail.images : p.images,
                  attributes: (detail.attributes && detail.attributes.length > 0) ? detail.attributes : p.attributes,
                  price: detail.price || p.price,
                  oldPrice: detail.oldPrice || p.oldPrice,
                  rating: detail.rating || p.rating,
                  reviewCount: detail.reviewCount || p.reviewCount,
                }
                enriched++
                console.log(`[Auto-Ozon] scrapeList: enriched ${p.sourceId} — brand=${batch[i].brand}`)
              }
              // 随机延时避免风控
              if (i < batch.length - 1) {
                const delay = 1500 + Math.random() * 1500
                await new Promise(r => setTimeout(r, delay))
              }
            }

            // Phase: sync batch to backend
            browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'sync' } })

            try {
              const syncResult = await browser.runtime.sendMessage({ action: 'batchSyncProducts', products: batch })
              if (syncResult?.success) {
                synced += batch.length
                console.log(`[Auto-Ozon] scrapeList: synced batch ${batchStart}-${batchEnd} (${synced}/${total})`)
              }
            } catch (e) {
              console.error('[Auto-Ozon] scrapeList: batch sync failed', e)
            }

            browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'sync' } })
          }

          // Final progress
          browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'done' } })
          sendResponse({ success: true, count: products.length, products })
        })
        return true // 异步响应
      }

      // 停止采集
      if (message.action === 'stopScraping') {
        scrapeStopFlag = true
        sendResponse({ success: true })
        return true
      }
    })
  },
})
