import { finiteMetric } from './selection-matcher'
import type { OzonSellerOffersFacts } from './selection-matcher'

const SELLER_WIDGET_PREFIX = 'webSellerList-'
const SELLER_ARRAY_KEYS = new Set(['sellers', 'sellerList', 'sellerOffers', 'offers', 'items'])

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function priceFromSeller(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const seller = value as Record<string, unknown>
  const price = seller.price
  if (!price || typeof price !== 'object' || Array.isArray(price)) return undefined
  const priceRecord = price as Record<string, unknown>
  const cardPrice = priceRecord.cardPrice
  if (cardPrice && typeof cardPrice === 'object' && !Array.isArray(cardPrice)) {
    const cardValue = finiteMetric((cardPrice as Record<string, unknown>).price)
    if (cardValue !== undefined && cardValue >= 0) return cardValue
  }
  const directValue = finiteMetric(priceRecord.price)
  return directValue !== undefined && directValue >= 0 ? directValue : undefined
}

function sellerArrayFrom(value: unknown, seen: Set<unknown>): unknown[] | undefined {
  const parsed = parseJson(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || seen.has(parsed)) return undefined
  seen.add(parsed)

  const record = parsed as Record<string, unknown>
  for (const [key, child] of Object.entries(record)) {
    if (!SELLER_ARRAY_KEYS.has(key)) continue
    const parsedChild = parseJson(child)
    if (Array.isArray(parsedChild)) return parsedChild
  }
  for (const child of Object.values(record)) {
    const nested = sellerArrayFrom(child, seen)
    if (nested) return nested
  }
  return undefined
}

function sellerWidgetStates(value: unknown, result: unknown[] = [], seen = new Set<unknown>()): unknown[] {
  const parsed = parseJson(value)
  if (!parsed || typeof parsed !== 'object' || seen.has(parsed)) return result
  seen.add(parsed)
  if (Array.isArray(parsed)) {
    parsed.forEach((child) => sellerWidgetStates(child, result, seen))
    return result
  }
  for (const [key, child] of Object.entries(parsed as Record<string, unknown>)) {
    if (key.startsWith(SELLER_WIDGET_PREFIX)) result.push(parseJson(child))
    sellerWidgetStates(child, result, seen)
  }
  return result
}

/**
 * Parse Ozon's `webSellerList-*` widget without depending on a DOM shape.
 * Prices deliberately remain raw RUB because that is the unit used by the
 * reference selection rule for the minimum-follow-price condition.
 */
export function parseOzonSellerOffersResponse(response: unknown): OzonSellerOffersFacts {
  for (const state of sellerWidgetStates(response)) {
    const sellers = sellerArrayFrom(state, new Set())
    if (!sellers) continue
    const prices = sellers.map(priceFromSeller).filter((price): price is number => price !== undefined)
    return {
      sellerCount: sellers.length,
      hasExplicitNoSellers: sellers.length === 0,
      minimumPriceFollowRub: prices.length ? Math.min(...prices) : undefined,
      maximumPriceFollowRub: prices.length ? Math.max(...prices) : undefined,
    }
  }
  return { hasExplicitNoSellers: false }
}