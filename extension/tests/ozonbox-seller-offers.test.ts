import assert from 'node:assert/strict'
import { rubToCnyFromExchangeRates } from '../lib/ozonbox/exchange-rate'
import { parseOzonSellerOffersResponse } from '../lib/ozonbox/seller-offers'

const parsed = parseOzonSellerOffersResponse({
  widgetStates: {
    'webSellerList-123': JSON.stringify({
      sellers: [
        { price: { cardPrice: { price: '1 200 ₽' } } },
        { price: { price: '950' } },
        { price: { cardPrice: { price: 'invalid' }, price: '1 050' } },
      ],
    }),
  },
})
assert.deepEqual(parsed, {
  sellerCount: 3,
  hasExplicitNoSellers: false,
  minimumPriceFollowRub: 950,
  maximumPriceFollowRub: 1200,
})

assert.deepEqual(parseOzonSellerOffersResponse({
  'webSellerList-empty': { sellerList: [] },
}), {
  sellerCount: 0,
  hasExplicitNoSellers: true,
  minimumPriceFollowRub: undefined,
  maximumPriceFollowRub: undefined,
})
assert.deepEqual(parseOzonSellerOffersResponse({ 'webSellerList-missing': { data: {} } }), {
  hasExplicitNoSellers: false,
})
assert.deepEqual(parseOzonSellerOffersResponse({
  'webSellerList-unrelated-array': { data: { banners: [] } },
}), {
  hasExplicitNoSellers: false,
})

assert.equal(rubToCnyFromExchangeRates({ 'CNY/RUB': 11 }), 1 / 11)
assert.equal(rubToCnyFromExchangeRates({ 'CNY/RUB': '11' }), 1 / 11)
assert.equal(rubToCnyFromExchangeRates({ 'CNY/RUB': 0 }), undefined)
assert.equal(rubToCnyFromExchangeRates({ 'CNY/RUB': Number.NaN }), undefined)
assert.equal(rubToCnyFromExchangeRates({}), undefined)

console.log('ozonbox seller offers tests passed')