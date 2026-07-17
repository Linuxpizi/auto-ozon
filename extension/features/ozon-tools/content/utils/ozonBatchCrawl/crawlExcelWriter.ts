import type ExcelJS from 'exceljs'
import type { AutoCrawlFieldDef } from './autoCrawlFields'

const IMG_SIZE = 160
const COLUMN_WIDTH_THIRD_COLUMN = 20
const COLUMN_WIDTH_FIRST_COLUMN = 12
const COLUMN_WIDTH_FORMAT_COLUMN = 22
const COLUMN_WIDTH_PRICE_CNY_AND_RUB = 18
const COLUMN_WIDTH_SIXTH_PLUS = 13
const COLUMN_WIDTH_OTHERS = 40

export function resolveExportImageColIndex(fields: AutoCrawlFieldDef[]): number {
  if (!fields.length) return -1
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].key === 'productImage') return i
  }
  return -1
}

/** 对齐旧版 writeExportSheetData */
export function writeExportSheetData(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  sheetData: string[][],
  exportImageColIndex: number,
): void {
  const hasImageColumn = exportImageColIndex >= 0

  const headerRow = worksheet.addRow(sheetData[0])
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 14 }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  const headerLabels = sheetData[0] || []
  worksheet.columns = headerLabels.map((label, colIndex) => {
    let width = COLUMN_WIDTH_OTHERS
    if (colIndex === exportImageColIndex && hasImageColumn) {
      width = COLUMN_WIDTH_THIRD_COLUMN
    } else if (label === '上品格式') {
      width = COLUMN_WIDTH_FORMAT_COLUMN
    } else if (label === 'SKU') {
      width = COLUMN_WIDTH_FIRST_COLUMN
    } else if (
      /^价格（.+）$/.test(String(label)) ||
      label === '价格' ||
      label === '原价'
    ) {
      width = COLUMN_WIDTH_PRICE_CNY_AND_RUB
    } else if (
      label === '折扣' ||
      label === '促销活动状态' ||
      label === '促销活动' ||
      label === '活动库存'
    ) {
      width = COLUMN_WIDTH_SIXTH_PLUS
    }
    return {
      width,
      style: { alignment: { vertical: 'middle', horizontal: 'center' } },
    }
  })

  for (let dataRowIdx = 1; dataRowIdx < sheetData.length; dataRowIdx++) {
    const rowData = sheetData[dataRowIdx]
    const excelRow = worksheet.addRow([])

    rowData.forEach((cellValue, colIndex) => {
      if (hasImageColumn && colIndex === exportImageColIndex) return
      const cell = excelRow.getCell(colIndex + 1)
      cell.value = cellValue
      cell.alignment = { vertical: 'middle', wrapText: true }
    })

    if (hasImageColumn) {
      excelRow.height = IMG_SIZE / 1.33
      const base64Image = rowData[exportImageColIndex]
      if (base64Image && base64Image.startsWith('data:image')) {
        try {
          const [header, body] = base64Image.split(';base64,')
          const rawExtension = header?.split('/')[1]?.toLowerCase()
          const extension: 'png' | 'jpeg' | 'gif' =
            rawExtension === 'jpg' || rawExtension === 'jpeg'
              ? 'jpeg'
              : rawExtension === 'gif'
                ? 'gif'
                : 'png'

          const imageId = workbook.addImage({
            base64: body || '',
            extension,
          })

          worksheet.addImage(imageId, {
            tl: { col: exportImageColIndex, row: dataRowIdx },
            ext: { width: 150, height: 150 },
            editAs: 'oneCell',
          })

          excelRow.getCell(exportImageColIndex + 1).note =
            '商品图片（双击查看完整尺寸）数据来源于 Auto Ozon 本地采集工具！'
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error)
          excelRow.getCell(exportImageColIndex + 1).value = `[图片错误: ${msg}]`
        }
      }
    }
  }
}

export function buildCrawlExportFileName(): string {
  const currentDate = new Date()
  const formattedDate =
    currentDate.toISOString().slice(0, 10).replace(/-/g, '') +
    '_' +
    currentDate.toTimeString().slice(0, 8).replace(/[:.]/g, '')
  return `AutoOzon采集数据_${formattedDate}.xlsx`
}

export interface CrawlTagSheetData {
  name?: string
  data: string[][]
}

/** 对齐旧版 exportToExcel */
export async function writeCrawlWorkbookToFile(
  workbook: ExcelJS.Workbook,
  mainRows: string[][],
  exportImageColIndex: number,
  tagSheets: CrawlTagSheetData[] = [],
): Promise<void> {
  const mainWorksheet = workbook.addWorksheet('商品信息')
  writeExportSheetData(workbook, mainWorksheet, mainRows, exportImageColIndex)

  tagSheets.forEach((tagSheet) => {
    if (!tagSheet?.data?.length) return
    const ws = workbook.addWorksheet(tagSheet.name || '选品标签')
    writeExportSheetData(workbook, ws, tagSheet.data, exportImageColIndex)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = buildCrawlExportFileName()
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 100)
}
