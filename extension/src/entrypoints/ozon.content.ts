import type { ProductAttribute, ScrapedProduct } from '@/utils/types'
import { injectFloatingButton } from '@/utils/floating-button'
import {
  randomDelay, normalDelay, microPause, readingPause, occasionalLongPause,
  humanScroll, humanScrollTo, humanScrollToTop, humanScrollToBottom,
  simulateHover, simulateMouseLeave, humanClick, humanLinkClick,
  humanFetch, transitionPause, batchTransitionPause, enrichDelay, scrollPause,
} from '@/utils/humanize'

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

async function extractDetailAttributes(): Promise<ProductAttribute[]> {
  const attrs: ProductAttribute[] = []

  // 策略 1: 先尝试逐个点击「展开全部」按钮,让折叠的属性显示出来
  // ★ 拟人化:逐个点击而非批量点击,每次点击后等待 DOM 更新
  const expandBtns = document.querySelectorAll(
    'button[class*="show-more"], button[class*="expand"], [data-widget="webCharacteristics"] button, [class*="characteristic"] button'
  )
  for (const btn of Array.from(expandBtns)) {
    const text = btn.textContent?.trim() || ''
    if (/показать все|展开|show more|все характеристики/i.test(text)) {
      await humanClick(btn as HTMLElement)
      await normalDelay(300, 800)
    }
  }

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

async function scrapeOzonProduct(): Promise<ScrapedProduct | null> {
  const sourceId = extractDetailSourceId()
  if (!sourceId) return null

  // ★ 拟人化:先模拟浏览页面顶部内容,等待页面完全加载
  await readingPause()

  // 模拟用户慢慢向下滚动查看商品信息
  const scrollTargets = [300, 600, 400]
  for (const dist of scrollTargets) {
    await humanScroll(dist)
    await normalDelay(400, 1000)
  }

  // 展开全部属性
  const expandAllBtns = document.querySelectorAll(
    'button[class*="show-more"], button[class*="expand"]'
  )
  for (const btn of Array.from(expandAllBtns)) {
    await humanClick(btn as HTMLElement)
  }

  await microPause()
  const attributes = await extractDetailAttributes()

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
    currency: 'RUB',
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
  brand: string
  sellerName: string
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

  // ★ 品牌 — Ozon 卡片上通常有品牌标签
  let brand = ''
  const brandLink = el.querySelector('a[href*="/brand/"]')
  if (brandLink) {
    brand = brandLink.textContent?.trim() || ''
  }
  if (!brand) {
    // 品牌有时是 tsBody300Medium 样式的 span
    const brandSpan = el.querySelector('[class*="brand"], [class*="Brand"]')
    if (brandSpan) brand = brandSpan.textContent?.trim() || ''
  }

  // ★ 卖家
  let sellerName = ''
  const sellerEl = el.querySelector('[class*="seller"], [class*="Seller"], [class*="merchant"]')
  if (sellerEl) sellerName = sellerEl.textContent?.trim() || ''

  const fullUrl = new URL(href, location.origin).href

  return { sourceId, title, price, oldPrice, imageUrl, rating, reviewCount, brand, sellerName, sourceUrl: fullUrl }
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

    console.log(`[鲸智 AI] scanListCards: selector "${sel}" matched ${els.length} elements`)

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
    console.log('[鲸智 AI] scanListCards: primary selectors failed, trying fallback')
    const allLinks = document.querySelectorAll('a[href*="/product/"]')
    console.log(`[鲸智 AI] scanListCards: found ${allLinks.length} product links on page`)
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

  console.log(`[鲸智 AI] scanListCards: found ${cards.length} cards total`)
  return cards
}

/**
 * 查找并点击"下一页"按钮
 * Ozon 分页有多种形态:
 *   1. [data-widget="paginator"] 内的 <a> / <button>
 *   2. 带有 rel="next" 的链接
 *   3. 文本为 "Далее" 或 ">" 的按钮
 *   4. URL 含 page=N 的链接中当前页+1 的那个
 *
 * ★ 拟人化:使用 humanLinkClick 替代原生 .click()
 */
async function findAndClickNextPage(): Promise<boolean> {
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
      console.log('[鲸智 AI] Found next page button via paginator:', nextBtn.textContent?.trim())
      // ★ 拟人化:先 hover,再延时点击
      await humanLinkClick(nextBtn)
      return true
    }
  }

  // 策略 2: 全局查找 rel="next"
  const relNext = document.querySelector('a[rel="next"]') as HTMLElement | null
  if (relNext) {
    console.log('[鲸智 AI] Found next page via rel="next"')
    await humanLinkClick(relNext)
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
      console.log(`[鲸智 AI] Found next page link: page=${nextPage}`)
      await humanLinkClick(link)
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
        console.log(`[鲸智 AI] Found next page button: "${text || ariaLabel}"`)
        await humanLinkClick(btn as HTMLElement)
        return true
      }
    }
  }

  console.log('[鲸智 AI] No next page button found')
  return false
}

/** 等待页面内容更新(检测商品卡片变化) */
function waitForPageUpdate(oldFirstId: string, timeout = 9000): Promise<boolean> {
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

  // ★ 拟人化:开始采集前等待一小会儿,模拟用户打开页面后浏览
  await readingPause()

  while (allCards.size < maxItems && maxPages > 0) {
    // 检查停止信号
    if (shouldStop && shouldStop()) {
      console.log('[鲸智 AI] scrollAndCollect: stopped by user')
      break
    }

    // ★ 拟人化:偶尔暂停更久
    await occasionalLongPause()

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

        // ★ 拟人化:用 humanScroll 替代固定距离滚动,滚动距离也有波动
        const scrollAmount = window.innerHeight * (0.85 + Math.random() * 0.3)
        humanScroll(scrollAmount).then(() => {
          // ★ 拟人化:滚动后用可变延时替代固定延时
          scrollPause(scrollDelay).then(() => tick().then(resolveTick))
        })
      })
    }

    await tick()

    if (allCards.size >= maxItems) break

    // ── 当前页已滚动完毕,尝试翻到下一页 ──
    // ★ 拟人化:模拟用户浏览完当前页后慢慢滚到底部
    await humanScrollToBottom()
    await normalDelay(500, 1200)

    // 记录当前第一个卡片的 ID,用于判断页面是否已更新
    const currentCards = scanListCards()
    const oldFirstId = currentCards.length > 0 ? currentCards[0].sourceId : ''

    const clicked = findAndClickNextPage()
    if (!clicked) {
      console.log(`[鲸智 AI] No more pages. Collected ${allCards.size} products total.`)
      break
    }

    console.log(`[鲸智 AI] Clicked next page, waiting for content update...`)
    maxPages--

    // 等待页面内容更新
    const updated = await waitForPageUpdate(oldFirstId)
    if (!updated) {
      console.log(`[鲸智 AI] Page did not update after clicking next. Stopping.`)
      break
    }

    // ★ 拟人化:新页面加载后,先停顿再模拟用户回到顶部
    await readingPause()
    await humanScrollToTop()
    await normalDelay(800, 2000)
  }

  return Array.from(allCards.values()).slice(0, maxItems)
}

// ═══════════════════════════════════════════════════════════════
//  后台补全:通过 Ozon 内部 JSON API 获取商品详情
//  不打开页面、不导航,纯粹后台 fetch 请求
// ═══════════════════════════════════════════════════════════════

const OZON_INTERNAL_API = 'https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2'

/**
 * HTML 降级采集:通过 fetch 商品页面 HTML,解析 DOM 提取数据
 * 当内部 JSON API 返回 403 时使用
 */
async function fetchProductDetailFromHtml(sourceId: string, sourceUrl?: string): Promise<Partial<ScrapedProduct> | null> {
  // 使用真实的产品页面 URL,构造错误的 URL (如 /product/-12345/) 会 404
  const productUrl = sourceUrl || `https://www.ozon.ru/product/${sourceId}/`
  try {
    await randomDelay(300, 800)
    console.log(`[鲸智 AI] HTML 降级: fetching ${productUrl}`)
    const resp = await fetch(productUrl, {
      credentials: 'include',
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    })
    if (!resp.ok) {
      console.warn(`[鲸智 AI] HTML 降级 ${sourceId} 返回 ${resp.status}`)
      return null
    }
    const html = await resp.text()

    const result: Partial<ScrapedProduct> = {
      platform: 'ozon',
      sourceId,
      currency: 'RUB',
      attributes: [],
      images: [],
    }

    // ── 策略 A: 解析 <script type="application/ld+json"> (SEO 结构化数据) ──
    const ldJsonMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
    if (ldJsonMatch) {
      for (const block of ldJsonMatch) {
        const jsonStr = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '')
        try {
          const ld = JSON.parse(jsonStr)
          if (ld['@type'] === 'Product' || ld.name) {
            result.title = result.title || ld.name || ''
            result.description = result.description || ld.description || ''
            if (ld.brand?.name) result.brand = ld.brand.name
            else if (typeof ld.brand === 'string') result.brand = ld.brand
            if (ld.image) {
              const imgs = Array.isArray(ld.image) ? ld.image : [ld.image]
              result.images = imgs.filter((u: string) => u && u.startsWith('http'))
            }
            if (ld.sku) result.sourceId = String(ld.sku)
            if (ld.category) result.category = ld.category
            // 价格
            const offers = ld.offers || ld.Offers
            if (offers) {
              const o = Array.isArray(offers) ? offers[0] : offers
              if (o.price) result.price = parseFloat(o.price) || result.price
              if (o.priceCurrency) result.price = result.price // already in roubles on Ozon
            }
            // 评分
            if (ld.aggregateRating) {
              result.rating = parseFloat(ld.aggregateRating.ratingValue) || result.rating
              result.reviewCount = parseInt(ld.aggregateRating.reviewCount) || result.reviewCount
            }
          }
        } catch { /* not valid JSON, skip */ }
      }
    }

    // ── 策略 B: 解析 HTML DOM (DOMParser) ──
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // brand
    if (!result.brand) {
      const brandEl = doc.querySelector('[data-widget="webBrandName"] a, [data-widget="webBrandName"] span, a[href*="/brand/"]')
      result.brand = brandEl?.textContent?.trim() || ''
    }
    // title
    if (!result.title) {
      const titleEl = doc.querySelector('h1, [data-widget="webProductHeading"] span')
      result.title = titleEl?.textContent?.trim() || ''
    }
    // 分类面包屑
    if (!result.category) {
      const crumbs = doc.querySelectorAll('[data-widget="webBreadcrumb"] a')
      if (crumbs.length > 0) {
        result.category = Array.from(crumbs).map(a => a.textContent?.trim()).filter(Boolean).join(' > ')
      }
    }
    // 描述
    if (!result.description) {
      const descEl = doc.querySelector('[data-widget="webDescription"]')
      result.description = descEl?.textContent?.trim() || ''
    }
    // 属性
    if (!result.attributes!.length) {
      const attrsContainer = doc.querySelector('[data-widget="webCharacteristics"]')
      if (attrsContainer) {
        const rows = attrsContainer.querySelectorAll('tr, [class*="row"], dl > div')
        for (const row of Array.from(rows)) {
          const cells = row.querySelectorAll('td, span, dt, dd')
          if (cells.length >= 2) {
            const name = cells[0]?.textContent?.trim()
            const value = cells[1]?.textContent?.trim()
            if (name && value && name !== value) result.attributes!.push({ name, value })
          }
        }
      }
    }
    // 卖家
    if (!result.sellerName) {
      const sellerEl = doc.querySelector('[data-widget="webMerchantInfo"] a, [data-widget="webBestSeller"] button span')
      result.sellerName = sellerEl?.textContent?.trim() || ''
    }
    // 图片 (从 meta og:image)
    if (!result.images!.length) {
      const ogImg = doc.querySelector('meta[property="og:image"]')
      if (ogImg) {
        const src = ogImg.getAttribute('content') || ''
        if (src) result.images = [src]
      }
    }

    console.log(`[鲸智 AI] HTML 降级 ${sourceId}: brand=${result.brand}, title=${result.title?.substring(0, 50)}, attrs=${result.attributes!.length}`)
    // 至少有标题或品牌才算成功
    return (result.title || result.brand) ? result : null
  } catch (e) {
    console.warn(`[鲸智 AI] HTML 降级 ${sourceId} 失败:`, e)
    return null
  }
}

/**
 * 通过 Ozon 内部 JSON API 获取单个商品的完整详情
 * sourceId 如 "1425179442"
 * 返回的 JSON 结构中有 "widgetStates" 包含所有 widget 数据
 */
async function fetchProductDetailFromApi(sourceId: string, sourceUrl?: string): Promise<Partial<ScrapedProduct> | null> {
  // 内容脚本直接 fetch（同源请求，携带 cookie）
  try {
    await randomDelay(200, 600)
    const apiUrl = `${OZON_INTERNAL_API}?url=/product/${sourceId}/`
    const resp = await fetch(apiUrl, {
      headers: {
        'accept': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      credentials: 'include',
    })
    console.log(`[鲸智 AI] fetchProductDetailFromApi ${sourceId}: status=${resp.status}`)
    if (resp.ok) {
      const data = await resp.json()
      const result = parseInternalApiResponse(data, sourceId)
      if (result) return result
    } else {
      console.warn(`[鲸智 AI] API ${sourceId} returned ${resp.status}`)
    }
  } catch (e) {
    console.warn(`[鲸智 AI] JSON API ${sourceId} 请求失败:`, e)
  }

  // HTML 页面降级 (用真实 URL)
  return await fetchProductDetailFromHtml(sourceId, sourceUrl)
}

/**
 * 解析 Ozon 内部 API 的 JSON 响应,提取结构化商品数据
 */
function parseInternalApiResponse(data: any, sourceId: string): Partial<ScrapedProduct> | null {
  const result: Partial<ScrapedProduct> = {
    platform: 'ozon',
    sourceId,
    currency: 'RUB',
    attributes: [],
    images: [],
    videoUrls: [],
    skuList: [],
    specList: [],
  }

  const states = data?.widgetStates || data || {}
  const allKeys = Object.keys(states)

  // ── Step 1: 按 widget key 匹配提取 ──
  // 数据结构参考: 后端 ozon_product_scraper.py 中的解析逻辑
  for (const [key, val] of Object.entries(states)) {
    if (typeof val !== 'string') continue
    let widget: any
    try { widget = JSON.parse(val as string) } catch { continue }

    // --- 标题: webProductHeading ---
    if (!result.title && key.includes('webProductHeading')) {
      const t = widget.title || widget.options?.title || widget.text || ''
      if (typeof t === 'string' && t.length > 3) {
        result.title = t
      }
    }

    // --- 价格: webPrice (排除 Decreased) ---
    if (!result.price && key.includes('webPrice') && !key.includes('Decreased')) {
      // Ozon webPrice widget: 可能有嵌套结构
      const priceRaw = widget.price || widget.options?.price || widget.actionPrice || widget.options?.actionPrice || ''
      const oldPriceRaw = widget.oldPrice || widget.options?.oldPrice || widget.basePrice || widget.options?.basePrice || ''
      const p = parsePrice(String(priceRaw))
      const op = parsePrice(String(oldPriceRaw))
      if (p > 0) result.price = p
      if (op > 0) result.oldPrice = op
    }

    // --- 评分和评论数: webReviewProductScore ---
    // Ozon 实际结构: { "totalScore": 4.9, "reviewsCount": 61800, "score": null }
    if (!result.rating && key.includes('webReviewProductScore')) {
      const totalScore = widget.totalScore ?? widget.options?.totalScore ?? widget.score ?? null
      const reviewsCount = widget.reviewsCount ?? widget.options?.reviewsCount ?? widget.reviewCount ?? null
      const r = parseFloat(String(totalScore).replace(',', '.'))
      if (r > 0 && r <= 5) result.rating = r  // Ozon rating 1-5
      const c = parseInt(String(reviewsCount).replace(/\D/g, ''))
      if (c > 0) result.reviewCount = c
    }

    // --- 品牌: webBrand (不是 webBrandName!) ---
    // Ozon 实际 key 是 "webBrand-xxx", 结构: { content: { title: { text: [{ type: "link", content: "BrandName" }] } } }
    if (!result.brand && key.includes('webBrand') && !key.includes('webBrandGrid')) {
      // 路径 1: content.title.text[].content
      const textArr = widget.content?.title?.text || widget.options?.content?.title?.text || []
      if (Array.isArray(textArr)) {
        for (const t of textArr) {
          if (t?.type === 'link' && t?.content && typeof t.content === 'string' && t.content.length > 1) {
            result.brand = t.content.trim()
            break
          }
        }
      }
      // 路径 2: 简单字段
      if (!result.brand) {
        const b = widget.text || widget.options?.text || widget.name || widget.options?.name || ''
        if (typeof b === 'string' && b.length > 1) result.brand = b.trim()
      }
    }

    // --- 分类面包屑: webBreadcrumb ---
    if (!result.category && key.includes('webBreadcrumb')) {
      const crumbs = widget.options?.items || widget.items || widget.links || []
      if (Array.isArray(crumbs) && crumbs.length > 1) {
        const cats = crumbs.map((c: any) => c.title || c.text || c.label || c.name || '').filter(Boolean)
        if (cats.length > 1) result.category = cats.slice(1).join(' > ')
      }
    }

    // --- 描述: webDescription ---
    if (!result.description && key.includes('webDescription')) {
      const d = widget.text || widget.options?.text || widget.content || widget.options?.content || widget.description || ''
      if (typeof d === 'string' && d.length > 10) result.description = d.slice(0, 2000)
    }

    // --- 属性/特征: webShortCharacteristics / webCharacteristics / webFullCharacteristics ---
    // Ozon has multiple characteristics widgets with DIFFERENT data structures:
    //   webShortCharacteristics — 3-5 "highlight" attrs at top of page
    //     Structure A: { characteristics: [{ title: { textRs: [...] }, values: [{ text: "..." }] }] }
    //   webCharacteristics — FULL product specs (20-30+ attrs)
    //     Structure B: { sections: [{ title: "...", properties: [{ name, value, propertyName, propertyValues }] }] }
    //     Structure C: { characteristics: [{ groupName, properties: [{ propertyName, propertyValues }] }] }
    //     Structure D: { groups: [{ title, properties: [{ title, value }] }] }
    //   webFullCharacteristics — sometimes used for detailed specs
    //   webProductProperties / webSpecifications — alternative widget names
    if (key.includes('haract') || key.includes('roper') || key.includes('pecif') || key.includes('webFull')) {
      // ── Extract from Structure A: characteristics[].title.textRs + values[].text ──
      const chars = widget.characteristics || widget.options?.characteristics || []
      if (Array.isArray(chars)) {
        for (const ch of chars) {
          if (!ch) continue

          // ── Path 1: title.textRs[].content → values[].text (webShortCharacteristics format) ──
          let name = ''
          const textRs = ch.title?.textRs || ch.title?.text || []
          if (Array.isArray(textRs)) {
            for (const tr of textRs) {
              if (tr?.type === 'text' && tr?.content) { name = tr.content; break }
              if (tr?.type === 'link' && tr?.content) { name = tr.content; break }
            }
          }
          // Path 2: title is a string directly
          if (!name && typeof ch.title === 'string') name = ch.title
          // Path 3: name/label/propertyName fields
          if (!name) name = ch.name || ch.label || ch.property || ch.propertyName || ''

          // ── Extract value ──
          let value = ''
          // values[].text (webShortCharacteristics format)
          const values = ch.values || []
          if (Array.isArray(values)) {
            for (const v of values) {
              if (v?.text) { value = v.text; break }
              if (v?.content) { value = v.content; break }
            }
          }
          // propertyValues[].value (webCharacteristics format)
          if (!value && Array.isArray(ch.propertyValues)) {
            for (const pv of ch.propertyValues) {
              if (pv?.value) { value = pv.value; break }
            }
          }
          // Direct value/text fields
          if (!value) value = ch.value || ch.text || ''

          if (name && String(name).length > 1) {
            result.attributes!.push({ name: String(name), value: String(value) })
            if (!result.brand && /^бренд$/i.test(String(name).trim())) {
              result.brand = String(value).trim()
            }
          }

          // ── Nested properties inside a characteristic group ──
          if (ch.properties && Array.isArray(ch.properties)) {
            for (const prop of ch.properties) {
              if (!prop) continue
              let pName = prop.name || prop.propertyName || prop.title || ''
              if (!pName && typeof prop.title === 'string') pName = prop.title
              // Try textRs for name
              if (!pName && Array.isArray(prop.title?.textRs)) {
                for (const tr of prop.title.textRs) {
                  if (tr?.type === 'text' && tr?.content) { pName = tr.content; break }
                }
              }
              let pValue = prop.value || prop.text || ''
              if (!pValue && Array.isArray(prop.propertyValues)) {
                for (const pv of prop.propertyValues) { if (pv?.value) { pValue = pv.value; break } }
              }
              if (!pValue && Array.isArray(prop.values)) {
                for (const v of prop.values) { if (v?.text) { pValue = v.text; break } }
              }
              if (pName && String(pName).length > 1) {
                result.attributes!.push({ name: String(pName), value: String(pValue) })
                if (!result.brand && /^бренд$/i.test(String(pName).trim())) {
                  result.brand = String(pValue).trim()
                }
              }
            }
          }
        }
      }

      // ── Extract from Structure B: sections[].properties[] ──
      const sections = widget.sections || widget.options?.sections || []
      if (Array.isArray(sections)) {
        for (const sec of sections) {
          if (!sec) continue
          const props = sec.properties || sec.items || sec.rows || []
          if (!Array.isArray(props)) continue
          for (const prop of props) {
            if (!prop) continue
            let pName = prop.name || prop.propertyName || prop.label || prop.title || ''
            if (!pName && Array.isArray(prop.title?.textRs)) {
              for (const tr of prop.title.textRs) { if (tr?.content) { pName = tr.content; break } }
            }
            let pValue = prop.value || prop.text || ''
            if (!pValue && Array.isArray(prop.propertyValues)) {
              for (const pv of prop.propertyValues) { if (pv?.value) { pValue = pv.value; break } }
            }
            if (!pValue && Array.isArray(prop.values)) {
              for (const v of prop.values) { if (v?.text) { pValue = v.text; break } }
            }
            if (pName && String(pName).length > 1) {
              result.attributes!.push({ name: String(pName), value: String(pValue) })
              if (!result.brand && /^бренд$/i.test(String(pName).trim())) {
                result.brand = String(pValue).trim()
              }
            }
          }
        }
      }

      // ── Extract from Structure D: groups[].properties[] ──
      const groups = widget.groups || widget.options?.groups || []
      if (Array.isArray(groups)) {
        for (const grp of groups) {
          if (!grp) continue
          const props = grp.properties || grp.items || []
          if (!Array.isArray(props)) continue
          for (const prop of props) {
            if (!prop) continue
            let pName = prop.name || prop.title || prop.label || ''
            if (!pName && Array.isArray(prop.title?.textRs)) {
              for (const tr of prop.title.textRs) { if (tr?.content) { pName = tr.content; break } }
            }
            let pValue = prop.value || prop.text || ''
            if (!pValue && Array.isArray(prop.values)) {
              for (const v of prop.values) { if (v?.text) { pValue = v.text; break } }
            }
            if (pName && String(pName).length > 1) {
              result.attributes!.push({ name: String(pName), value: String(pValue) })
            }
          }
        }
      }
    }

    // --- 卖家: webMerchantInfo / webBestSeller ---
    if (!result.sellerName && (key.includes('webMerchantInfo') || key.includes('webBestSeller'))) {
      const s = widget.merchantName || widget.options?.merchantName || widget.text || widget.name || ''
      if (typeof s === 'string' && s.length > 1) result.sellerName = s
    }

    // --- 图片: webGallery ---
    if (!result.images!.length && key.includes('webGallery')) {
      const raw = widget.options?.images || widget.images || widget.items || []
      if (Array.isArray(raw) && raw.length > 0) {
        result.images = raw.map((img: any) => {
          if (typeof img === 'string') return img.startsWith('//') ? 'https:' + img : img
          const url = img.big || img.medium || img.small || img.url || img.src || ''
          return url.startsWith('//') ? 'https:' + url : url
        }).filter(Boolean)
      }
    }
  }

  // ── Step 2: 品牌 fallback — 从标题中提取 ──
  if (!result.brand && result.title) {
    const firstWord = result.title.split(/[\s,]/)[0]
    if (firstWord && firstWord.length > 1 && firstWord.length < 40 && /^[A-Za-zА-Яа-я]/.test(firstWord)) {
      result.brand = firstWord
    }
  }

  // ── Step 3: 品牌 fallback — 从 breadcrumbs 中提取 ──
  if (!result.brand) {
    for (const [key, val] of Object.entries(states)) {
      if (typeof val !== 'string' || !key.includes('Breadcrumb')) continue
      try {
        const w = JSON.parse(val as string)
        const crumbs = w.options?.items || w.items || w.links || []
        if (Array.isArray(crumbs) && crumbs.length >= 2) {
          for (let i = crumbs.length - 2; i >= 0; i--) {
            const name = crumbs[i].title || crumbs[i].text || ''
            if (name && name.length > 1 && name.length < 60 && !name.includes('ozon.ru')) {
              result.brand = name
              break
            }
          }
        }
      } catch {}
    }
  }

  // ── Step 4: 从属性中提取物理规格、标识符、折扣、库存 → JSON arrays ──
  const specAccum: { weight_g: number; depth_mm: number; height_mm: number; width_mm: number } = { weight_g: 0, depth_mm: 0, height_mm: 0, width_mm: 0 }
  if (result.attributes && result.attributes.length > 0) {
    for (const attr of result.attributes) {
      const name = (attr.name || '').toLowerCase().trim()
      const val = attr.value || ''

      // 折扣
      if (!result.discount && (name === 'скидка' || name.includes('discount'))) {
        result.discount = val
      }

      // 库存
      if (!result.stock && (name.includes('остал') || name.includes('stock') || name === 'наличие')) {
        result.stock = val
      }

      // 重量
      if (!specAccum.weight_g && (name.includes('вес') || name === 'масса' || name === 'weight')) {
        const m = val.match(/([\d.,]+)\s*(г|грамм|kg|кг)/i)
        if (m) {
          let num = parseFloat(m[1].replace(',', '.'))
          if (/kg|кг/i.test(m[2])) num *= 1000
          if (num > 0) specAccum.weight_g = Math.round(num)
        }
      }

      // Combined dimensions: "200 x 150 x 50 мм"
      if (name.includes('размер') || name.includes('габарит')) {
        const m = val.match(/(\d[\d.,]*)\s*[x×\*]\s*(\d[\d.,]*)\s*[x×\*]\s*(\d[\d.,]*)\s*мм/i)
        if (m && !specAccum.depth_mm) {
          specAccum.depth_mm = Math.round(parseFloat(m[1].replace(',', '.')))
          specAccum.width_mm = Math.round(parseFloat(m[2].replace(',', '.')))
          specAccum.height_mm = Math.round(parseFloat(m[3].replace(',', '.')))
        }
      }

      // Individual dimensions
      if (!specAccum.depth_mm && (name.includes('глубин') || name.includes('длин') || name === 'depth')) {
        const m = val.match(/([\d.,]+)\s*мм/i)
        if (m) specAccum.depth_mm = Math.round(parseFloat(m[1].replace(',', '.')))
      }
      if (!specAccum.height_mm && (name.includes('высот') || name === 'height')) {
        const m = val.match(/([\d.,]+)\s*мм/i)
        if (m) specAccum.height_mm = Math.round(parseFloat(m[1].replace(',', '.')))
      }
      if (!specAccum.width_mm && (name.includes('ширин') || name === 'width')) {
        const m = val.match(/([\d.,]+)\s*мм/i)
        if (m) specAccum.width_mm = Math.round(parseFloat(m[1].replace(',', '.')))
      }

      // 条形码
      if (name.includes('штрихкод') || name.includes('barcode') || name === 'ean' || name === 'gtin') {
        const code = val.replace(/\D/g, '')
        if (code.length >= 8) {
          const exists = result.skuList!.some(s => s.barcode === code)
          if (!exists) result.skuList!.push({ sku: '', barcode: code })
        }
      }

      // 供应商 SKU
      if (name.includes('артикул продавца') || name.includes('артикул') || name.includes('supplier sku')) {
        if (val.length > 1 && val.length < 64) {
          const exists = result.skuList!.some(s => s.sku === val.trim())
          if (!exists) result.skuList!.push({ sku: val.trim(), barcode: '' })
        }
      }
    }
  }
  // Flush spec accumulator → specList
  if (specAccum.weight_g || specAccum.depth_mm || specAccum.height_mm || specAccum.width_mm) {
    result.specList!.push(specAccum)
  }

  // ── Step 5: 从 widget 中直接提取折扣 ──
  if (!result.discount) {
    for (const [key, val] of Object.entries(states)) {
      if (typeof val !== 'string' || !key.includes('webPrice')) continue
      try {
        const w = JSON.parse(val as string)
        const disc = w.discount || w.options?.discount || w.badge || ''
        if (disc && typeof disc === 'string') {
          result.discount = disc
          break
        }
      } catch {}
    }
  }

  // ── Step 6: 从 widget 中提取库存 ──
  if (!result.stock) {
    for (const [key, val] of Object.entries(states)) {
      if (typeof val !== 'string' || !key.includes('webStock')) continue
      try {
        const w = JSON.parse(val as string)
        const stockText = w.text || w.options?.text || w.value || w.stockText || ''
        if (stockText && typeof stockText === 'string') {
          result.stock = stockText
          break
        }
      } catch {}
    }
  }

  // ── Step 7: 从 widget 中提取视频 → videoUrls[] ──
  if (!result.videoUrls!.length) {
    for (const [key, val] of Object.entries(states)) {
      if (typeof val !== 'string') continue
      if (key.includes('webVideo') || key.includes('video')) {
        try {
          const w = JSON.parse(val as string)
          const url = w.url || w.videoUrl || w.options?.url || w.options?.videoUrl || ''
          if (url && typeof url === 'string' && url.startsWith('http')) {
            if (!result.videoUrls!.includes(url)) result.videoUrls!.push(url)
          }
        } catch {}
      }
    }
  }

  console.log(`[鲸智 AI] parseResult ${sourceId}:`, {
    title: result.title?.substring(0, 50),
    brand: result.brand,
    rating: result.rating,
    reviewCount: result.reviewCount,
    price: result.price,
    discount: result.discount,
    stock: result.stock,
    images: result.images!.length,
    attrs: result.attributes!.length,
    videoUrls: result.videoUrls!.length,
    skuList: result.skuList!.length,
    specList: result.specList!.length,
  })

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

    const detail = await fetchProductDetailFromApi(p.sourceId, p.sourceUrl)
    if (detail) {
      results.push({ id: p.id, data: detail })
    }

    // ★ 拟人化:使用渐进加速延时 + 偶尔长停顿
    if (i < products.length - 1) {
      await enrichDelay(i, products.length, DELAY_MIN, DELAY_MAX)
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
    console.log('[鲸智 AI] Ozon content script loaded, path:', location.pathname)

    // SPA 导航时动态更新 pageType (Ozon 是 SPA,URL 变化不触发 content script 重载)
    let pageType = detectPageType()

    // ── 注入悬浮采集按钮 (商品详情页) ──
    if (pageType === 'product') {
      injectFloatingButton(async () => {
        const product = await scrapeOzonProduct()
        if (!product) throw new Error('采集失败: 无法提取商品信息')
        const result = await browser.runtime.sendMessage({ action: 'productScraped', data: product })
        if (!result?.success) throw new Error(result?.error || '上报失败')
      })
    }
    let scrapeStopFlag = false

    // 监听 URL 变化 (popstate + pushState)
    const onNavigate = () => {
      const newType = detectPageType()
      if (newType !== pageType) {
        pageType = newType
        console.log('[鲸智 AI] Page type changed to:', pageType)
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
        console.log(`[鲸智 AI] enrichProducts: ${products.length} items to enrich`)
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
        scrapeOzonProduct().then((product) => {
          sendResponse({ success: !!product, data: product })
        })
        return true // 异步响应
      }

      // 列表页滚动采集
      if (message.action === 'scrapeList') {
        const maxItems = message.maxItems || 50
        const scrollDelay = message.scrollDelay || 1500
        const batchSize = message.batchSize || 10
        scrapeStopFlag = false

        console.log(`[鲸智 AI] scrapeList: pageType=${pageType}, maxItems=${maxItems}, scrollDelay=${scrollDelay}, batchSize=${batchSize}`)

        // 先扫描一次看当前有多少
        const initialCards = scanListCards()
        console.log(`[鲸智 AI] scrapeList: initial scan found ${initialCards.length} cards`)

        if (initialCards.length === 0 && pageType !== 'list') {
          console.log('[鲸智 AI] scrapeList: aborting — not a list page and no cards found')
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
            currency: 'RUB',
            price: c.price,
            oldPrice: c.oldPrice,
            images: c.imageUrl ? [c.imageUrl] : [],
            rating: c.rating,
            reviewCount: c.reviewCount,
            brand: c.brand || '',
            category: '',
            sellerName: c.sellerName || '',
            sellerUrl: '',
            attributes: [],
            description: '',
            sourceUrl: c.sourceUrl,
            scrapedAt: new Date().toISOString(),
          }))

          // ★ 拟人化:滚动采集结束后,模拟用户停顿再开始逐个查看详情
          await transitionPause()

          const total = products.length
          let enriched = 0
          let synced = 0

          // 增量批量: 每 batchSize 个商品,补全详情后立即上报后端
          for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
            if (scrapeStopFlag) {
              console.log('[鲸智 AI] scrapeList: stopped by user')
              break
            }

            // ★ 拟人化:批次之间加入自然停顿
            if (batchStart > 0) {
              await batchTransitionPause()
            }

            const batchEnd = Math.min(batchStart + batchSize, total)
            const batch = products.slice(batchStart, batchEnd)

            // Phase: enrich batch
            browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'enrich' } })

            for (let i = 0; i < batch.length; i++) {
              if (scrapeStopFlag) break
              const p = batch[i]
              const detail = await fetchProductDetailFromApi(p.sourceId, p.sourceUrl)
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
                console.log(`[鲸智 AI] scrapeList: enriched ${p.sourceId} — brand=${batch[i].brand}`)
              }
              // ★ 拟人化:使用渐进加速延时 + 偶尔长停顿
              if (i < batch.length - 1) {
                await enrichDelay(i, batch.length)
              }
            }

            // Phase: sync batch to backend
            browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'sync' } })

            try {
              const syncResult = await browser.runtime.sendMessage({ action: 'batchSyncProducts', products: batch })
              if (syncResult?.success) {
                synced += batch.length
                console.log(`[鲸智 AI] scrapeList: synced batch ${batchStart}-${batchEnd} (${synced}/${total})`)
              }
            } catch (e) {
              console.error('[鲸智 AI] scrapeList: batch sync failed', e)
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
