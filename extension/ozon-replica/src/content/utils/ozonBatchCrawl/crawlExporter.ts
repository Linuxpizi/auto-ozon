import ExcelJS from 'exceljs'
import {
  addCrawlLog,
  getCrawlExportCache,
  getCrawlProducts,
  getOperationSessionId,
  isOperationSessionActive,
  setCrawlExportCache,
  setCookieChecking,
  setCrawlStatus,
  setExporting,
  setExportProgress,
} from './crawlStorage'
import type { CrawlProductRecord } from './types'
import { showToast } from '../../../utils/toast'
import { showMessage } from '../../../utils/messageBox'
import {
  fetchAutoCrawlPreference,
  getCheckedExportFields,
  exportNeedsCookie,
  getExportConcurrency,
  categoryNeedsEnrichment,
  type AutoCrawlFieldDef,
  type AutoCrawlConfig,
} from './autoCrawlFields'
import { enrichCrawlProductsForExport, type EnrichedCrawlRow } from './crawlExportEnricher'
import {
  getShopCookieUnavailableMessage,
  inspectShopCookieAvailability,
} from './crawlSkuApi'
import {
  resolveExportImageColIndex,
  writeCrawlWorkbookToFile,
} from './crawlExcelWriter'
import {
  ensureExchangeRates,
  exportListingFormatCell,
  exportPriceToCnyText,
  formatExportPriceCell,
  priceUnitDisplayName,
} from './exportPriceUtils'
import { buildSelectionTagSheetsForExport } from '../ozonSelectionRules/exportSheets'
import { buildExportMatchPayloadFromEnriched } from '../ozonSelectionRules/exportMatch'

const BASIC_FIELD_KEYS = new Set([
  'listingFormat', 'sku', 'productTitle', 'productImage', 'imageLink', 'productLink',
  'priceCny', 'price', 'originalPrice', 'discount', 'promoStatus', 'promoActivity',
  'promoStock', 'rating', 'reviewCount', 'ratingDistribution', 'brandCert',
])

const FOLLOW_KEYS = ['followCount', 'followPriceRange', 'followMinLink', 'followMaxLink'] as const
/** 销量列在 processSalesData cells 中的索引（12 为 conversionRate 占位，UI 未勾选） */
const SALES_FIELD_INDEX: Record<string, number> = {
  articleNumber: 0,
  brand: 1,
  category: 2,
  fbsCommission: 3,
  fbpCommission: 4,
  promo28d: 5,
  paidPromo28d: 6,
  monthlySalesAmount: 7,
  adCostRatio: 8,
  weeklySales: 9,
  monthlySalesVolume: 10,
  turnoverDynamic: 11,
  totalImpressions: 13,
  impressionConvRate: 14,
  productClicks: 15,
  cartConvRate: 16,
  promoDiscount: 17,
  promoConvRate: 18,
  volumeLiter: 19,
  avgPrice: 20,
  sellerType: 21,
  searchTraffic: 23,
  searchCartRate: 24,
  clickRate: 25,
  returnRate: 26,
  createTime: 27,
}
const WEIGHT_KEYS = ['lengthMm', 'widthMm', 'heightMm', 'weightG'] as const

function needsAsyncEnrichment(config: AutoCrawlConfig): boolean {
  return ['follow', 'sales', 'weight'].some((key) => categoryNeedsEnrichment(key, config))
}

function headerLabel(field: AutoCrawlFieldDef, unitName: string): string {
  if (unitName && field.key === 'price') return `价格（${unitName}）`
  if (unitName && field.key === 'originalPrice') return `原价（${unitName}）`
  return field.label
}

function basicCell(record: CrawlProductRecord, key: string): string {
  switch (key) {
    case 'listingFormat':
      return exportListingFormatCell(record.sku, record.price)
    case 'sku':
      return record.sku
    case 'productTitle':
      return record.title
    case 'productImage':
      return record.imageBase64 || ''
    case 'imageLink':
      return record.imageUrl
    case 'productLink':
      return record.productUrl
    case 'priceCny':
      return exportPriceToCnyText(record.price)
    case 'price':
      return formatExportPriceCell(record.price)
    case 'originalPrice':
      return formatExportPriceCell(record.originalPrice)
    case 'discount':
      return record.discount
    case 'promoStatus':
      return record.promoJoined
    case 'promoActivity':
      return record.promoName
    case 'promoStock':
      return record.promoStock
    case 'rating':
      return record.rating
    case 'reviewCount':
      return record.reviewCount
    case 'ratingDistribution':
      return record.pointsReview
    case 'brandCert':
      return record.brandCert
    default:
      return ''
  }
}

function rowToCells(row: EnrichedCrawlRow, fields: AutoCrawlFieldDef[]): string[] {
  return fields.map((f) => {
    if (BASIC_FIELD_KEYS.has(f.key)) return basicCell(row.record, f.key)
    const fi = FOLLOW_KEYS.indexOf(f.key as (typeof FOLLOW_KEYS)[number])
    if (fi >= 0) return row.follow?.[fi] || ''
    const si = SALES_FIELD_INDEX[f.key]
    if (si !== undefined) return row.sales?.[si] || ''
    const wi = WEIGHT_KEYS.indexOf(f.key as (typeof WEIGHT_KEYS)[number])
    if (wi >= 0) return row.weight?.[wi] || ''
    return ''
  })
}

function detectPriceUnit(records: CrawlProductRecord[]): string {
  for (const r of records) {
    const name = priceUnitDisplayName(r.price)
    if (name) return name
  }
  return ''
}

function buildExportCacheKey(fields: AutoCrawlFieldDef[], productCount: number): string {
  return fields.map((f) => f.key).join(',') + '|' + productCount
}

/** 按自动爬取偏好导出 Excel（对齐旧版 #bcs-crawl-export-btn） */
export async function exportCrawlToExcel(): Promise<void> {
  const sessionId = getOperationSessionId()
  const sessionActive = () => isOperationSessionActive(sessionId)

  const products = getCrawlProducts()
  if (!products.length) {
    showToast('当前没有爬取数据不可导出，请先启动爬取！', 3000)
    return
  }

  addCrawlLog('读取导出字段配置...', 'info')

  try {
    const config = await fetchAutoCrawlPreference()
    if (!sessionActive()) return

    const fields = getCheckedExportFields(config)
    if (!fields.length) {
      showToast('请先在「偏好设置 → 自动爬取设置」中勾选导出字段', 4000)
      return
    }

    const cacheKey = buildExportCacheKey(fields, products.length)
    const exportImageColIndex = resolveExportImageColIndex(fields)
    const cached = getCrawlExportCache()

    if (cached && cached.key === cacheKey) {
      setExporting(true)
      addCrawlLog('使用缓存数据直接导出...', 'info')
      try {
        if (!sessionActive()) return

        const tagSheets = cached.rowSkus.length && cached.matchPayloadBySku
          ? buildSelectionTagSheetsForExport(
              cached.data,
              config,
              cached.rowSkus,
              cached.matchPayloadBySku as Record<string, ReturnType<typeof buildExportMatchPayloadFromEnriched>>,
            )
          : []
        if (tagSheets.length) {
          addCrawlLog(`已按选品标签生成 ${tagSheets.length} 个工作表`, 'info')
        }
        if (!sessionActive()) return

        const workbook = new ExcelJS.Workbook()
        await writeCrawlWorkbookToFile(
          workbook,
          cached.data,
          cached.exportImageColIndex >= 0 ? cached.exportImageColIndex : exportImageColIndex,
          tagSheets,
        )
        if (!sessionActive()) return

        addCrawlLog('导出完成，结果已写入目标文件。', 'success')
        setCrawlStatus('export_done')
        showToast('Excel 导出成功', 3000)
      } catch (e) {
        if (!sessionActive()) return
        console.error('[mjgd][crawl] 缓存导出失败', e)
        addCrawlLog('导出失败，请重试', 'stop')
        setCrawlStatus('stopped')
        showToast('导出失败', 3000)
      } finally {
        if (sessionActive()) {
          setExporting(false)
        }
      }
      return
    }

    if (exportNeedsCookie(config)) {
      setCookieChecking(true)
      try {
        const outcome = await inspectShopCookieAvailability({ dedupe: false })
        if (!sessionActive()) return
        if (!outcome.ok) {
          showMessage({
            type: 'error',
            message: getShopCookieUnavailableMessage(outcome.reason),
            duration: 5000,
          })
          addCrawlLog('Cookie 检测失败，已阻断导出', 'stop')
          return
        }
        addCrawlLog(`Cookie 检测通过，${outcome.count} 个店铺有效`, 'success')
      } finally {
        if (sessionActive()) {
          setCookieChecking(false)
        }
      }
    }

    if (!sessionActive()) return

    setExporting(true)
    addCrawlLog('导出流程已启动，正在根据配置组装数据。', 'info')

    await ensureExchangeRates()
    if (!sessionActive()) return

    const unitName = detectPriceUnit(products)
    const headers = fields.map((f) => headerLabel(f, unitName))

    addCrawlLog('正在组装导出数据...', 'info')
    setExportProgress(0, products.length)

    if (
      needsAsyncEnrichment(config) &&
      String(config.exportSpeedMode || '') === 'fast'
    ) {
      addCrawlLog(
        `当前为快速模式（并发 ${getExportConcurrency(config)}），请注意可能触发限流。`,
        'info',
      )
    }

    const enriched = await enrichCrawlProductsForExport(
      products,
      config,
      (done, total) => {
        if (!sessionActive()) return
        setExportProgress(done, total)
      },
      () => !sessionActive(),
    )

    if (!sessionActive()) return

    const mainRows: string[][] = [headers]
    const rowSkus: string[] = []
    const matchPayloadBySku: Record<string, ReturnType<typeof buildExportMatchPayloadFromEnriched>> = {}

    enriched.forEach((row) => {
      mainRows.push(rowToCells(row, fields))
      rowSkus.push(row.record.sku)
      matchPayloadBySku[row.record.sku] = buildExportMatchPayloadFromEnriched(row)
    })

    // 对齐旧版：data.length <= 1 表示除表头外无数据行
    if (mainRows.length <= 1) {
      showMessage({ type: 'error', message: '导出数据为空！', duration: 4000 })
      addCrawlLog('导出数据为空', 'stop')
      setCrawlStatus('stopped')
      return
    }

    const tagSheets = buildSelectionTagSheetsForExport(mainRows, config, rowSkus, matchPayloadBySku)

    if (tagSheets.length) {
      addCrawlLog(`已按选品标签生成 ${tagSheets.length} 个工作表`, 'info')
    }

    if (!sessionActive()) return

    setCrawlExportCache({
      key: cacheKey,
      data: mainRows,
      exportImageColIndex,
      rowSkus,
      matchPayloadBySku,
    })

    const workbook = new ExcelJS.Workbook()
    await writeCrawlWorkbookToFile(workbook, mainRows, exportImageColIndex, tagSheets)

    if (!sessionActive()) return

    addCrawlLog('导出完成，结果已写入目标文件。', 'success')
    setCrawlStatus('export_done')
    showToast('Excel 导出成功', 3000)
  } catch (e) {
    if (!sessionActive()) return
    console.error('[mjgd][crawl] 导出失败', e)
    addCrawlLog('导出失败，请重试', 'stop')
    setCrawlStatus('stopped')
    showToast('导出失败', 3000)
  } finally {
    if (sessionActive()) {
      setExporting(false)
    }
  }
}
