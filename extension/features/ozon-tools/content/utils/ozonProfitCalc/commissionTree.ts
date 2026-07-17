// 类目佣金树（来自用户本地配置的 JSON）
// 移植自旧插件 ozon_old/src/ozon/shared/commission-tree.js
//
// 主要 API：
//   loadCommissionTree()               拉本地树，做归一化，模块级缓存。
//   getCachedCommissionTree()          返回当前已缓存的树（未加载时返回 []）。
//   resolveCommissionFromCategories()  入口：传入卡片接口的 categories + 当前 RUB 售价，返回 {rate, path} 或 null。
//   resolveTierRateByPath()            已经知道 path，按新的 RUB 售价重算费率（售价变化时用）。

import { API_CONFIG } from '../../../utils/api-config'
import { proxyFetchJson } from '../../../utils/proxyFetch'

const COMMISSION_TREE_URL = `${API_CONFIG.LOCAL_API_BASE_URL}/selection/ozon-commission-tree`

export interface CommissionCategoryItem {
  level?: string | number
  id?: string | number
  name?: string
  title?: string
  label?: string
  cate_id?: string | number
  category_id?: string | number
  categoryId?: string | number
  cid?: string | number
  [k: string]: any
}

interface TreeNode {
  id?: string | number
  value?: string
  label?: string
  cate_id?: string | number
  tier?: number
  rate_rfbs?: any
  tier_1_rate_rfbs?: any
  tier_2_rate_rfbs?: any
  tier_3_rate_rfbs?: any
  tier_1_rate?: any
  tier_2_rate?: any
  tier_3_rate?: any
  level1_category_name_ru?: string
  level1_category_name_zh?: string
  level2_category_name_zh?: string
  description_type_name_ru?: string
  descriptive_category_3_ru?: string
  description_type_name_zh?: string
  children?: TreeNode[]
  [k: string]: any
}

let _commissionTree: TreeNode[] = []
let _loadPromise: Promise<TreeNode[]> | null = null
let _treeReady = false

/** 与佣金树末级 tier 字段对齐：1=售价<1500₽, 2=[1500,5000]₽, 3=>5000₽ */
export function resolvePriceTierByRub(priceRub: number): number {
  const p = Number(priceRub || 0)
  if (!isFinite(p)) return 1
  if (p > 5000) return 3
  if (p >= 1500) return 2
  return 1
}

async function fetchTreeOnce(): Promise<TreeNode[]> {
  const json = await proxyFetchJson<TreeNode[] | { result?: TreeNode[] }>(
    COMMISSION_TREE_URL,
    {
      method: 'GET',
      preset: 'local_auth',
      timeout: 10000,
    },
  )
  const raw = Array.isArray(json) ? json : Array.isArray(json?.result) ? json.result : []
  _commissionTree = normalizeCommissionTree(raw)
  _treeReady = true
  return _commissionTree
}

/** 拉取并缓存类目树；并发调用会复用同一个 Promise。 */
export function loadCommissionTree(): Promise<TreeNode[]> {
  if (_treeReady) return Promise.resolve(_commissionTree)
  if (_loadPromise) return _loadPromise
  _loadPromise = fetchTreeOnce().finally(() => {
    _loadPromise = null
  })
  return _loadPromise
}

/** 带退避重试的加载入口：失败时按 3s 间隔重试，retries 用尽后放弃。 */
export function loadCommissionTreeWithRetry(retries: number, onReady?: () => void): void {
  loadCommissionTree()
    .then(() => {
      if (typeof onReady === 'function') onReady()
    })
    .catch(() => {
      if (retries > 0) setTimeout(() => loadCommissionTreeWithRetry(retries - 1, onReady), 3000)
    })
}

export function getCachedCommissionTree(): TreeNode[] {
  return _commissionTree
}

export function isCommissionTreeReady(): boolean {
  return _treeReady
}

function normalizeCommissionTree(tree: TreeNode[]): TreeNode[] {
  const level1List = Array.isArray(tree) ? tree : []
  return level1List.map((l1) => {
    const level2List = Array.isArray(l1.children) ? l1.children : []
    const normalizedLevel2 = level2List.map((l2, l2Index) => {
      const level3List = Array.isArray(l2.children) ? l2.children : []
      if (
        level3List.length &&
        level3List.every((node) => isTierValue(node && node.value))
      ) {
        return Object.assign({}, l2, {
          children: level3List.map((tierNode, tierIndex) =>
            Object.assign({}, tierNode, {
              id:
                tierNode && tierNode.id != null
                  ? tierNode.id
                  : (l2 && l2.id ? l2.id : 'l2_' + l2Index) + '.' + (tierIndex + 1),
            }),
          ),
        })
      }
      const normalizedLevel3 = level3List.map((l3, idx) => ensureTierChildren(l3, idx))
      return Object.assign({}, l2, { children: normalizedLevel3 })
    })
    return Object.assign({}, l1, { children: normalizedLevel2 })
  })
}

function ensureTierChildren(level3Node: TreeNode, index: number): TreeNode {
  const node: TreeNode = Object.assign({}, level3Node || {})
  const currentChildren = Array.isArray(node.children) ? node.children : []
  if (currentChildren.length) return node
  const rfbs1 = node.tier_1_rate_rfbs != null ? node.tier_1_rate_rfbs : node.tier_1_rate
  const rfbs2 = node.tier_2_rate_rfbs != null ? node.tier_2_rate_rfbs : node.tier_2_rate
  const rfbs3 = node.tier_3_rate_rfbs != null ? node.tier_3_rate_rfbs : node.tier_3_rate
  const hasTierData = [rfbs1, rfbs2, rfbs3].some(
    (v) => v !== undefined && v !== null && String(v).trim() !== '',
  )
  if (!hasTierData) return node
  const baseId = node.id || 'auto_' + index
  node.children = [
    { id: baseId + '.1', value: 'tier_1', label: '售价 ≤ 1500₽', tier: 1, rate_rfbs: rfbs1 },
    { id: baseId + '.2', value: 'tier_2', label: '1500₽ < 售价 ≤ 5000₽', tier: 2, rate_rfbs: rfbs2 },
    { id: baseId + '.3', value: 'tier_3', label: '售价 > 5000₽', tier: 3, rate_rfbs: rfbs3 },
  ]
  return node
}

/** 形如 "1,12.00" 的字符串档位标识。 */
export function isTierValue(raw: any): boolean {
  const s = String(raw == null ? '' : raw).trim()
  return /^\d+\s*,\s*-?\d+(?:\.\d+)?$/.test(s)
}

function parseTierRateFromValue(raw: any): { tier: number; rate: number } {
  const s = String(raw == null ? '' : raw).trim()
  const parts = s.split(',')
  const tier = Number(parts[0])
  const rate = normalizeCommissionRate(parts[1])
  return {
    tier: isFinite(tier) ? tier : 1,
    rate: isFinite(rate) ? rate : 0,
  }
}

function parsePercent(raw: any): number {
  const s = String(raw == null ? '' : raw).replace('%', '').trim()
  const n = parseFloat(s)
  return isFinite(n) ? n : 0
}

/** 兼容 0.12 / 12 两种输入，统一为百分比数值（12 表示 12%）。 */
export function normalizeCommissionRate(raw: any): number {
  const n = parsePercent(raw)
  if (!isFinite(n)) return 0
  return n > 0 && n < 1 ? n * 100 : n
}

function normalizeMatchText(text: any): string {
  return String(text == null ? '' : text)
    .replace(/[（）()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreCandidates(candidates: string[], keyword: string, exactOnly: boolean): number {
  const kw = normalizeMatchText(keyword)
  if (!kw) return 0
  let score = 0
  candidates.forEach((text) => {
    if (!text) return
    const a = normalizeMatchText(text)
    if (a === kw) {
      score = Math.max(score, 300 + kw.length)
      return
    }
    if (exactOnly) return
    if (a.indexOf(kw) !== -1 || kw.indexOf(a) !== -1) {
      score = Math.max(score, 150 + Math.min(a.length, kw.length))
    }
  })
  return score
}

function collectCategoryIds(categories: CommissionCategoryItem[]): number[] {
  const keyList = ['cate_id', 'category_id', 'categoryId', 'cid', 'id'] as const
  const out: number[] = []
  ;(categories || []).forEach((item) => {
    keyList.forEach((key) => {
      const raw = item && (item as any)[key]
      const num = Number(raw)
      if (isFinite(num) && num > 0) out.push(num)
    })
  })
  return Array.from(new Set(out))
}

function collectCategoryWordsByLevels(
  categories: CommissionCategoryItem[],
  levels: Array<string | number>,
): string[] {
  const lvSet = new Set((levels || []).map((v) => String(v)))
  const out: string[] = []
  ;(categories || []).forEach((item) => {
    const lv = String(item && item.level != null ? item.level : '')
    if (!lvSet.has(lv)) return
    const text = normalizeMatchText(item && (item.name || item.title || item.label))
    if (text) out.push(text)
  })
  return Array.from(new Set(out))
}

function findLevel2PathByCateId(tree: TreeNode[], categoryIds: number[]): string[] {
  const idSet = new Set(
    (categoryIds || [])
      .map((v) => Number(v))
      .filter((v) => isFinite(v) && v > 0),
  )
  if (!idSet.size) return []
  for (let i = 0; i < tree.length; i++) {
    const l1 = tree[i]
    const level2List = Array.isArray(l1 && l1.children) ? l1.children! : []
    for (let j = 0; j < level2List.length; j++) {
      const l2 = level2List[j]
      if (idSet.has(Number(l2 && l2.cate_id))) {
        return [l1.value || '', l2.value || '']
      }
    }
  }
  return []
}

function findBestLevel2PathByMappedField(
  tree: TreeNode[],
  keywords: string[],
  field: keyof TreeNode,
  exactOnly: boolean,
): string[] {
  const words = (keywords || []).map((k) => normalizeMatchText(k)).filter(Boolean)
  if (!words.length) return []
  let best: { score: number; path: string[] } | null = null
  for (let i = 0; i < tree.length; i++) {
    const l1 = tree[i]
    const level2List = Array.isArray(l1.children) ? l1.children : []
    for (let j = 0; j < level2List.length; j++) {
      const l2 = level2List[j]
      const mappedValue = normalizeMatchText(l2 && (l2 as any)[field])
      if (!mappedValue) continue
      let score = 0
      words.forEach((kw) => {
        score += scoreCandidates([mappedValue], kw, exactOnly)
      })
      if (score > 0 && (!best || score > best.score)) {
        best = { score, path: [l1.value || '', l2.value || ''] }
      }
    }
  }
  return best ? best.path : []
}

function findLevel2Node(tree: TreeNode[], pathToLevel2: string[]): TreeNode | null {
  if (!Array.isArray(pathToLevel2) || pathToLevel2.length < 2) return null
  const l1 = (tree || []).find((n) => n.value === pathToLevel2[0])
  if (!l1 || !Array.isArray(l1.children)) return null
  return l1.children.find((n) => n.value === pathToLevel2[1]) || null
}

function findDescriptionPathByMappedField(
  tree: TreeNode[],
  pathToLevel2: string[],
  keywords: string[],
  field: keyof TreeNode,
  exactOnly: boolean,
): string[] {
  const level2Node = findLevel2Node(tree, pathToLevel2)
  if (!level2Node || !Array.isArray(level2Node.children) || !level2Node.children.length) return []
  const words = (keywords || []).map((k) => normalizeMatchText(k)).filter(Boolean)
  if (!words.length) return []
  let best: { score: number; value: string } | null = null
  for (let i = 0; i < level2Node.children.length; i++) {
    const descNode = level2Node.children[i]
    const mappedValue = normalizeMatchText(descNode && (descNode as any)[field])
    if (!mappedValue) continue
    let score = 0
    words.forEach((kw) => {
      score += scoreCandidates([mappedValue], kw, exactOnly)
    })
    if (score > 0 && (!best || score > best.score)) {
      best = { score, value: descNode.value || '' }
    }
  }
  return best ? [pathToLevel2[0], pathToLevel2[1], best.value] : []
}

function getSelectedDescriptionNode(tree: TreeNode[], path: string[]): TreeNode | null {
  if (!Array.isArray(path) || path.length < 3) return null
  const level2Node = findLevel2Node(tree, [path[0], path[1]])
  if (!level2Node || !Array.isArray(level2Node.children)) return null
  const node = level2Node.children.find((n) => n.value === path[2]) || null
  return node && isTierValue(node.value) ? level2Node : node
}

function getSelectedTierNode(tree: TreeNode[], path: string[]): TreeNode | null {
  if (!Array.isArray(path) || path.length < 3) return null
  const level2Node = findLevel2Node(tree, [path[0], path[1]])
  if (!level2Node || !Array.isArray(level2Node.children)) return null
  const directTierNode = level2Node.children.find(
    (n) => n.value === path[2] && isTierValue(n.value),
  )
  if (directTierNode) return directTierNode
  if (path.length < 4) return null
  const descriptionNode = level2Node.children.find((n) => n.value === path[2])
  if (!descriptionNode || !Array.isArray(descriptionNode.children)) return null
  return descriptionNode.children.find((n) => n.value === path[3]) || null
}

function parseRateByTier(
  descriptionNode: TreeNode | null,
  tier: number,
  tierNode: TreeNode | null,
): number {
  if (tierNode) {
    if (isTierValue(tierNode.value)) return parseTierRateFromValue(tierNode.value).rate
    return normalizeCommissionRate(tierNode.rate_rfbs)
  }
  if (!descriptionNode) return 0
  const rfbsKey = ('tier_' + tier + '_rate_rfbs') as keyof TreeNode
  const legacyKey = ('tier_' + tier + '_rate') as keyof TreeNode
  const raw =
    (descriptionNode as any)[rfbsKey] != null
      ? (descriptionNode as any)[rfbsKey]
      : (descriptionNode as any)[legacyKey]
  return normalizeCommissionRate(raw)
}

function buildTierPathBySalePrice(tree: TreeNode[], descPath: string[], priceRub: number): string[] {
  if (!Array.isArray(descPath) || descPath.length < 2) return descPath
  const tier = resolvePriceTierByRub(priceRub)
  const level2Node = findLevel2Node(tree, descPath)
  if (
    level2Node &&
    Array.isArray(level2Node.children) &&
    level2Node.children.length &&
    level2Node.children.every((n) => isTierValue(n && n.value))
  ) {
    const tierNodeDirect =
      level2Node.children.find((n) => parseTierRateFromValue(n && n.value).tier === tier) ||
      level2Node.children[0]
    return tierNodeDirect ? [descPath[0], descPath[1], tierNodeDirect.value || ''] : descPath
  }
  const descriptionNode = getSelectedDescriptionNode(tree, descPath)
  if (!descriptionNode || !Array.isArray(descriptionNode.children) || !descriptionNode.children.length)
    return descPath
  const tierNode =
    descriptionNode.children.find((n) => Number(n.tier) === tier) || descriptionNode.children[0]
  return tierNode ? [descPath[0], descPath[1], descPath[2], tierNode.value || ''] : descPath
}

function findCategoryPathByCategories(
  tree: TreeNode[],
  categories: CommissionCategoryItem[],
): string[] {
  if (!Array.isArray(tree) || !tree.length) return []
  const categoryIds = collectCategoryIds(categories)
  const pathByCateId = findLevel2PathByCateId(tree, categoryIds)
  if (pathByCateId.length) return pathByCateId
  const level2Words = collectCategoryWordsByLevels(categories, ['2'])
  const level3Words = collectCategoryWordsByLevels(categories, ['3'])
  const level4Words = collectCategoryWordsByLevels(categories, ['4'])
  if (!level2Words.length && !level3Words.length && !level4Words.length) return []
  let pathToLevel2: string[] = []
  const strategies: Array<[string[], keyof TreeNode, boolean]> = [
    [level2Words, 'level1_category_name_ru', true],
    [level2Words, 'level1_category_name_ru', false],
    [level2Words, 'level1_category_name_zh', true],
    [level2Words, 'level1_category_name_zh', false],
    [level3Words, 'level2_category_name_zh', true],
    [level3Words, 'level2_category_name_zh', false],
  ]
  for (let i = 0; i < strategies.length && !pathToLevel2.length; i++) {
    const s = strategies[i]
    if (!s[0].length) continue
    pathToLevel2 = findBestLevel2PathByMappedField(tree, s[0], s[1], s[2])
  }
  if (!pathToLevel2.length) return []
  const descStrategies: Array<[string[], keyof TreeNode, boolean]> = [
    [level4Words, 'description_type_name_ru', true],
    [level4Words, 'description_type_name_ru', false],
    [level4Words, 'descriptive_category_3_ru', true],
    [level4Words, 'descriptive_category_3_ru', false],
    [level4Words, 'description_type_name_zh', true],
    [level4Words, 'description_type_name_zh', false],
  ]
  let descPath: string[] = []
  for (let j = 0; j < descStrategies.length && !descPath.length; j++) {
    const ds = descStrategies[j]
    if (!ds[0].length) continue
    descPath = findDescriptionPathByMappedField(tree, pathToLevel2, ds[0], ds[1], ds[2])
  }
  return descPath.length ? descPath : pathToLevel2
}

/** path + 当前 RUB 售价 → 费率（百分比数值）。 */
export function resolveTierRateByPath(path: string[], priceRub: number): number {
  const tree = getCachedCommissionTree()
  if (!Array.isArray(path) || path.length < 2 || !tree.length) return 0
  const fullPath = buildTierPathBySalePrice(tree, path.slice(0, 3), priceRub)
  const tier = resolvePriceTierByRub(priceRub)
  const descriptionNode = getSelectedDescriptionNode(tree, fullPath)
  const tierNode = getSelectedTierNode(tree, fullPath)
  return parseRateByTier(descriptionNode, tier, tierNode)
}

/** 入口：传入卡片接口的 categories + 当前 RUB 售价，返回 {rate, path}（百分比数值）。 */
export function resolveCommissionFromCategories(
  categories: CommissionCategoryItem[],
  priceRub: number,
): { rate: number; path: string[] } | null {
  const tree = getCachedCommissionTree()
  if (!tree.length) return null
  const basePath = findCategoryPathByCategories(tree, categories)
  if (!basePath.length) return null
  const rate = resolveTierRateByPath(basePath, priceRub)
  return { rate, path: basePath }
}
