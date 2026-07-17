import type { OzonSkuCardData } from '../ozonList/types'

const GOODS_DATA_PROP = '__mjgdGoodsData'

type CardWithData = HTMLElement & { [GOODS_DATA_PROP]?: OzonSkuCardData }

export function setCardGoodsData(card: HTMLElement, data: OzonSkuCardData) {
  ;(card as CardWithData)[GOODS_DATA_PROP] = data
}

export function getCardGoodsData(card: HTMLElement): OzonSkuCardData | null {
  return (card as CardWithData)[GOODS_DATA_PROP] || null
}

export function setCardListPriceText(card: HTMLElement, priceText?: string) {
  if (priceText) {
    card.dataset.listPriceText = priceText
  }
}

export function getCardListPriceText(card: HTMLElement): string {
  return card.dataset.listPriceText || ''
}

export function getSkuFromCard(card: HTMLElement): string {
  const fromVal = card.querySelector<HTMLElement>('.mjgd_ozon_sku_val')?.getAttribute('data-sku')
  if (fromVal) return String(fromVal).trim()
  return String(card.dataset.sku || '').trim()
}
