import type { QuickShelveSubmitFlags, TemplateShopWarehouseConfig, UpperTemplateItem } from './types'

export function defaultSubmitFlags(): QuickShelveSubmitFlags {
  return {
    upperShelveDirect: true,
    aiImage: false,
    oModel: true,
    handMovementStatus: true,
    Btxh: true,
    madeCountryStatus: true,
    jsonStatus: true,
    tagStatus: true,
    bigmodelAi: 0,
    pricateStatus: 0,
    removeBrandText: false,
    generateBarcode: 0,
    antiFollowEnabled: 0,
    antiFollowTemplateId: null,
    brandStatus: true,
    brand: null,
    brandId: null,
    productSuffix: null,
    aiTemplateId: null,
  }
}

/** 将上品模板行映射为提交开关（对齐旧版 upperTpl_stateFromProductTemplateRow） */
export function flagsFromTemplateItem(item: UpperTemplateItem | null): QuickShelveSubmitFlags {
  const base = defaultSubmitFlags()
  const row = item?.raw
  if (!row) return base

  // 方式：后端 statusFlag → upperShelveDirect（true=直上，false=修改），对齐旧版 switch4
  if (row.statusFlag != null) base.upperShelveDirect = !!row.statusFlag
  if (row.imageStatus != null) base.aiImage = !row.imageStatus
  if (row.oModel != null) base.oModel = !!row.oModel
  if (row.handMovementStatus != null) base.handMovementStatus = !!row.handMovementStatus
  if (row.btxh != null) base.Btxh = !!row.btxh
  if (row.madeCountryStatus != null) base.madeCountryStatus = !!row.madeCountryStatus
  if (row.tagStatus != null) base.tagStatus = !!row.tagStatus
  if (row.jsonStatus != null) base.jsonStatus = !!row.jsonStatus
  if (row.bigmodelAiStatus != null) base.bigmodelAi = row.bigmodelAiStatus ? 1 : 0
  if (row.aiTemplateId != null && row.aiTemplateId !== '') base.aiTemplateId = String(row.aiTemplateId)
  if (row.productSuffix != null) base.productSuffix = String(row.productSuffix)
  if (row.removeBrandText != null) base.removeBrandText = !!row.removeBrandText
  if (row.generateBarcode != null) base.generateBarcode = Number(row.generateBarcode) === 1 ? 1 : 0
  if (row.antiFollowEnabled != null) base.antiFollowEnabled = Number(row.antiFollowEnabled) === 1 ? 1 : 0
  if (row.antiFollowTemplateId != null) base.antiFollowTemplateId = Number(row.antiFollowTemplateId)

  const bm = row.brandMode != null ? Number(row.brandMode) : NaN
  if (bm === 0) {
    base.brandStatus = false
  } else if (bm === 2) {
    base.brandStatus = true
    base.brand = row.brand != null ? String(row.brand) : null
    if (row.brandId != null && row.brandId !== 0) {
      base.brandId = String(row.brandId)
    }
  }

  const pr = row.pricateStatus != null ? Number(row.pricateStatus) : 0
  base.pricateStatus = pr

  return base
}

/**
 * 从 productTemplateSelectList 行解析 shopWarehouseConfigs。
 * null = 模板未带该字段，不改动外层店铺选择；[] = 显式清空全部勾选。
 */
export function shopWarehouseConfigsFromTemplate(item: UpperTemplateItem | null): TemplateShopWarehouseConfig[] | null {
  const row = item?.raw
  if (!row || !Array.isArray(row.shopWarehouseConfigs)) return null
  return row.shopWarehouseConfigs
    .filter((c): c is Record<string, unknown> => !!c && c.shopId != null && c.shopId !== '')
    .map((c) => ({
      shopId: String(c.shopId),
      warehouseId: c.warehouseId != null && c.warehouseId !== '' ? String(c.warehouseId) : null,
      stock: c.stock as number | string | undefined,
    }))
}
