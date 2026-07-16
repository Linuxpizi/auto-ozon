import type { ProductVariant, ScrapedProduct } from '@/lib/utils/types'

type SpecRecord = { weight_g: number; depth_mm: number; height_mm: number; width_mm: number; [key: string]: any }
type SpecValue = { name: string; value: string }

const MAX_SCAN_DEPTH = 12

type PddSkuLike = Record<string, any>

function text(selector: string, parent: Element | Document = document): string {
  return parent.querySelector(selector)?.textContent?.trim() || ''
}

function uniq<T>(items: T[]): T[] {
  return [...new Set(items.filter(Boolean))]
}

function clean(input: unknown): string {
  return String(input ?? '').replace(/\s+/g, ' ').trim()
}


function pickString(obj: any, keys: string[]): string {
  if (!obj || typeof obj !== 'object') return ''
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' || typeof value === 'number') {
      const textValue = clean(value)
      if (textValue) return textValue
    }
  }
  return ''
}

function pickNumber(obj: any, keys: string[]): number {
  if (!obj || typeof obj !== 'object') return 0
  for (const key of keys) {
    const parsed = parsePrice(obj[key])
    if (parsed > 0) return parsed
  }
  return 0
}

function normalizeImageUrl(url: string): string {
  if (!url) return ''
  let u = url.trim()
  if (u.startsWith('//')) u = `https:${u}`
  if (u.startsWith('/')) u = `${location.origin}${u}`
  return u.replace(/&amp;/g, '&')
}

function parsePrice(textOrNumber: unknown): number {
  if (typeof textOrNumber === 'number') {
    if (!Number.isFinite(textOrNumber) || textOrNumber <= 0) return 0
    // PDD 接口价格大多以分为单位；DOM 抽到的小数价格保持原样。
    return textOrNumber > 10000 ? Math.round(textOrNumber / 100) / 100 : textOrNumber
  }
  const raw = clean(textOrNumber).replace(/[,，]/g, '')
  const match = raw.match(/(?:¥|￥)?\s*(\d+(?:\.\d+)?)/)
  return match ? Math.round(parseFloat(match[1]) * 100) / 100 : 0
}

function parseLengthToMm(raw: string): number {
  const value = clean(raw)
  const match = value.match(/(\d+(?:\.\d+)?)\s*(毫米|mm|厘米|cm|米|m)?/i)
  if (!match) return 0
  const num = parseFloat(match[1])
  const unit = (match[2] || '').toLowerCase()
  if (/厘米|cm/.test(unit)) return Math.round(num * 10)
  if (/^m$|米/.test(unit)) return Math.round(num * 1000)
  return Math.round(num)
}

function parseWeightToGrams(raw: string): number {
  const value = clean(raw)
  const match = value.match(/(\d+(?:\.\d+)?)\s*(千克|公斤|kg|克|g)?/i)
  if (!match) return 0
  const num = parseFloat(match[1])
  const unit = (match[2] || '').toLowerCase()
  const single = /千克|公斤|kg/.test(unit) ? num * 1000 : /克|g/.test(unit) ? num : num <= 50 ? num * 1000 : num
  // SKU 文案常见「500g*6瓶 / 500g×2 / 500g2瓶」，上传时物理重量优先回填整组净含量。
  const countMatch = value.match(/\d+(?:\.\d+)?\s*(?:千克|公斤|kg|克|g)\s*(?:[x×*]\s*)?(\d{1,3})\s*(?:瓶|袋|盒|罐|支|包|件|个)/i)
  const count = countMatch ? parseInt(countMatch[1], 10) : 1
  return Math.round(single * (Number.isFinite(count) && count > 0 ? count : 1))
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isVisible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  const style = getComputedStyle(el)
  const rect = el.getBoundingClientRect()
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0
}

function isActionText(value: string): boolean {
  return /^(确定|完成|取消|关闭|返回|立即购买|发起拼单|单独购买|加入购物车|客服|收藏|店铺|首页|分享|更多|已选|请选择|数量|库存|运费|配送|领券|优惠|保障)$/.test(clean(value))
}

function normalizeOptionText(value: string): string {
  return clean(value)
    .replace(/^(已选|请选择|选择)\s*/g, '')
    .replace(/\s*(库存\d+件?|剩余\d+件?|有货|无货|¥\s*\d+(?:\.\d+)?).*$/i, '')
    .replace(/[，,]\s*$/, '')
}

function visibleTextTokens(root: Element): string[] {
  const tokens: string[] = []
  root.querySelectorAll('*').forEach((el) => {
    if (!isVisible(el)) return
    const ownText = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => clean(node.textContent))
      .filter(Boolean)
      .join(' ')
    const value = normalizeOptionText(ownText || (el.children.length ? '' : clean(el.textContent)))
    if (!value || value.length > 80 || isActionText(value)) return
    tokens.push(value)
  })
  return uniq(tokens)
}

function collectSkuPanelRoots(): Element[] {
  const candidates = Array.from(document.querySelectorAll('[role="dialog"], [class*="sku"], [class*="Sku"], [class*="spec"], [class*="Spec"], [class*="popup"], [class*="Popup"], [class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"]'))
    .filter(isVisible)
    .filter((el) => {
      const value = clean(el.textContent)
      return value.length >= 4 && value.length <= 6000 && /(颜色|色号|尺码|尺寸|规格|款式|型号|容量|净含量|重量|已选|请选择|确定|立即购买|发起拼单)/.test(value)
    })

  // 有些 PDD 页面 class 被哈希化，弹层没有语义 class；回退到 fixed/sticky 且包含 SKU 关键词的容器。
  if (!candidates.length) {
    document.querySelectorAll('body *').forEach((el) => {
      if (!isVisible(el)) return
      const style = getComputedStyle(el)
      if (!/(fixed|sticky)/.test(style.position)) return
      const value = clean(el.textContent)
      if (value.length >= 4 && value.length <= 6000 && /(颜色|尺码|尺寸|规格|容量|净含量|已选|请选择|确定)/.test(value)) candidates.push(el)
    })
  }

  return uniq(candidates).sort((a, b) => clean(b.textContent).length - clean(a.textContent).length).slice(0, 5)
}

async function ensureSkuPanelOpen(): Promise<void> {
  if (collectSkuPanelRoots().length) return
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'))
    .filter(isVisible)
    .map((el) => ({ el, value: clean(el.textContent), rect: el.getBoundingClientRect() }))
    .filter(({ value, rect }) => value.length > 0 && value.length <= 30 && rect.width > 20 && rect.height > 16)

  const preferred = buttons.find(({ value }) => /(请选择|选择规格|已选|规格|容量|颜色|尺码)/.test(value))
    || buttons.find(({ value }) => /(发起拼单|立即购买|单独购买|购买)/.test(value))
  if (!preferred) return
  preferred.el.click()
  await delay(700)
}

function parseSkuGroupsFromText(tokens: string[]): Array<{ name: string; values: string[] }> {
  const labelPattern = /^(颜色|色号|尺码|尺寸|规格|款式|型号|容量|净含量|重量|毛重|净重|香型|口味|版本|套餐)\s*[:：]?$/
  const groups: Array<{ name: string; values: string[] }> = []
  let current: { name: string; values: string[] } | null = null

  const commit = () => {
    if (current?.values.length) groups.push({ name: current.name, values: uniq(current.values).slice(0, 80) })
  }

  for (const rawToken of tokens) {
    const token = normalizeOptionText(rawToken)
    if (!token || isActionText(token)) continue
    const colon = token.match(/^(颜色|色号|尺码|尺寸|规格|款式|型号|容量|净含量|重量|毛重|净重|香型|口味|版本|套餐)\s*[:：]\s*(.+)$/)
    if (colon) {
      commit()
      current = { name: colon[1], values: [] }
      const values = colon[2].split(/[、/｜|]/).map(normalizeOptionText).filter(Boolean)
      current.values.push(...values)
      continue
    }
    const label = token.match(labelPattern)
    if (label) {
      commit()
      current = { name: label[1], values: [] }
      continue
    }
    if (current && token.length <= 80 && !/(价格|优惠|数量|库存|配送|服务|参数|评价|详情|推荐)/.test(token)) {
      current.values.push(token)
    }
  }
  commit()
  return groups.filter((group) => group.values.length)
}

function extractDomSkuGroups(): Array<{ name: string; values: string[] }> {
  const groups: Array<{ name: string; values: string[] }> = []
  for (const root of collectSkuPanelRoots()) {
    groups.push(...parseSkuGroupsFromText(visibleTextTokens(root)))
  }

  // 兜底：从按钮/选项节点中识别「500g*6瓶」这类没有显式 label 的 PDD 容量规格。
  const optionTexts = uniq(Array.from(document.querySelectorAll('button, [role="button"], li, [class*="item"], [class*="option"], [class*="sku"], [class*="spec"]'))
    .filter(isVisible)
    .map((el) => normalizeOptionText(clean(el.textContent)))
    .filter((value) => value.length > 0 && value.length <= 80 && !isActionText(value)))
  const capacityOptions = optionTexts.filter((value) => /(\d+(?:\.\d+)?\s*(?:g|克|kg|千克|公斤|ml|毫升|l|升))(?:\s*[x×*]?\s*\d+\s*(?:瓶|袋|盒|罐|支|包|件|个))?/i.test(value))
  if (capacityOptions.length && !groups.some((group) => /容量|净含量|规格|重量/.test(group.name))) {
    groups.push({ name: '容量', values: capacityOptions.slice(0, 80) })
  }

  const merged = new Map<string, string[]>()
  for (const group of groups) {
    const key = group.name
    merged.set(key, uniq([...(merged.get(key) || []), ...group.values.map(normalizeOptionText).filter(Boolean)]))
  }
  return Array.from(merged, ([name, values]) => ({ name, values: values.slice(0, 80) }))
}

function inferCategoryFromText(value: string): string {
  const textValue = clean(value)
  const rules: Array<[RegExp, string]> = [
    [/洗衣液|洗衣凝珠|洗衣粉|柔顺剂|衣物除菌/i, '家清日化 > 衣物清洁 > 洗衣液/凝珠'],
    [/洗洁精|油污净|厨房清洁|洁厕|地板清洁|消毒液/i, '家清日化 > 家庭清洁 > 清洁剂'],
    [/纸巾|抽纸|卷纸|湿巾|卫生纸/i, '家清日化 > 纸品湿巾'],
    [/牙膏|牙刷|漱口水|洗发水|沐浴露|护发素/i, '个护健康 > 身体护理/口腔护理'],
    [/手机壳|数据线|充电器|耳机|蓝牙|充电宝/i, '手机数码 > 手机配件'],
    [/连衣裙|女装|上衣|裤子|衬衫|T恤|外套|毛衣/i, '服饰鞋包 > 女装/服饰'],
    [/男装|夹克|卫衣|西裤|牛仔裤/i, '服饰鞋包 > 男装'],
    [/童装|儿童|宝宝|婴儿|尿不湿|纸尿裤/i, '母婴玩具 > 婴童用品'],
    [/收纳|置物架|衣架|垃圾袋|保鲜袋|厨房用品/i, '家居生活 > 收纳/日用百货'],
    [/零食|饼干|坚果|饮料|茶叶|咖啡|牛奶/i, '食品饮料 > 休闲食品/饮品'],
  ]
  return rules.find(([pattern]) => pattern.test(textValue))?.[1] || ''
}

function walk(value: unknown, visit: (key: string, value: unknown, parent: any) => void, depth = 0, key = '', seen = new WeakSet<object>()) {
  if (depth > MAX_SCAN_DEPTH || value == null) return
  if (typeof value !== 'object') {
    visit(key, value, undefined)
    return
  }
  if (seen.has(value as object)) return
  seen.add(value as object)
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, depth + 1, String(index), seen))
    return
  }
  const obj = value as Record<string, unknown>
  for (const [k, v] of Object.entries(obj)) {
    visit(k, v, obj)
    walk(v, visit, depth + 1, k, seen)
  }
}

function safeParseJson(raw: string): unknown | null {
  try { return JSON.parse(raw) } catch { return null }
}

function unwrapStateNode(root: any): any[] {
  const nodes: any[] = []
  const candidates = [
    root,
    root?.store,
    root?.store?.initDataObj,
    root?.store?.initDataObj?.goods,
    root?.initDataObj,
    root?.initDataObj?.goods,
    root?.goods,
    root?.goodsInfo,
    root?.goodsData,
    root?.data,
    root?.props?.pageProps,
    root?.props?.pageProps?.data,
  ]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !nodes.includes(candidate)) nodes.push(candidate)
  }
  return nodes
}

function collectStructuredNodes(roots: unknown[]): any[] {
  const nodes: any[] = []
  for (const root of roots) {
    for (const node of unwrapStateNode(root as any)) {
      if (!nodes.includes(node)) nodes.push(node)
    }
  }
  return nodes
}

function collectGoodsNodes(roots: unknown[]): any[] {
  const nodes = collectStructuredNodes(roots)
  for (const root of roots) {
    walk(root, (key, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return
      const obj = value as any
      const looksLikeGoods = /goods|item|product/i.test(key) || pickString(obj, ['goods_id', 'goodsId', 'goodsID'])
      if (looksLikeGoods && (pickString(obj, ['goods_name', 'goodsName', 'name', 'title']) || obj.skus || obj.sku || obj.specs || obj.properties)) {
        if (!nodes.includes(obj)) nodes.push(obj)
      }
    })
  }
  return nodes
}

function firstArray(obj: any, keys: string[]): any[] {
  if (!obj || typeof obj !== 'object') return []
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key]
  }
  return []
}

function valueText(value: any): string {
  if (Array.isArray(value)) return uniq(value.map((item) => valueText(item)).filter(Boolean)).join(' / ')
  if (value && typeof value === 'object') return pickString(value, ['spec_value', 'specValue', 'value', 'val', 'vname', 'name', 'label', 'text', 'title'])
  return clean(value)
}

function pushNameValue(specs: SpecValue[], item: any) {
  if (!item || typeof item !== 'object') return
  const name = pickString(item, [
    'parent_name', 'parentName', 'parent_spec_name', 'parentSpecName',
    'spec_key', 'specKey', 'spec_key_name', 'specKeyName', 'pname',
    'attr_name', 'attrName', 'property_name', 'propertyName',
    'key', 'label', 'title', 'name', 'spec_name', 'specName',
  ])
  const rawValue = item.spec_value ?? item.specValue ?? item.spec_value_name ?? item.specValueName
    ?? item.attr_value ?? item.attrValue ?? item.property_value ?? item.propertyValue
    ?? item.value ?? item.val ?? item.vname ?? item.text ?? item.values ?? item.options ?? item.list
    ?? (name !== pickString(item, ['name']) ? item.name : '')
  const value = valueText(rawValue)
  if (name && value) {
    pushSpecValue(specs, name, value)
  }
}

function collectSkuObjects(roots: unknown[]): PddSkuLike[] {
  const skus: PddSkuLike[] = []
  const addSku = (item: any, source: string) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return
    const skuId = pickString(item, ['sku_id', 'skuId', 'skuID', 'sku_id_str', 'skuIdStr'])
    const hasSkuFields = skuId || item.specs || item.spec || item.specList || item.spec_list || item.properties || item.property || item.quantity || item.stock || item.thumb_url || item.thumbUrl || item.group_price || item.groupPrice
    if (!hasSkuFields || skus.includes(item)) return
    skus.push(item)
  }

  for (const node of collectGoodsNodes(roots)) {
    for (const item of firstArray(node, ['skus', 'sku', 'skuList', 'sku_list', 'skuInfo', 'sku_info'])) addSku(item, 'goods.skus')
  }
  for (const root of roots) {
    walk(root, (key, value) => {
      if (!Array.isArray(value) || !/(^|_)(skus?|skuList|sku_list|skuInfo|sku_info)$/i.test(key)) return
      value.forEach((item) => addSku(item, key))
    })
  }
  return skus.slice(0, 200)
}

function extractSkuSpecs(sku: PddSkuLike): SpecValue[] {
  const specsOut: SpecValue[] = []
  const specs = [sku.specs, sku.spec, sku.specList, sku.spec_list, sku.properties, sku.property, sku.attrs, sku.attrList, sku.attr_list].find(Array.isArray) || []
  for (const item of specs) pushNameValue(specsOut, item)
  for (const key of ['颜色', '色号', '尺码', '尺寸', '规格', '款式', '型号', '容量', '重量', '毛重', '净重', 'color', 'size', 'style', 'model', 'weight']) {
    if (sku[key]) pushSpecValue(specsOut, key, sku[key])
  }
  return specsOut
}

function inferSpecKey(name: string): string {
  if (/颜色|色号|color/i.test(name)) return 'color'
  if (/尺码|尺寸|码数|size/i.test(name)) return 'size'
  if (/款式|型号|规格|style|model/i.test(name)) return 'style'
  if (/容量|净含量|volume/i.test(name)) return 'capacity'
  if (/重量|毛重|净重|weight/i.test(name)) return 'weight'
  return clean(name)
}

function applyPhysicalSpec(spec: SpecRecord, values: SpecValue[]) {
  for (const item of values) {
    const name = item.name.toLowerCase()
    const value = item.value
    if (!spec.weight_g && /(重量|毛重|净重|净含量|容量|weight)/i.test(name)) spec.weight_g = parseWeightToGrams(value)
    if (!spec.color && /(颜色|色号|color)/i.test(name) && value.length <= 120) spec.color = value
    if (!spec.size && /(尺码|尺寸|规格|型号|容量|净含量|size)/i.test(name) && value.length <= 180) spec.size = value

    const dim = value.match(/(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*(毫米|mm|厘米|cm|米|m)?/i)
    if (dim && /(尺寸|长宽高|规格|包装|体积|dimension|size)/i.test(name)) {
      const unit = dim[4] || (/(厘米|cm)/i.test(`${name}${value}`) ? 'cm' : /(米|m)/i.test(`${name}${value}`) ? 'm' : 'mm')
      spec.depth_mm ||= parseLengthToMm(`${dim[1]}${unit}`)
      spec.width_mm ||= parseLengthToMm(`${dim[2]}${unit}`)
      spec.height_mm ||= parseLengthToMm(`${dim[3]}${unit}`)
    }
    if (!spec.depth_mm && /(长度|长|depth|length)/i.test(name)) spec.depth_mm = parseLengthToMm(value)
    if (!spec.width_mm && /(宽度|宽|width)/i.test(name)) spec.width_mm = parseLengthToMm(value)
    if (!spec.height_mm && /(高度|高|height)/i.test(name)) spec.height_mm = parseLengthToMm(value)
  }
}

function readBalancedObject(source: string, startIndex: number): string {
  let depth = 0
  let inString = false
  let quote = ''
  let escaped = false
  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) inString = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }
    if (ch === '{' || ch === '[') depth += 1
    if (ch === '}' || ch === ']') depth -= 1
    if (depth === 0) return source.slice(startIndex, i + 1)
  }
  return ''
}

function parseAssignedJson(scriptText: string, variablePattern: RegExp): unknown | null {
  const match = variablePattern.exec(scriptText)
  if (!match) return null
  const offset = match.index + match[0].length
  const start = scriptText.slice(offset).search(/[\[{]/)
  if (start < 0) return null
  const rawObject = readBalancedObject(scriptText, offset + start)
  return rawObject ? safeParseJson(rawObject) : null
}

function collectDataRoots(): unknown[] {
  const roots: unknown[] = []
  const w = window as any
  for (const key of ['rawData', '__INITIAL_STATE__', '__NEXT_DATA__', 'INIT_STATE', 'goodsData', 'goodsInfo', 'initialData', '__data__']) {
    if (w[key]) roots.push(w[key])
  }
  document.querySelectorAll('script[type="application/json"], script:not([src])').forEach((script) => {
    const raw = script.textContent || ''
    if (!raw || !/(goods|sku|spec|cat|mall|price|thumb|gallery|颜色|尺寸|重量)/i.test(raw)) return

    const directJson = raw.trim().startsWith('{') || raw.trim().startsWith('[') ? safeParseJson(raw.trim()) : null
    if (directJson) roots.push(directJson)

    const assignmentPatterns = [
      /window\.__INITIAL_STATE__\s*=/,
      /window\.rawData\s*=/,
      /rawData\s*=/,
      /window\.goodsData\s*=/,
      /window\.goodsInfo\s*=/,
      /__NEXT_DATA__\s*=/,
    ]
    for (const pattern of assignmentPatterns) {
      const parsed = parseAssignedJson(raw, pattern)
      if (parsed) roots.push(parsed)
    }
  })
  return roots
}

export function isPddDetailPage(): boolean {
  const hostOk = /(^|\.)(yangkeduo|pinduoduo)\.com$/.test(location.hostname)
  if (!hostOk) return false
  return /goods\.html/i.test(location.pathname) || /[?&](goods_id|goodsId)=\d+/.test(location.href)
}

export function isPddListPage(): boolean {
  const hostOk = /(^|\.)(yangkeduo|pinduoduo)\.com$/.test(location.hostname)
  if (!hostOk) return false
  return !isPddDetailPage() && /(search|mall|category|list|index)/i.test(location.href)
}

function extractProductId(): string {
  const params = new URLSearchParams(location.search)
  return params.get('goods_id') || params.get('goodsId') || location.href.match(/(?:goods_id|goodsId)[=/](\d+)/)?.[1] || ''
}

function extractTitle(roots: unknown[]): string {
  const fromMeta = document.querySelector('meta[property="og:title"], meta[name="title"]')?.getAttribute('content') || ''
  const candidates = [
    ...collectGoodsNodes(roots).map((node) => pickString(node, ['goods_name', 'goodsName', 'goodsNameTag', 'name', 'title', 'subject'])),
    text('h1'),
    text('[class*="goods-name"], [class*="goodsName"], [class*="title"]'),
    fromMeta,
    document.title.replace(/[-_].*拼多多.*/, ''),
  ]
  for (const root of roots) {
    walk(root, (key, value) => {
      if (typeof value === 'string' && /(goods_?name|goodsName|subject|title)/i.test(key) && value.length > 4) candidates.push(value)
    })
  }
  return clean(candidates.find((v) => clean(v).length > 4) || '')
}

function extractPrice(roots: unknown[]): number {
  for (const node of collectGoodsNodes(roots)) {
    const price = pickNumber(node, ['group_price', 'groupPrice', 'min_group_price', 'minGroupPrice', 'price', 'normal_price', 'normalPrice', 'market_price', 'marketPrice'])
    if (price > 0) {
      return price
    }
  }

  const domSelectors = ['[class*="price"]', '[class*="goods-price"]', '[class*="group-price"]']
  for (const selector of domSelectors) {
    const price = parsePrice(text(selector))
    if (price > 0) return price
  }

  const candidates: number[] = []
  for (const root of roots) {
    walk(root, (key, value) => {
      if (!/(price|amount|groupPrice|minPrice|maxPrice|normalPrice|marketPrice)/i.test(key)) return
      const parsed = parsePrice(value)
      if (parsed > 0 && parsed < 100000) candidates.push(parsed)
    })
  }
  return candidates.length ? Math.min(...candidates) : 0
}

function extractImages(roots: unknown[]): string[] {
  const urls: string[] = []
  for (const node of collectGoodsNodes(roots)) {
    const arrays = ['gallery', 'gallery_list', 'galleryList', 'thumb_url_list', 'thumbUrlList', 'image_list', 'imageList']
    for (const key of arrays) {
      if (Array.isArray(node[key])) node[key].forEach((item: any) => urls.push(normalizeImageUrl(valueText(item) || item?.url || item?.image_url || item?.imageUrl || item?.thumb_url || item?.thumbUrl || '')))
    }
    for (const key of ['thumb_url', 'thumbUrl', 'hd_thumb_url', 'hdThumbUrl', 'image_url', 'imageUrl']) urls.push(normalizeImageUrl(node[key] || ''))
  }
  for (const root of roots) {
    walk(root, (key, value) => {
      if (typeof value === 'string' && /(image|img|thumb|hdUrl|url|gallery|banner)/i.test(key) && /\.(jpg|jpeg|png|webp)|imageMogr|pinduoduo|yangkeduo/i.test(value)) {
        urls.push(normalizeImageUrl(value))
      }
    })
  }
  document.querySelectorAll('img').forEach((img) => {
    const el = img as HTMLImageElement
    urls.push(normalizeImageUrl(el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.src || ''))
  })
  return uniq(urls)
    .filter((u) => /^https?:/.test(u) && !/(avatar|logo|icon|captcha|qr)/i.test(u))
    .slice(0, 30)
}

function extractCategory(roots: unknown[]): string {
  for (const node of collectGoodsNodes(roots)) {
    const paths: string[][] = []
    for (const key of ['cat_list', 'catList', 'category_list', 'categoryList', 'opt_infos', 'optInfos']) {
      if (Array.isArray(node[key])) paths.push(node[key].map((item: any) => pickString(item, ['cat_name', 'catName', 'name', 'opt_name', 'optName', 'category_name', 'categoryName'])).filter(Boolean))
    }
    const direct = [
      pickString(node, ['cat_name', 'catName', 'category_name', 'categoryName', 'opt_name', 'optName']),
      pickString(node?.cat, ['cat_name', 'catName', 'name']),
      pickString(node?.category, ['category_name', 'categoryName', 'name']),
    ].filter(Boolean)
    const best = paths.find((path) => path.length)?.concat(direct.filter((item) => !paths.flat().includes(item))) || direct
    if (best.length) {
      const value = uniq(best).join(' > ')
      return value
    }
  }

  const crumbs = Array.from(document.querySelectorAll('[class*="breadcrumb"] a, [class*="crumb"] a, nav a'))
    .map((el) => clean(el.textContent))
    .filter((v) => v && v.length < 32)
  if (crumbs.length) return uniq(crumbs).join(' > ')

  const categories: string[] = []
  for (const root of roots) {
    walk(root, (key, value) => {
      if (typeof value === 'string' && /(cat_?name|category|categoryName|optName|opt_name|类目|分类)/i.test(key) && value.length <= 40) categories.push(value)
    })
  }
  if (categories.length) return uniq(categories.map(clean)).join(' > ')

  const keywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content') || ''
  const keywordCategory = clean(keywords.split(/[,，]/).find((v) => v.length < 24) || '')
  return keywordCategory || inferCategoryFromText([extractTitle(roots), keywords, document.title].join(' '))
}

function extractSeller(roots: unknown[]): { name: string; url: string } {
  const names: string[] = []
  for (const node of collectGoodsNodes(roots)) {
    const name = pickString(node, ['mall_name', 'mallName', 'store_name', 'storeName', 'shop_name', 'shopName']) || pickString(node?.mall, ['mall_name', 'mallName', 'name'])
    if (name) names.push(name)
  }
  for (const root of roots) {
    walk(root, (key, value) => {
      if (typeof value === 'string' && /(mallName|mall_name|storeName|shopName|店铺|商家)/i.test(key) && value.length <= 80) names.push(value)
    })
  }
  const domName = text('[class*="mall-name"], [class*="shop-name"], [class*="store-name"]')
  const mallLink = document.querySelector('a[href*="mall"]') as HTMLAnchorElement | null
  return { name: clean(domName || names[0] || ''), url: mallLink?.href || '' }
}

function pushSpecValue(specs: SpecValue[], name: string, value: unknown) {
  const n = clean(name).replace(/[：:]+$/, '')
  const v = clean(Array.isArray(value) ? value.join(' / ') : value)
  if (!n || !v || n === v || v.length > 300) return
  if (!specs.some((item) => item.name === n && item.value === v)) specs.push({ name: n, value: v })
}

function extractSpecValues(roots: unknown[]): SpecValue[] {
  const specs: SpecValue[] = []

  // 真实 PDD 详情页登录态/风控态下，SKU 常只在点击「发起拼单/选择规格」后的弹层 DOM 中出现。
  // 这里只提取 SKU/物理规格，结果写入 variants 与 specList，不再形成通用商品属性。
  for (const group of extractDomSkuGroups()) {
    pushSpecValue(specs, group.name, group.values.join(' / '))
  }

  // 优先读取 PDD 商品对象中的 SKU 规格。
  for (const node of collectGoodsNodes(roots)) {
    for (const key of ['specs', 'specList', 'spec_list', 'sku_specs', 'skuSpecs']) {
      if (Array.isArray(node[key])) node[key].forEach((item: any) => pushNameValue(specs, item))
    }
  }

  for (const sku of collectSkuObjects(roots)) {
    for (const item of extractSkuSpecs(sku)) pushSpecValue(specs, item.name, item.value)
  }

  // PDD 接口/内嵌数据中的 SKU/spec 列表。
  for (const root of roots) {
    walk(root, (key, value) => {
      if (!Array.isArray(value) || !/(spec|sku)/i.test(key)) return
      value.forEach((item: any) => {
        if (!item || typeof item !== 'object') return
        pushNameValue(specs, item)
      })
    })
  }

  // DOM 规格块，兼容「颜色：黑色」「重量：0.5kg」等结构。
  document.querySelectorAll('li, tr, [class*="spec"], [class*="sku"]').forEach((el) => {
    const raw = clean(el.textContent)
    if (!raw || raw.length > 160) return
    const parts = raw.split(/[：:]/)
    if (parts.length >= 2 && /(颜色|色号|尺码|尺寸|规格|款式|型号|容量|净含量|重量|毛重|净重|color|size|weight)/i.test(parts[0])) {
      pushSpecValue(specs, parts[0], parts.slice(1).join(':'))
    }
  })

  // 规格选择区：颜色/尺码/款式等。
  document.querySelectorAll('[class*="sku"], [class*="spec"], [class*="selector"]').forEach((block) => {
    const blockText = clean(block.textContent)
    if (!/(颜色|尺码|尺寸|规格|款式|型号|重量|容量)/.test(blockText) || blockText.length > 500) return
    const label = clean(block.querySelector('[class*="label"], [class*="name"], span')?.textContent) || '商品规格'
    const values = Array.from(block.querySelectorAll('button, li, [role="button"], [class*="item"], [class*="value"]'))
      .map((el) => clean(el.textContent))
      .filter((v) => v && v.length <= 40 && !/(已选|请选择|库存)/.test(v))
    if (values.length) pushSpecValue(specs, label, uniq(values).join(' / '))
  })

  return specs.slice(0, 80)
}

function extractSkuList(roots: unknown[]): Array<{ sku: string; barcode: string }> {
  const skus: Array<{ sku: string; barcode: string }> = []
  for (const skuObj of collectSkuObjects(roots)) {
    const sku = pickString(skuObj, ['sku_id', 'skuId', 'skuID', 'sku_id_str', 'skuIdStr'])
    if (/^\d{5,}$/.test(sku) && !skus.some((s) => s.sku === sku)) {
      skus.push({ sku, barcode: pickString(skuObj, ['barcode', 'barCode']) })
    }
  }
  for (const root of roots) {
    walk(root, (key, value, parent) => {
      if (!/(sku|skuId|sku_id|goods_id|goodsId)/i.test(key)) return
      const sku = clean(value)
      if (/^\d{5,}$/.test(sku) && !skus.some((s) => s.sku === sku)) skus.push({ sku, barcode: clean(parent?.barcode || parent?.barCode || '') })
    })
  }
  return skus.slice(0, 100)
}

function extractVariants(roots: unknown[]): ProductVariant[] {
  return collectSkuObjects(roots).flatMap((sku) => {
    const skuId = pickString(sku, ['sku_id', 'skuId', 'skuID', 'sku_id_str', 'skuIdStr'])
    const values = extractSkuSpecs(sku).map(({ name, value }) => ({ name, value }))
    if (!/^\d{5,}$/.test(skuId) || values.length === 0) return []

    const rawPrice = pickNumber(sku, ['group_price', 'groupPrice', 'price', 'normal_price', 'normalPrice'])
    const rawStock = pickNumber(sku, ['quantity', 'stock', 'stock_quantity', 'stockQuantity'])
    return [{
      sku: skuId,
      ...(pickString(sku, ['barcode', 'barCode']) ? { barcode: pickString(sku, ['barcode', 'barCode']) } : {}),
      values,
      ...(rawPrice > 0 ? { price: rawPrice } : {}),
      ...(rawStock >= 0 ? { stock: rawStock } : {}),
      ...(pickString(sku, ['thumb_url', 'thumbUrl', 'image', 'imageUrl']) ? { imageUrl: pickString(sku, ['thumb_url', 'thumbUrl', 'image', 'imageUrl']) } : {}),
    }]
  }).slice(0, 100)
}

function extractSpecList(values: SpecValue[]): SpecRecord[] {
  const spec: SpecRecord = { weight_g: 0, depth_mm: 0, height_mm: 0, width_mm: 0 }
  applyPhysicalSpec(spec, values)
  return Object.values(spec).some(Boolean) || spec.color || spec.size ? [spec] : []
}

function splitSpecValues(value: string): string[] {
  return uniq(clean(value)
    .split(/\s*(?:\/|｜|\||、)\s*/)
    .map(normalizeOptionText)
    .filter((item) => item && item.length <= 120 && !isActionText(item)))
}

function buildDomSpecRecords(values: SpecValue[]): SpecRecord[] {
  const groups = extractDomSkuGroups()
  if (!groups.length) {
    for (const item of values) {
      if (!/(颜色|色号|尺码|尺寸|规格|款式|型号|容量|净含量|重量|毛重|净重|color|size|weight)/i.test(item.name)) continue
      const options = splitSpecValues(item.value)
      if (options.length) groups.push({ name: item.name, values: options })
    }
  }

  const mainGroup = groups.find((group) => /容量|净含量|重量|规格|尺码|尺寸|颜色|款式|型号/i.test(group.name))
  if (!mainGroup) return []
  return mainGroup.values.slice(0, 100).map((value) => {
    const spec: SpecRecord = { weight_g: 0, depth_mm: 0, height_mm: 0, width_mm: 0 }
    spec[inferSpecKey(mainGroup.name)] = value
    applyPhysicalSpec(spec, [...values, { name: mainGroup.name, value }])
    return spec
  }).filter((spec) => Object.values(spec).some(Boolean) || spec.color || spec.size || spec.capacity || spec.style)
}

function extractPddSpecList(roots: unknown[], values: SpecValue[]): SpecRecord[] {
  const skuSpecs = collectSkuObjects(roots)
    .map((sku) => {
      const spec: SpecRecord = {
        sku: pickString(sku, ['sku_id', 'skuId', 'skuID', 'sku_id_str', 'skuIdStr']),
        weight_g: 0,
        depth_mm: 0,
        height_mm: 0,
        width_mm: 0,
      }
      const skuValues = extractSkuSpecs(sku)
      for (const item of skuValues) spec[inferSpecKey(item.name)] = item.value
      applyPhysicalSpec(spec, [...values, ...skuValues])

      const price = pickNumber(sku, ['group_price', 'groupPrice', 'price', 'normal_price', 'normalPrice'])
      if (price) spec.price = price
      const stock = pickString(sku, ['quantity', 'stock', 'stock_quantity', 'stockQuantity'])
      if (stock) spec.stock = stock
      return spec
    })
    .filter((spec) => Object.entries(spec).some(([key, value]) => key !== 'sku' && Boolean(value)))

  if (skuSpecs.length) {
    return skuSpecs.slice(0, 100)
  }
  const domSpecs = buildDomSpecRecords(values)
  if (domSpecs.length) {
    return domSpecs
  }
  return extractSpecList(values)
}

function extractDescription(): string {
  const desc = text('[class*="detail"], [class*="description"], [class*="desc"]')
  const descImages = Array.from(document.querySelectorAll('[class*="detail"] img, [class*="desc"] img'))
    .map((img) => normalizeImageUrl((img as HTMLImageElement).getAttribute('data-src') || (img as HTMLImageElement).src || ''))
    .filter((src) => src && /^https?:/.test(src))
    .slice(0, 20)
  return [...descImages, desc].filter(Boolean).join('\n')
}

export async function scrapePddProduct(): Promise<ScrapedProduct | null> {
  const sourceId = extractProductId()
  if (!sourceId) return null

  await ensureSkuPanelOpen()

  const roots = collectDataRoots()
  const specValues = extractSpecValues(roots)
  const seller = extractSeller(roots)
  const skuList = extractSkuList(roots)
  const variants = extractVariants(roots)
  const specList = extractPddSpecList(roots, specValues)

  const product: ScrapedProduct = {
    platform: 'pdd',
    sourceId,
    title: extractTitle(roots),
    currency: 'CNY',
    price: extractPrice(roots),
    oldPrice: 0,
    images: extractImages(roots),
    rating: 0,
    reviewCount: 0,
    brand: '',
    category: extractCategory(roots),
    sellerName: seller.name,
    sellerUrl: seller.url,
    description: extractDescription(),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
    videoUrls: Array.from(document.querySelectorAll('video source, video')).map((v) => (v as HTMLVideoElement).src || '').filter(Boolean),
    skuList,
    variants,
    specList,
    tags: ['PDD'],
    ozonCategoryId: 0,
    ozonTypeId: 0,
    discount: text('[class*="coupon"], [class*="discount"]'),
    stock: text('[class*="stock"], [class*="quantity"]'),
    priceRanges: [],
    minOrderQty: 1,
    supplierUrl: seller.url,
    tradeQuantity: 0,
  }


  return product
}

export interface ListCardPdd {
  sourceId: string
  title: string
  price: number
  oldPrice: number
  imageUrl: string
  sourceUrl: string
}

export function scanPddListCards(): ListCardPdd[] {
  const cards: ListCardPdd[] = []
  const seen = new Set<string>()
  document.querySelectorAll('a[href*="goods_id"], a[href*="goods.html"]').forEach((a) => {
    const link = a as HTMLAnchorElement
    const href = link.href || ''
    const id = href.match(/[?&](?:goods_id|goodsId)=(\d+)/)?.[1]
    if (!id || seen.has(id)) return
    seen.add(id)
    const img = link.querySelector('img') as HTMLImageElement | null
    cards.push({
      sourceId: id,
      title: clean(link.textContent).slice(0, 120),
      price: parsePrice(clean(link.textContent)),
      oldPrice: 0,
      imageUrl: normalizeImageUrl(img?.getAttribute('data-src') || img?.src || ''),
      sourceUrl: href,
    })
  })
  return cards
}