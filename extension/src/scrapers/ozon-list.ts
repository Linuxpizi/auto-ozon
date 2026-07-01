/**
 * Ozon 列表页采集器
 * 
 * 功能:
 * 1. 按搜索条件在 Ozon 上搜索商品
 * 2. 过滤符合条件的商品(价格、评分、评价数、品牌)
 * 3. 采集商品详情
 * 4. 保存到数据库
 */

import type { Browser } from 'playwright'
import type { ScrapedProduct } from '../utils/types'

interface OzonSearchParams {
  keyword: string
  priceMin?: number
  priceMax?: number
  minRating?: number
  minReviews?: number
  brandWhitelist?: string[]
  brandBlacklist?: string[]
  maxItems?: number
}

interface OzonScrapeResult {
  products: ScrapedProduct[]
  totalCount: number
  hasMore: boolean
}

export class OzonListScraper {
  private browser: Browser

  constructor(browser: Browser) {
    this.browser = browser
  }

  /**
   * 搜索并采集 Ozon 商品
   */
  async searchAndScrape(params: OzonSearchParams): Promise<OzonScrapeResult> {
    const {
      keyword,
      priceMin = 0,
      priceMax = Infinity,
      minRating = 0,
      minReviews = 0,
      brandWhitelist = [],
      brandBlacklist = [],
      maxItems = 50,
    } = params

    const page = await this.browser.newPage()
    const products: ScrapedProduct[] = []

    try {
      // 构建搜索 URL
      const searchUrl = this.buildSearchUrl(keyword, {
        priceMin,
        priceMax,
        minRating,
        brandWhitelist,
      })

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)

      // 滚动加载更多商品
      let loadedCount = 0
      const scrollStep = 10

      while (loadedCount < maxItems) {
        // 获取当前页面的商品
        const items = await this.extractListItems(page)

        if (items.length === 0) {
          break
        }

        // 过滤并采集商品详情
        for (const item of items) {
          if (products.length >= maxItems) {
            break
          }

          // 检查价格范围
          if (item.price < priceMin || item.price > priceMax) {
            continue
          }

          // 检查评分
          if (item.rating < minRating) {
            continue
          }

          // 检查评价数
          if (item.reviewCount < minReviews) {
            continue
          }

          // 检查品牌黑名单
          if (brandBlacklist.length > 0 && brandBlacklist.includes(item.brand)) {
            continue
          }

          // 检查品牌白名单
          if (brandWhitelist.length > 0 && !brandWhitelist.includes(item.brand)) {
            continue
          }

          // 采集商品详情
          const product = await this.scrapeProductDetail(page, item.url)
          if (product) {
            products.push(product)
          }
        }

        loadedCount = items.length

        // 滚动加载更多
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * scrollStep)
        })
        await page.waitForTimeout(1500)
      }

      return {
        products,
        totalCount: products.length,
        hasMore: products.length < maxItems,
      }
    } finally {
      await page.close()
    }
  }

  /**
   * 构建搜索 URL
   */
  private buildSearchUrl(
    keyword: string,
    options: {
      priceMin?: number
      priceMax?: number
      minRating?: number
      brandWhitelist?: string[]
    }
  ): string {
    const baseUrl = 'https://www.ozon.ru/search/'
    const params = new URLSearchParams()

    params.set('text', keyword)
    params.set('from_global', 'true')

    // 价格范围
    if (options.priceMin !== undefined && options.priceMin > 0) {
      params.set('price_min', options.priceMin.toString())
    }
    if (options.priceMax !== undefined && options.priceMax < Infinity) {
      params.set('price_max', options.priceMax.toString())
    }

    // 评分
    if (options.minRating !== undefined && options.minRating > 0) {
      params.set('rating', options.minRating.toString())
    }

    // 品牌白名单
    if (options.brandWhitelist && options.brandWhitelist.length > 0) {
      params.set('brand', options.brandWhitelist.join(','))
    }

    return `${baseUrl}?${params.toString()}`
  }

  /**
   * 从列表页提取商品项
   */
  private async extractListItems(page: any): Promise<any[]> {
    return await page.evaluate(() => {
      const items: any[] = []
      const cards = document.querySelectorAll('[data-widget="searchResultsV2"] a[href*="/product/"]')

      cards.forEach((card: any) => {
        const titleEl = card.querySelector('span[class*="tsBody"]')
        const priceEl = card.querySelector('[class*="price"]')
        const ratingEl = card.querySelector('[class*="rating"]')
        const reviewEl = card.querySelector('[class*="review"]')
        const brandEl = card.querySelector('[class*="brand"]')

        const href = card.getAttribute('href')
        if (!href) return

        // 提取商品 ID
        const idMatch = href.match(/\/(\d{5,})\/?$/)
        if (!idMatch) return

        // 提取价格(数字)
        let price = 0
        if (priceEl) {
          const priceText = priceEl.textContent || ''
          const priceMatch = priceText.match(/([\d\s]+)\s*₽/)
          if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/\s/g, ''), 10)
          }
        }

        // 提取评分
        let rating = 0
        if (ratingEl) {
          const ratingText = ratingEl.textContent || ''
          const ratingMatch = ratingText.match(/([\d.]+)/)
          if (ratingMatch) {
            rating = parseFloat(ratingMatch[1])
          }
        }

        // 提取评价数
        let reviewCount = 0
        if (reviewEl) {
          const reviewText = reviewEl.textContent || ''
          const reviewMatch = reviewText.match(/([\d\s]+)/)
          if (reviewMatch) {
            reviewCount = parseInt(reviewMatch[1].replace(/\s/g, ''), 10)
          }
        }

        items.push({
          id: idMatch[1],
          title: titleEl?.textContent?.trim() || '',
          price,
          rating,
          reviewCount,
          brand: brandEl?.textContent?.trim() || '',
          url: href.startsWith('http') ? href : `https://www.ozon.ru${href}`,
        })
      })

      return items
    })
  }

  /**
   * 采集商品详情
   */
  private async scrapeProductDetail(
    page: any,
    url: string
  ): Promise<ScrapedProduct | null> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)

      return await page.evaluate(() => {
        // 提取商品 ID
        const idMatch = location.pathname.match(/\/(\d{5,})\/?$/)
        if (!idMatch) return null

        // 提取标题
        const h1 = document.querySelector('h1')
        const title = h1?.textContent?.trim()
        if (!title) return null

        // 提取价格
        const priceWidget = document.querySelector('[data-widget="webPrice"]')
        let price = 0
        let oldPrice = 0

        if (priceWidget) {
          const priceText = priceWidget.textContent || ''
          const prices = (priceText.match(/([\d\s]+)\s*₽/g) || []).map((m: string) =>
            parseInt(m.replace(/\s/g, '').replace('₽', ''), 10)
          )

          if (prices.length > 0) {
            price = prices[0]
          }

          // 最高价作为原价
          if (prices.length > 1) {
            oldPrice = Math.max(...prices)
          }
        }

        // 提取评分
        const ratingWidget = document.querySelector('[data-widget="webSingleProductScore"]')
        let rating = 0
        if (ratingWidget) {
          const ratingText = ratingWidget.textContent || ''
          const ratingMatch = ratingText.match(/([\d.]+)/)
          if (ratingMatch) {
            rating = parseFloat(ratingMatch[1])
          }
        }

        // 提取评价数
        const reviewWidget = document.querySelector('[data-widget="webReviewProductScore"]')
        let reviewCount = 0
        if (reviewWidget) {
          const reviewText = reviewWidget.textContent || ''
          const reviewMatch = reviewText.match(/([\d\s]+)/)
          if (reviewMatch) {
            reviewCount = parseInt(reviewMatch[1].replace(/\s/g, ''), 10)
          }
        }

        // 提取品牌
        const brandLink = document.querySelector('a[href*="/brand/"]')
        let brand = ''
        if (brandLink) {
          brand = brandLink.textContent?.trim() || ''
        }

        // 提取分类
        const breadcrumbs = document.querySelector('[data-widget="breadCrumbs"]')
        let category = ''
        if (breadcrumbs) {
          const links = Array.from(breadcrumbs.querySelectorAll('a'))
            .slice(1) // 跳过首页
            .map((a: any) => a.textContent?.trim())
            .filter(Boolean)
          category = links.join(' > ')
        }

        // 提取图片
        const gallery = document.querySelector('[data-widget="webGallery"]')
        let images: string[] = []
        if (gallery) {
          const imgs = Array.from(gallery.querySelectorAll('img.pdp_x5, img[src*="multimedia"]'))
          images = imgs
            .map((img: any) => img.src)
            .filter((src: string) => src.includes('multimedia') || src.includes('ozonru'))
            .map((url: string) => url.replace(/\/wc\d+\//, '/wc1000/'))
            .slice(0, 20)
        }

        // 提取视频
        const videoSources = Array.from(
          document.querySelectorAll('[data-widget="webGallery"] video source')
        ).map((s: any) => s.src)

        // 提取 SKU
        const skuWidget = document.querySelector('[data-widget="webDetailSKU"]')
        let skuList: Array<{ sku: string; barcode: string }> = []
        if (skuWidget) {
          const text = skuWidget.textContent || ''
          const artMatch = text.match(/Артикул[:\s]+(\S+)/i)
          if (artMatch) {
            skuList = [{ sku: artMatch[1], barcode: '' }]
          }
        }

        // 提取卖家信息
        const sellerWidget = document.querySelector('[data-widget="webBestSeller"]')
        let sellerName = ''
        let sellerUrl = ''
        if (sellerWidget) {
          const sellerLink = sellerWidget.querySelector('a[href*="/seller/"]')
          if (sellerLink) {
            sellerName = sellerLink.textContent?.trim() || ''
            sellerUrl = sellerLink.getAttribute('href') || ''
            if (sellerUrl && !sellerUrl.startsWith('http')) {
              sellerUrl = `https://www.ozon.ru${sellerUrl}`
            }
          }
        }

        // 提取属性
        const attributes: Array<{ name: string; value: string }> = []
        const aspects = document.querySelector('[data-widget="webAspects"]')
        if (aspects) {
          const items = aspects.querySelectorAll('.pdp_a1h')
          items.forEach((item: any) => {
            const keyEl = item.querySelector('[class*="k9"]')
            const valEl = item.querySelector('[class*="q5"]')
            if (keyEl && valEl) {
              attributes.push({
                name: keyEl.textContent?.trim().replace(/[:\s]+$/, '') || '',
                value: valEl.textContent?.trim() || '',
              })
            }
          })
        }

        // 提取描述
        const descWidget = document.querySelector('[data-widget="webDetailDescription"]')
        const description = descWidget?.textContent?.trim() || ''

        return {
          platform: 'ozon',
          sourceId: idMatch[1],
          title,
          currency: 'RUB',
          price,
          oldPrice,
          images,
          rating,
          reviewCount,
          brand,
          category,
          sellerName,
          sellerUrl,
          attributes,
          description,
          sourceUrl: location.href,
          scrapedAt: new Date().toISOString(),
          videoUrls: videoSources,
          skuList,
          specList: [],
        }
      })
    } catch (error) {
      console.error('Failed to scrape Ozon product detail:', error)
      return null
    }
  }
}

export default OzonListScraper
