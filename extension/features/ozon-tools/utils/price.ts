/**
 * 价格四舍五入保留两位小数
 * 使用数学方法解决浮点数精度问题
 * 
 * @param price 价格值（可以是数字、字符串、null、undefined）
 * @param decimals 保留的小数位数，默认2位
 * @returns 四舍五入后的数字
 */
export function roundPrice(price: number | string | null | undefined, decimals: number = 2): number {
  if (price === null || price === undefined || price === '') {
    return 0
  }

  const num = typeof price === 'string' ? parseFloat(price) : price

  if (isNaN(num)) {
    return 0
  }

  const pow = Math.pow(10, decimals)
  return Math.round((num + Number.EPSILON) * pow) / pow
}
