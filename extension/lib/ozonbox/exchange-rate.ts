/** Convert the backend's CNY/RUB quote into the RUB -> CNY multiplier. */
export function rubToCnyFromExchangeRates(rates: Record<string, unknown> | null | undefined): number | undefined {
  const cnyPerRubQuote = rates?.['CNY/RUB']
  const numeric = typeof cnyPerRubQuote === 'number'
    ? cnyPerRubQuote
    : typeof cnyPerRubQuote === 'string' ? Number(cnyPerRubQuote.trim()) : Number.NaN
  return Number.isFinite(numeric) && numeric > 0 ? 1 / numeric : undefined
}