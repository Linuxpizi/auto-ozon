/** 生成短 UUID（8位 hex） */
export function generateShortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}
