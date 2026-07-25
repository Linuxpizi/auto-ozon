import type { OzonboxCollectedProduct, OzonboxVariant } from './contract'

function variantHasExactSku(variant: OzonboxVariant, sku: string): boolean {
  return [variant.id, variant.productId, variant.sku]
    .some(value => typeof value === 'string' && value.trim() === sku)
}

/** Keep only the factual variant whose identity exactly equals the requested list-card SKU. */
export function retainExactRequestedSkuVariant(
  product: OzonboxCollectedProduct,
  requestedSku: string,
): OzonboxCollectedProduct {
  const variant = product.variantsData.find(item => variantHasExactSku(item, requestedSku))
  if (!variant) throw new Error(`采集结果缺少当前 SKU ${requestedSku} 的真实变体`)
  return {
    ...product,
    variantsData: [variant],
  }
}