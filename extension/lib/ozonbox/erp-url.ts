export function validatedErpBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (!normalized) throw new Error('请先配置 ERP Web 地址')
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error('ERP Web 地址格式无效')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('ERP Web 地址只支持 http/https')
  if (url.username || url.password || url.search || url.hash) throw new Error('ERP Web 地址不能包含凭据、查询参数或锚点')
  return url.toString().replace(/\/$/, '')
}