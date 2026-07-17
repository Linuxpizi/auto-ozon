import type { OzonSellerOffer } from '../ozonBatchCrawl/crawlSkuApi'

const SELLERS_KEY = '__mjgdFollowSellers'

type CardWithSellers = HTMLElement & { [SELLERS_KEY]?: OzonSellerOffer[] | null }

export function setCardFollowSellers(card: HTMLElement, sellers: OzonSellerOffer[] | null) {
  ;(card as CardWithSellers)[SELLERS_KEY] = sellers
}

export function getCardFollowSellers(card: HTMLElement): OzonSellerOffer[] | null {
  const list = (card as CardWithSellers)[SELLERS_KEY]
  return Array.isArray(list) ? list : null
}
