/** 货号生成与前缀应用（对齐旧版 bcsGenerateGoodsNo / applyGoodsNoPrefixToSkuRows） */

const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SUFFIX_LEN = 4

function randomSuffix(): string {
  let s = ''
  for (let i = 0; i < SUFFIX_LEN; i += 1) {
    s += SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)]
  }
  return s
}

/** 旧版：每行默认货号 = `<sku>-<4位随机>` */
export function generateGoodsNo(sku: string): string {
  if (!sku) return ''
  return `${sku}-${randomSuffix()}`
}

/**
 * 旧版前缀按钮：若当前货号已有 `-xxxx` 4 位字母数字尾，保留该尾；否则生成新尾。
 * 返回 `<prefix>-<suffix>`。
 */
export function applyPrefixToGoodsNo(currentGoodsNo: string, prefix: string): string {
  if (!prefix) return currentGoodsNo
  const m = String(currentGoodsNo || '').match(/-([A-Za-z0-9]{4})$/)
  const suffix = m ? m[1] : randomSuffix()
  return `${prefix}-${suffix}`
}
