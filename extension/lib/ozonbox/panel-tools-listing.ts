import type { OzonboxCollectedProduct, OzonboxStore, OzonboxVariant } from './contract'
import type { PanelListingPreview, PanelListingStore, PanelListingVariant } from './panel-tools-contract'

function productVariants(product: OzonboxCollectedProduct): PanelListingVariant[] {
  const variants: OzonboxVariant[] = product.variantsData.length
    ? product.variantsData
    : [{ sku: product.sku || product.productId, price: product.price, images: [], supplierAttrs: [], variantAttrs: {} }]
  return variants.map((variant, index) => ({
    sku: variant.sku || variant.offerId || variant.id || `${product.productId}-${index + 1}`,
    name: variant.supplierSpecText
      || Object.entries(variant.variantAttrs).map(([name, value]) => `${name}:${String(value)}`).join(' / ')
      || `默认规格 ${index + 1}`,
    priceRub: variant.price || product.price,
    oldPriceRub: variant.oldPrice || Math.round((variant.price || product.price) * 1.2),
    images: variant.images?.length ? variant.images : product.images,
    customWeightG: variant.packageWeightG,
    packageLengthMm: variant.packageDepthMm,
    packageWidthMm: variant.packageWidthMm,
    packageHeightMm: variant.packageHeightMm,
    selected: index === 0,
  }))
}

export function toPanelListingStores(stores: OzonboxStore[]): PanelListingStore[] {
  return stores.map(store => ({
    id: store.id,
    name: store.storeName || store.name,
    usable: store.usable,
    reason: store.usable ? undefined : `店铺状态：${store.status || '不可用'}`,
  }))
}

export function buildPanelListingPreview(
  product: OzonboxCollectedProduct,
  stores: PanelListingStore[],
  previewOnlyTransforms: string[],
): PanelListingPreview {
  return {
    productId: product.productId,
    sourceUrl: product.sourceUrl,
    title: product.title,
    brand: product.brand || undefined,
    primaryImage: product.images[0],
    stores,
    variants: productVariants(product),
    descriptionCategoryId: product.descriptionCategoryId || undefined,
    typeId: product.typeId || undefined,
    previewOnlyTransforms,
  }
}