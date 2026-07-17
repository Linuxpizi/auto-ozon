import { needsCardFollowApi } from '../ozonCardSettings/cardFieldStore'
import { fetchOtherOffersSellers } from '../ozonBatchCrawl/crawlSkuApi'
import { extractPriceUnit, parseOzonPriceNumber } from '../ozonBatchCrawl/exportPriceUtils'
import { loadExchangeRates } from '../ozonQuickShelve/exchangeRateStore'
import { applySelectionTagForCard } from '../ozonSelectionRules'
import { getCardListPriceText } from '../ozonSelectionRules/cardData'
import { readDetailPriceText } from './detailPageContext'
import { isOzonProductPath } from './ozonPageContext'
import { applyFollowFieldsToCard, type FollowFieldsPatch } from './skuCardRenderer'
import { getCardFollowSellers, setCardFollowSellers } from './followSellerCache'

const followLoadTokens = new WeakMap<HTMLElement, number>()
let followLoadSeq = 0

function readCurrentPriceText(card: HTMLElement): string {
  const listPrice = getCardListPriceText(card)
  if (listPrice) return listPrice
  if (isOzonProductPath()) return readDetailPriceText()
  return ''
}

/** 跟卖数据：Ozon otherOffersFromSellers（对齐旧版 getGMnumber） */
export async function loadCardFollowData(card: HTMLElement, sku: string): Promise<void> {
  if (!card.isConnected || !sku) return
  if (!needsCardFollowApi()) return

  const token = ++followLoadSeq
  followLoadTokens.set(card, token)

  // 跟卖价 ≈￥ 依赖 exchangeRateState.rates，但列表页此前从不加载汇率
  // （只有急速上架弹窗 / 汇率设置会 loadExchangeRates），导致卡片用的是内存默认汇率而非
  // 用户「汇率设置」值，≈￥ 与急速上架对不上。这里与卖家列表并发加载（命中本地缓存几乎零开销，
  // loadExchangeRates 内部已做并发去重），确保渲染前 rates 已就绪。
  const [sellers] = await Promise.all([
    fetchOtherOffersSellers(sku),
    loadExchangeRates().catch(() => null),
  ])
  if (!card.isConnected || followLoadTokens.get(card) !== token) return

  if (!sellers?.length) {
    if (getCardFollowSellers(card)?.length) return
    setCardFollowSellers(card, [])
    applyFollowFieldsToCard(card, {
      gnumber: 0,
      priceMin: null,
      priceMax: null,
      priceMinSku: '',
      priceMaxSku: '',
    })
    applySelectionTagForCard(card)
    return
  }

  setCardFollowSellers(card, sellers)

  let priceMinSku = String(sellers[0].sku)
  let priceMaxSku = String(sellers[sellers.length - 1].sku)
  let priceMin = sellers[0].price?.cardPrice?.price ?? sellers[0].price?.price ?? ''
  let priceMax =
    sellers[sellers.length - 1].price?.cardPrice?.price
    ?? sellers[sellers.length - 1].price?.price
    ?? ''

  const listPrice = readCurrentPriceText(card)
  const currentRub = parseOzonPriceNumber(listPrice)
  const priceUnit = extractPriceUnit(String(priceMin || priceMax || ''))

  if (Number.isFinite(currentRub) && currentRub > 0) {
    const minNum = parseOzonPriceNumber(String(priceMin))
    const maxNum = parseOzonPriceNumber(String(priceMax))
    if (Number.isFinite(minNum) && currentRub < minNum) {
      priceMin = `${currentRub}${priceUnit ? ` ${priceUnit}` : ''}`
      priceMinSku = sku
    }
    if (Number.isFinite(maxNum) && currentRub > maxNum) {
      priceMax = `${currentRub}${priceUnit ? ` ${priceUnit}` : ''}`
      priceMaxSku = sku
    }
  }

  const patch: FollowFieldsPatch = {
    gnumber: sellers.length,
    priceMin: parseOzonPriceNumber(String(priceMin)) || priceMin,
    priceMax: parseOzonPriceNumber(String(priceMax)) || priceMax,
    priceMinSku,
    priceMaxSku,
    // 透传原价币种符号：商城为美元/人民币时按真实币种展示并换算 ≈￥
    priceUnit,
  }

  applyFollowFieldsToCard(card, patch)
  applySelectionTagForCard(card)
}
