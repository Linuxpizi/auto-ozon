export type OzonWidgetStateValue = string | Record<string, unknown> | unknown[] | null

/**
 * Ozon 的 widgetStates 在不同入口中可能是对象、JSON 字符串，或被重复 JSON 编码的
 * 字符串。只在值仍为字符串时继续解码，最多三层，避免畸形响应造成无限循环。
 */
export function decodeOzonWidgetState(raw: OzonWidgetStateValue): unknown {
  let value: unknown = raw
  for (let depth = 0; depth < 3 && typeof value === 'string'; depth += 1) {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

/**
 * 从 widgetStates 中寻找数组字段。返回 null 表示响应中无法确认该 widget；返回 [] 表示
 * 已找到目标 widget，且服务端明确返回空数组。这一区别用于避免把请求/解析失败伪造成 0。
 */
export function pickWidgetArray(
  widgetStates: Record<string, OzonWidgetStateValue> | undefined,
  property: string,
  preferredKeyPrefix?: string,
): unknown[] | null {
  if (!widgetStates) return null
  const keys = Object.keys(widgetStates)
  const preferred = preferredKeyPrefix
    ? keys.filter((key) => key.startsWith(preferredKeyPrefix))
    : []
  const ordered = [...preferred, ...keys.filter((key) => !preferred.includes(key))]
  let found = false

  for (const key of ordered) {
    const state = decodeOzonWidgetState(widgetStates[key])
    if (!state || typeof state !== 'object' || Array.isArray(state)) continue
    const value = (state as Record<string, unknown>)[property]
    if (!Array.isArray(value)) continue
    found = true
    if (value.length) return value
  }
  return found ? [] : null
}