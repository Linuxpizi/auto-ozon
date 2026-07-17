/**
 * AI 自动选品 — 关键词标题匹配
 *
 * 【背景】旧逻辑为单字匹配（标题含关键词任意一字即命中），误召回高；
 * 纯整词匹配又易漏掉「纱裙」「连衣裙」等标题变体。本模块用分层策略兼顾精度与召回。
 *
 * 【匹配优先级】keywordMatchesTitle / anyKeywordMatchesTitle（多关键词 OR）
 *   L1a  归一化后整串包含（normalizeMatchText）
 *   L1b  紧凑化后整串包含（去空格/·/-，如「黑色 纱裙」→「黑色纱裙」）
 *   L2   后缀 n-gram（仅末尾连续子串，防「手机壳」误命中「手机数据线」）
 *   L3   词根省略（2 字词且末字为子/儿/款/式/型/类时，匹配首字，如「裙子」→「裙」）
 *
 * 【归一化】NFKC、去零宽字符、合并空白、服饰高频简繁对照（紗→纱 等）
 *
 * 【关联改动】
 *   listPageScanner.ts — extractOfferTitle 取 title/aria-label 与 textContent 最长标题；
 *                        passesFilter 调用 anyKeywordMatchesTitle；类目搜索页跳过类目标题校验
 *   AiAutoSelectModal.vue — addKeyword 支持按 ,，、;； 拆分为多个关键词标签
 *
 * 【对外 API】keywordMatchesTitle、anyKeywordMatchesTitle、categoryMatchesTitle、
 *            normalizeMatchText、compactMatchText、extractCategoryCoreSegment
 */

/** 服饰等类目高频简繁对照，避免「紗」与「纱」等导致 L1 漏匹配 */
const TRAD_TO_SIMP_MAP: Record<string, string> = {
  紗: '纱',
  髮: '发',
  裝: '装',
  褲: '裤',
  襪: '袜',
  顏: '颜',
  質: '质',
}

/** 2 字关键词末字可省略时，用首字（词根）做 L3 兜底匹配 */
const OMISSIBLE_SUFFIX_CHARS = new Set(['子', '儿', '款', '式', '型', '类'])

/** 匹配前归一化：NFKC、去零宽、合并空白、简繁高频字 */
export function normalizeMatchText(text: string): string {
  let normalized = text.normalize('NFKC')
  normalized = normalized.replace(/[\u200b-\u200d\ufeff]/g, '')
  normalized = normalized.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  let result = ''
  for (const ch of normalized) {
    result += TRAD_TO_SIMP_MAP[ch] ?? ch
  }
  return result.toLowerCase()
}

/** 紧凑化：去除空白与常见分隔符，用于 L1b 整串匹配 */
export function compactMatchText(text: string): string {
  return normalizeMatchText(text).replace(/[\s\-·/]/g, '')
}

/** 将文本拆为 Unicode 字符（支持中文等多字节字符） */
function toChars(text: string): string[] {
  return [...text].filter((ch) => ch.trim() !== '')
}

/** 是否为纯 ASCII 字母数字词（英文型号等） */
function isLatinToken(text: string): boolean {
  return /^[a-z0-9]+$/i.test(text)
}

/**
 * 计算 L2 后缀 n-gram 最短长度
 * 短词要求整词；长中文词用比例下限；英文部分匹配最短 3 字符，避免 US/SB 等噪声
 */
function resolveMinNgramLen(charCount: number, isLatin: boolean): number {
  if (charCount <= 0) return 0
  if (charCount === 1) return 1
  if (charCount === 2) return 2
  if (isLatin) return Math.min(charCount, 3)
  if (charCount <= 4) return 2
  return Math.max(2, Math.ceil(charCount * 0.4))
}

/** 取关键词末尾 n 个连续字符作为后缀子串 */
function getSuffixNgram(chars: string[], n: number): string {
  if (n <= 0 || n > chars.length) return ''
  return chars.slice(chars.length - n).join('')
}

/** 英文词简易边界检测，降低 bus 误命中 usb 等情况 */
function latinSubstringWithBoundary(title: string, fragment: string): boolean {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const boundaryRe = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i')
  return boundaryRe.test(title)
}

/** L3：词尾可省略时匹配词根（如「裙子」→ 标题含「裙」） */
function matchesOmissibleRoot(chars: string[], title: string): boolean {
  if (chars.length !== 2) return false
  const suffixChar = chars[1]
  if (!OMISSIBLE_SUFFIX_CHARS.has(suffixChar)) return false
  return title.includes(chars[0])
}

/**
 * 分层匹配：L1 整串 → L1b 紧凑整串 → L2 后缀 n-gram → L3 词根省略
 */
export function keywordMatchesTitle(keyword: string, title: string): boolean {
  const kw = normalizeMatchText(keyword)
  const t = normalizeMatchText(title)
  if (!kw) return false

  // L1a：归一化后整串包含
  if (t.includes(kw)) return true

  // L1b：紧凑化后整串包含（「黑色 纱裙」→「黑色纱裙」）
  const compactKw = compactMatchText(keyword)
  const compactTitle = compactMatchText(title)
  if (compactKw && compactTitle.includes(compactKw)) return true

  const chars = toChars(kw)
  if (chars.length === 0) return false

  const latin = isLatinToken(kw)
  const minN = resolveMinNgramLen(chars.length, latin)
  const suffixLen = Math.min(minN, chars.length)
  const suffix = getSuffixNgram(chars, suffixLen)

  // L2：后缀连续子串
  if (suffix) {
    if (latin && suffixLen >= 3) {
      if (latinSubstringWithBoundary(t, suffix)) return true
    } else if (t.includes(suffix)) {
      return true
    }
  }

  // L3：词尾可省略的词根匹配（「裙子」匹配「纱裙」「连衣裙」）
  return matchesOmissibleRoot(chars, t)
}

/** 严格匹配：仅 L1a + L1b 整串包含，不做后缀 n-gram 与词根省略 */
export function strictKeywordMatchesTitle(keyword: string, title: string): boolean {
  const kw = normalizeMatchText(keyword)
  const t = normalizeMatchText(title)
  if (!kw) return false

  if (t.includes(kw)) return true

  const compactKw = compactMatchText(keyword)
  const compactTitle = compactMatchText(title)
  return Boolean(compactKw && compactTitle.includes(compactKw))
}

/** 多个关键词为或关系 */
export function anyKeywordMatchesTitle(keywords: string[], title: string): boolean {
  return keywords.some((kw) => keywordMatchesTitle(kw, title))
}

/** 按匹配模式对多个关键词做或关系匹配 */
export function anyKeywordMatchesTitleWithMode(
  keywords: string[],
  title: string,
  mode: 'fuzzy' | 'strict' = 'strict',
): boolean {
  if (mode === 'strict') {
    return keywords.some((kw) => strictKeywordMatchesTitle(kw, title))
  }
  return anyKeywordMatchesTitle(keywords, title)
}

/** 从类目路径中取最后一段核心词（如「手机配件 > 手机壳」→「手机壳」） */
export function extractCategoryCoreSegment(category: string): string {
  const parts = category
    .split(/[>\/\-、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts[parts.length - 1] || category.trim()
}

/**
 * 类目标题匹配：对核心片段做分层匹配
 * @deprecated 选品流程不再对商品标题做类目名校验，保留仅供兼容
 */
export function categoryMatchesTitle(category: string, title: string): boolean {
  const core = extractCategoryCoreSegment(category)
  if (!core) return false
  return keywordMatchesTitle(core, title)
}
