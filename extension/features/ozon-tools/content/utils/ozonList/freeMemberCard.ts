/** 兼容旧调用方：独立本地版不再把任何业务码解释为会员/套餐限制。 */
export function isMemberLimitError(code?: number): boolean {
  void code
  return false
}

export function handleSkuLoadRestriction(card: HTMLElement, error: unknown) {
  void card
  void error
  return false
}
