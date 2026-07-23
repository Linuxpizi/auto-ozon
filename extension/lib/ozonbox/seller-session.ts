export const OZON_SELLER_ORIGIN = 'https://seller.ozon.ru'
export const OZON_SELLER_DASHBOARD_URL = `${OZON_SELLER_ORIGIN}/app/dashboard/main`
export const OZON_COMPANY_ID_COOKIE_NAME = 'sc_company_id'
export const OZON_COMPANY_ID_COOKIE_MISSING_MESSAGE = `未找到 ${OZON_COMPANY_ID_COOKIE_NAME} Cookie，请先登录 Ozon 卖家后台`

export interface SellerCompanyCookie {
  value: string
}

export function requireOzonCompanyId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) {
    throw new Error('Ozon company ID 必须是真实的正整数')
  }
  return value.trim()
}

export function companyIdFromSellerCookie(cookie: SellerCompanyCookie | null | undefined): string {
  if (!cookie) {
    throw new Error(OZON_COMPANY_ID_COOKIE_MISSING_MESSAGE)
  }
  return requireOzonCompanyId(cookie.value)
}