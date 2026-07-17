/**
 * AI帮填 + 上架至 Ozon 公用逻辑，复制时需 api.ts、collectedGoodsTransform、imageOssUpload。
 */

import { apiService, createSseStream, type ApiResponse } from '../../utils/api'
import { ensureHttpImageUrlOnOss } from '../../utils/imageOssUpload'
import { generateDefaultOfferidPrefix } from './collectedGoodsTransform'
import { mapAttrValueByDictionary } from './ozonGoodsFeature'

// —— 常量 ——

export const AI_AGENT_STOP_ERROR_CODE = 'AI_AGENT_STOPPED'

export const AI_AGENT_TARGET_NODES = new Set(['大模型1', '大模型2', '结束'])

export const FEATURE_ATTR_ID_VIDEO_URL = 21841

export const MANAGED_BY_SKU_MEDIA_ATTR_IDS = new Set<number>([FEATURE_ATTR_ID_VIDEO_URL])

export const FIELD_SCOPE_STORAGE_KEY = '__mjgd_field_scope'

export const FEATURE_SCOPE_STORAGE_KEY = '__mjgd_feature_scope'

export const SKU_VARIANT_FEATURE_STORAGE_KEY = '__mjgd_variant_feature_values'

export const SKU_VARIANT_DESCRIPTION_STORAGE_KEY = '__mjgd_variant_description'

/** 商品描述（简介）对应特征 id */
export const FEATURE_ATTR_ID_DESCRIPTION = 4191

const FEATURE_ATTR_ID_MANUFACTURER = 23487

export const FEATURE_ATTR_IDS_ALLOW_CHINESE = new Set([FEATURE_ATTR_ID_MANUFACTURER])

export const CHINESE_FIELD_ERROR_MESSAGE = '含有中文，请使用俄语填写'

const FEATURE_ATTR_IDS_AUTO_RANDOM_MODEL = new Set([9048, 8292])

const FEATURE_ATTR_ID_BRAND_TYPE = 85

const FEATURE_ATTR_ID_ORIGIN_COUNTRY = 4389

export const FEATURE_ATTR_IDS_SKIP_AI_PREFILL = new Set([
    ...FEATURE_ATTR_IDS_AUTO_RANDOM_MODEL,
    FEATURE_ATTR_ID_BRAND_TYPE,
    FEATURE_ATTR_ID_ORIGIN_COUNTRY
])

// —— 类型 ——

export type OfferIdFromPage = {
    collectPlatform: string
    offerId: string
}

export type ChineseFieldMark = {
    label: string
    value: string
    attrId?: number
    skuFieldKey?: string
}

export interface AiApplyContext {
    getTransformedData: () => any
    setTransformedData: (data: any) => void
    getFeatureAttrs: () => any[]
    setPrefilledFeatureAttrValues: (values: Record<string, string | number | string[]>) => void
    setAiResultJsonList: (rows: any[]) => void
    setAiResultPublicFeatureData: (data: Record<string, any>) => void
    appendLog: (message: string) => void
    onRecoverComplete?: () => void
    ensureDefaultFeatureAttrSelections: () => void
    ensureRandomModelNameFeatureAttrs: () => void
}

export interface AiSseContext {
    getStopRequested: () => boolean
    setSessionId: (id: string | null) => void
    setRejectPromise: (fn: ((reason?: unknown) => void) | null) => void
    getRejectPromise: () => ((reason?: unknown) => void) | null
    setEventSource: (es: EventSource | null) => void
    getEventSource: () => EventSource | null
    closeEventSource: () => void
    getLogText: () => string
    setLogText: (text: string) => void
    appendLogDelta: (delta: string) => void
    appendLog: (message: string) => void
    applyAiResult: (resultJson: unknown) => void
    onShowRecoverButton: () => void
    createStoppedError: () => Error & { code?: string }
}

export interface WorkbenchReader {
    getFeatureAttrValue?: (attrId: number) => string
    getSkuAspectString?: (rowIndex: number, attrId: number) => string
    getSkuVariantFeatureValue?: (rowIndex: number, attrId: number) => string
    getSkuJsonRichText?: (rowIndex: number) => string
    getSkuVariantDescription?: (rowIndex: number) => string
    getSkuTitleValue?: (sku: any) => string
}

export interface SubmitValidateContext {
    featureAttrs: any[]
    transformedData: any
    workbenchReader?: WorkbenchReader | null
    getFeatureAttrExistingValue: (attr: any) => string | number | string[] | undefined
    getVariantJsonRichTextValue?: (variantIndex: number, attrId: string) => string
}

export interface OzonSubmitContext {
    categoryTemplates: Array<{ id: number; data?: { metadata?: Record<string, unknown> } }>
    categoryTemplateId: number | null
    transformedData: any
    featureAttrs: any[]
    aiResultJsonList: any[]
    aiResultPublicFeatureData: Record<string, any>
    selectedShopIds: number[]
    shopWarehouseInventory: Record<number, { warehouseId: number | null; quantity: number }>
    skuVideoUrlList: Record<number, string>
    getFeatureAttrExistingValue: (attr: any) => string | number | string[] | undefined
    /** 无 AI 结果列表时从 aiOutput 解析变体行 */
    parseAiOutputFallback?: () => any[]
}

// —— offerId ——

/** 从当前页面 URL 提取采集平台与商品 id */
export function getOfferIdFromPage(): OfferIdFromPage {
    let collectPlatform = ''
    let offerId = ''
    let urlMatch: RegExpMatchArray | null = null
    const { hostname, href, pathname } = window.location

    if (hostname.includes('1688.com')) {
        collectPlatform = 'ALI_1688'
        urlMatch = href.match(/[?&]offerId=(\d+)/)
        if (!urlMatch) {
            urlMatch = href.match(/offer\/(\d+)\.html/)
        }
    } else if (hostname === 'pifa.pinduoduo.com') {
        // 拼多多批发详情页使用 gid 参数，与零售域 goods_id 不同
        collectPlatform = 'PDD_PIFA'
        urlMatch = href.match(/[?&]gid=(\d+)/)
    } else if (hostname.includes('pinduoduo.com') || hostname.includes('yangkeduo.com')) {
        collectPlatform = 'PDD'
        urlMatch = href.match(/[?&]goods_id=(\d+)/)
    } else if (
        (hostname.includes('taobao.com') && hostname.includes('item')) ||
        (hostname.includes('tmall.com') && hostname.includes('detail'))
    ) {
        collectPlatform = 'TAOBAO'
        urlMatch = href.match(/[?&]id=(\d+)/)
    } else if (hostname.includes('ozon.ru') || hostname.includes('ozon.kz')) {
        collectPlatform = 'OZON'
        urlMatch = href.match(/[?&]from_sku=(\d+)/)
        if (!urlMatch) {
            urlMatch = pathname.match(/-(\d+)\/?$/) || pathname.match(/\/(\d+)\/?$/)
        }
    }

    offerId = urlMatch ? urlMatch[1] : ''
    return { collectPlatform, offerId }
}

// —— 错误与 SSE 解析 ——

export const normalizeUnknownError = (
    error: unknown,
    fallbackMessage = '未知错误'
): Error => {
    if (error instanceof Error) {
        return error
    }
    if (typeof error === 'string' && error.trim()) {
        return new Error(error)
    }
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>
        const message =
            record.message ||
            record.msg ||
            record.error ||
            record.errMsg ||
            fallbackMessage
        const normalized = new Error(String(message))
        Object.assign(normalized, record)
        return normalized
    }
    return new Error(fallbackMessage)
}

export const isAiAgentStoppedError = (error: unknown): boolean => {
    return (error as { code?: string })?.code === AI_AGENT_STOP_ERROR_CODE
}

export function createAiAgentStoppedError(): Error & { code: string } {
    const error = new Error('AI 智能体任务已手动停止') as Error & { code: string }
    error.code = AI_AGENT_STOP_ERROR_CODE
    return error
}

export const parseSseEventData = (raw: unknown): unknown => {
    if (typeof raw !== 'string') return raw
    try {
        return JSON.parse(raw)
    } catch {
        return raw
    }
}

export const safeParseJson = (value: unknown): unknown => {
    if (typeof value !== 'string') return value
    const text = value.trim()
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        return value
    }
}

export const calcIncrement = (previous: string, incoming: string): string => {
    if (!incoming) return ''
    if (!previous) return incoming
    if (incoming.startsWith(previous)) {
        return incoming.slice(previous.length)
    }
    return incoming
}

export const normalizeFeatureName = (name: string): string => {
    return String(name || '')
        .trim()
        .replace(/^\[+|\]+$/g, '')
        .trim()
}

export const asArrayValue = (raw: unknown): string[] => {
    if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean)
    if (raw == null) return []
    return String(raw)
        .split(/[;；,，|/]/)
        .map((v) => v.trim())
        .filter(Boolean)
}

export const hasChineseChar = (raw: unknown): boolean => {
    if (raw == null) return false
    const texts = Array.isArray(raw) ? raw : [raw]
    return texts.some((item) => /[\u3400-\u9fff]/.test(String(item ?? '')))
}

/** 删除 CJK 字符，保留俄文/英文/标点；合并空白并去掉空行 */
export const stripChineseChars = (text: string): string => {
    return String(text || '')
        .replace(/[\u3400-\u9fff]/g, '')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
        .trim()
}

/** 自由文本回填 sanitize：string / string[] 去中文，数值等原样返回 */
export const sanitizeAiBackfillTextValue = (value: unknown): unknown => {
    if (typeof value === 'string') return stripChineseChars(value)
    if (Array.isArray(value)) {
        return value.map((item) => stripChineseChars(String(item ?? ''))).filter(Boolean)
    }
    return value
}

/** 选择框走字典映射最终提交 id，无需 strip；仅自由文本特征需处理 */
const shouldSanitizeAiBackfillAttr = (attr: any): boolean => {
    if (!attr) return false
    if (FEATURE_ATTR_IDS_ALLOW_CHINESE.has(Number(attr?.id))) return false
    if (FEATURE_ATTR_IDS_SKIP_AI_PREFILL.has(Number(attr?.id))) return false
    return Number(attr?.dictionary_id ?? 0) === 0
}

const trackChineseFilteredLabel = (
    labels: string[],
    label: string,
    before: unknown,
    after: unknown
): void => {
    if (!hasChineseChar(before)) return
    const prevText = Array.isArray(before)
        ? before.map((v) => String(v ?? '')).join('\u0001')
        : String(before ?? '')
    const nextText = Array.isArray(after)
        ? after.map((v) => String(v ?? '')).join('\u0001')
        : String(after ?? '')
    if (prevText !== nextText && !labels.includes(label)) {
        labels.push(label)
    }
}

const sanitizeAiBackfillFreeText = (
    labels: string[],
    label: string,
    raw: unknown
): string => {
    const text = String(raw ?? '').trim()
    if (!text) return ''
    const next = String(sanitizeAiBackfillTextValue(text) ?? '').trim()
    trackChineseFilteredLabel(labels, label, text, next)
    return next
}

const sanitizeMappedBackfillValue = (
    labels: string[],
    attr: any,
    mappedValue: string | number | string[]
): string | number | string[] | null => {
    if (!shouldSanitizeAiBackfillAttr(attr)) return mappedValue
    if (typeof mappedValue === 'number') return mappedValue
    const sanitized = sanitizeAiBackfillTextValue(mappedValue)
    trackChineseFilteredLabel(labels, String(attr?.name || attr?.id), mappedValue, sanitized)
    if (typeof sanitized === 'string') {
        return sanitized.trim() ? sanitized : null
    }
    if (Array.isArray(sanitized)) {
        return sanitized.length > 0 ? sanitized : null
    }
    return null
}

/** 持久化 AI 公共特征时仅 sanitize 简介，其余 key 保留供字典匹配 */
const sanitizePublicDataIntroForPersist = (
    publicData: Record<string, unknown>,
    labels: string[]
): Record<string, unknown> => {
    const next = { ...publicData }
    for (const [key, value] of Object.entries(publicData)) {
        if (normalizeFeatureName(key) !== '简介') continue
        const sanitized = sanitizeAiBackfillTextValue(value)
        trackChineseFilteredLabel(labels, '简介', value, sanitized)
        next[key] = sanitized
    }
    return next
}

export const isAttrValueFilled = (attr: any, raw: unknown): boolean => {
    if (attr?.is_collection) {
        return asArrayValue(raw).length > 0
    }
    if (Array.isArray(raw)) {
        return raw.some((item) => String(item ?? '').trim() !== '')
    }
    return String(raw ?? '').trim() !== ''
}

export const parseNumberValue = (raw: unknown): number | null => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (raw == null) return null
    const text = String(raw).trim()
    if (!text) return null
    const normalized = text.replace(/[，,\s]/g, '')
    const num = Number(normalized)
    return Number.isFinite(num) ? num : null
}

export const getRawValueByFeatureName = (
    featureData: Record<string, unknown>,
    attrName: string
): unknown => {
    const normalizedTarget = normalizeFeatureName(attrName)
    const entry = Object.entries(featureData || {}).find(([key]) => {
        return normalizeFeatureName(key) === normalizedTarget
    })
    return entry ? entry[1] : undefined
}

export const toLongOrNull = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

export const toIntOrNull = (v: unknown): number | null => {
    const n = Number(v)
    if (!Number.isFinite(n)) return null
    return Math.round(n)
}

export const toPriceString = (v: unknown): string => {
    const n = Number(v)
    if (!Number.isFinite(n)) return '0'
    return String(n)
}

/** 新版 SSE message 中单节点快照，供日志弹窗展示进度与流式文本 */
export interface AiSseNodeEvent {
    nodeId: string
    nodeName: string
    nodeType: string
    nodeStatus: string
    nodeExecTime: string
    result: string
    reasoningContent: string
}

export const extractNodeEventsFromSsePayload = (payload: unknown): AiSseNodeEvent[] => {
    const events: AiSseNodeEvent[] = []
    const parsedPayload = parseSseEventData(payload) as Record<string, unknown>
    const messageRaw = parsedPayload?.message
    const messageArray = safeParseJson(messageRaw)
    if (!Array.isArray(messageArray)) return events

    messageArray.forEach((item: unknown) => {
        const row = item as Record<string, unknown>
        const responseObj = safeParseJson(row?.response)
        if (!responseObj || typeof responseObj !== 'object') return
        const resp = responseObj as Record<string, unknown>
        const nodeName = String(resp.nodeName || '').trim()
        if (!nodeName) return

        let result = ''
        let reasoningContent = ''
        const nodeResultObj = safeParseJson(resp.nodeResult)
        if (nodeResultObj && typeof nodeResultObj === 'object') {
            const nodeResult = nodeResultObj as Record<string, unknown>
            result = typeof nodeResult.result === 'string' ? nodeResult.result : ''
            reasoningContent =
                typeof nodeResult.reasoningContent === 'string' ? nodeResult.reasoningContent : ''
        }

        events.push({
            nodeId: String(resp.nodeId || nodeName).trim(),
            nodeName,
            nodeType: String(resp.nodeType || '').trim(),
            nodeStatus: String(resp.nodeStatus || '').trim(),
            nodeExecTime: String(resp.nodeExecTime || '').trim(),
            result,
            reasoningContent,
        })
    })

    return events
}

export const extractNodeChunksFromSsePayload = (
    payload: unknown,
    options?: { allowAllNodes?: boolean }
): Array<{ nodeName: string; resultDelta: string; reasoningDelta: string }> => {
    const chunks: Array<{ nodeName: string; resultDelta: string; reasoningDelta: string }> = []
    extractNodeEventsFromSsePayload(payload).forEach((event) => {
        if (!options?.allowAllNodes && !AI_AGENT_TARGET_NODES.has(event.nodeName)) return
        if (!event.result && !event.reasoningContent) return
        chunks.push({
            nodeName: event.nodeName,
            resultDelta: event.result,
            reasoningDelta: event.reasoningContent,
        })
    })
    return chunks
}

// —— AI 回填 ——

export const applyAiResultJsonToFeatureValues = (
    resultJson: unknown,
    ctx: AiApplyContext,
    mode?: 'recover'
): void => {
    if (!resultJson || typeof resultJson !== 'object') {
        ctx.appendLog('[回填] complete 未包含可用 resultJson，跳过回填')
        return
    }
    const json = resultJson as Record<string, unknown>
    const publicFeatureData = json['[公共特征]']
    const variantRows = Array.isArray(json['[变体特征]']) ? json['[变体特征]'] : []
    if (!publicFeatureData || typeof publicFeatureData !== 'object') {
        ctx.appendLog('[回填] resultJson[公共特征] 不存在，跳过回填')
        return
    }
    const publicData = publicFeatureData as Record<string, unknown>
    const chineseFilteredLabels: string[] = []
    // 持久化时仅处理简介，变体/字典原始文本保留供 mapAttrValueByDictionary 匹配
    ctx.setAiResultPublicFeatureData(
        sanitizePublicDataIntroForPersist(publicData, chineseFilteredLabels)
    )
    ctx.setAiResultJsonList(variantRows as any[])

    const featureAttrs = ctx.getFeatureAttrs()
    if (!Array.isArray(featureAttrs) || featureAttrs.length === 0) {
        ctx.appendLog('[回填] 当前类目特征为空，无法回填')
        return
    }

    const firstVariant =
        variantRows[0] && typeof variantRows[0] === 'object'
            ? (variantRows[0] as Record<string, unknown>)
            : {}
    const nameFromAi = sanitizeAiBackfillFreeText(
        chineseFilteredLabels,
        '商品名称',
        firstVariant['[商品名称]']
    )
    const introFromAi = sanitizeAiBackfillFreeText(
        chineseFilteredLabels,
        '简介',
        getRawValueByFeatureName(publicData, '简介') ?? json['[简介]']
    )

    const transformedData = ctx.getTransformedData()
    if (transformedData && typeof transformedData === 'object') {
        transformedData.global_data = transformedData.global_data || {}
        if (nameFromAi) {
            transformedData.global_data.product_name = nameFromAi
        }
        if (introFromAi) {
            transformedData.global_data.description_clean_text = introFromAi
        }
        if (nameFromAi || introFromAi) {
            ctx.appendLog(
                `[回填] 已回填产品基础信息（标题${nameFromAi ? '√' : '×'}，描述${introFromAi ? '√' : '×'}）`
            )
        }
        ctx.setTransformedData(transformedData)
    }

    if (transformedData?.sku_matrix && Array.isArray(transformedData.sku_matrix)) {
        transformedData.sku_matrix.forEach((sku: any, rowIndex: number) => {
            const rowResult =
                (variantRows[rowIndex] as Record<string, unknown>) || {}
            const rowLabel =
                transformedData.sku_matrix.length > 1
                    ? `第 ${rowIndex + 1} 个变体商品名称`
                    : '商品名称'
            const rowName = sanitizeAiBackfillFreeText(
                chineseFilteredLabels,
                rowLabel,
                rowResult['[商品名称]']
            )
            if (!rowName) return
            if (!sku || typeof sku !== 'object') return
            sku.sku_name = rowName
        })
        ctx.setTransformedData(transformedData)
    }

    const firstFeatureData = publicData
    const nextPrefilled: Record<string, string | number | string[]> = {}
    const skippedNoRaw: string[] = []
    const skippedNoMatch: Array<{ name: string; raw: unknown }> = []
    const skippedSanitized: string[] = []
    let filledCount = 0
    featureAttrs.forEach((attr: any) => {
        if (attr?.is_aspect) return
        if (FEATURE_ATTR_IDS_SKIP_AI_PREFILL.has(Number(attr.id))) return
        const attrName = String(attr?.name || attr?.id || '')
        const raw = getRawValueByFeatureName(firstFeatureData, attr?.name || '')
        if (raw === undefined) {
            skippedNoRaw.push(attrName)
            return
        }
        const mappedValue = mapAttrValueByDictionary(attr, raw)
        if (mappedValue == null) {
            skippedNoMatch.push({ name: attrName, raw })
            return
        }
        const sanitizedValue = sanitizeMappedBackfillValue(
            chineseFilteredLabels,
            attr,
            mappedValue
        )
        if (sanitizedValue == null) {
            skippedSanitized.push(attrName)
            return
        }
        nextPrefilled[String(attr.id)] = sanitizedValue
        filledCount += 1
    })
    if (filledCount > 0) {
        ctx.appendLog(`[回填] 公共特征已写入 ${filledCount} 项`)
    }
    if (skippedNoRaw.length > 0) {
        const preview = skippedNoRaw.slice(0, 10).join('、')
        ctx.appendLog(`[回填] AI未返回 ${skippedNoRaw.length} 项: ${preview}${skippedNoRaw.length > 10 ? '...' : ''}`)
    }
    if (skippedNoMatch.length > 0) {
        const preview = skippedNoMatch.slice(0, 5).map((item) => `${item.name}(${String(item.raw)})`).join('、')
        ctx.appendLog(`[回填] 字典匹配失败 ${skippedNoMatch.length} 项: ${preview}${skippedNoMatch.length > 5 ? '...' : ''}`)
    }
    if (skippedSanitized.length > 0) {
        const preview = skippedSanitized.slice(0, 10).join('、')
        ctx.appendLog(`[回填] 中文过滤后为空 ${skippedSanitized.length} 项: ${preview}${skippedSanitized.length > 10 ? '...' : ''}`)
    }
    ctx.setPrefilledFeatureAttrValues(nextPrefilled)
    ctx.ensureDefaultFeatureAttrSelections()

    if (transformedData?.sku_matrix && Array.isArray(transformedData.sku_matrix)) {
        let packFieldUpdatedCount = 0
        transformedData.sku_matrix.forEach((sku: any, rowIndex: number) => {
            if (!sku || typeof sku !== 'object') return
            const rowResult =
                (variantRows[rowIndex] as Record<string, unknown>) || {}
            const packMappings: Array<{
                key: string
                field: 'length' | 'width' | 'height' | 'weight'
            }> = [
                { key: '[包装长度，毫米*]', field: 'length' },
                { key: '[包装宽度，毫米*]', field: 'width' },
                { key: '[包装高度，毫米*]', field: 'height' },
                { key: '[毛重，克*]', field: 'weight' }
            ]
            packMappings.forEach(({ key, field }) => {
                const parsed = parseNumberValue(rowResult[key])
                if (parsed == null) return
                sku[field] = parsed
                packFieldUpdatedCount++
            })

            const nextAspectValues: Record<string, unknown> = {
                ...(sku.aspect_feature_values || {})
            }
            const aspectSkippedNoRaw: string[] = []
            const aspectSkippedNoMatch: Array<{ name: string; raw: unknown }> = []
            featureAttrs.forEach((attr: any) => {
                if (!attr?.is_aspect) return
                const attrName = String(attr?.name || attr?.id || '')
                const raw = getRawValueByFeatureName(rowResult, attr?.name || '')
                if (raw === undefined) {
                    aspectSkippedNoRaw.push(attrName)
                    return
                }
                const mappedValue = mapAttrValueByDictionary(attr, raw)
                if (mappedValue == null) {
                    aspectSkippedNoMatch.push({ name: attrName, raw })
                    return
                }
                const sanitizedValue = sanitizeMappedBackfillValue(
                    chineseFilteredLabels,
                    attr,
                    mappedValue
                )
                if (sanitizedValue == null) return
                nextAspectValues[String(attr.id)] = sanitizedValue
            })
            if (aspectSkippedNoRaw.length > 0 || aspectSkippedNoMatch.length > 0) {
                const rowLabel = `SKU${rowIndex + 1}`
                if (aspectSkippedNoRaw.length > 0) {
                    ctx.appendLog(`[回填] ${rowLabel} 变体特征 AI未返回 ${aspectSkippedNoRaw.length} 项: ${aspectSkippedNoRaw.join('、')}`)
                }
                if (aspectSkippedNoMatch.length > 0) {
                    const preview = aspectSkippedNoMatch.map((item) => `${item.name}(${String(item.raw)})`).join('、')
                    ctx.appendLog(`[回填] ${rowLabel} 变体特征字典匹配失败 ${aspectSkippedNoMatch.length} 项: ${preview}`)
                }
            }
            sku.aspect_feature_values = nextAspectValues
        })
        ctx.appendLog(`[回填] 已回填 SKU 包装尺寸/重量字段 ${packFieldUpdatedCount} 项`)
        ctx.setTransformedData(transformedData)
    }

    if (chineseFilteredLabels.length > 0) {
        // 中文过滤汇总打印
        console.log(`[回填] 已过滤 ${chineseFilteredLabels.length} 处中文`, chineseFilteredLabels)
    }

    ctx.ensureRandomModelNameFeatureAttrs()
    ctx.appendLog('[回填] 已根据 resultText 回填特征属性')
    ctx.appendLog('[成功] AI帮填完成')
    if (mode === 'recover') {
        ctx.onRecoverComplete?.()
    }
}

// —— AI 结果查询与恢复 ——

/** 按 sessionId 拉取帮填结果 JSON（SSE 失败重取、批量轮询共用） */
export const fetchAiFillResultTextBySession = async (sessionId: string): Promise<{
    ok: boolean
    resultJson?: unknown
    message?: string
}> => {
    const res = await apiService.advancedAiEditResult(sessionId)
    if (res.code !== 200) {
        return { ok: false, message: res.msg || res.data?.errorMsg }
    }
    let resultText: unknown = res.data?.resultText || '{}'
    if (typeof resultText === 'string') {
        resultText = JSON.parse(resultText)
    }
    return { ok: true, resultJson: resultText }
}

/** SSE 失败后按 sessionId 查询并回填特征值 */
export const fetchAndApplyAiFillResultBySession = async (
    sessionId: string,
    ctx: AiApplyContext,
    mode?: 'recover'
): Promise<{ ok: boolean; message?: string }> => {
    try {
        const fetched = await fetchAiFillResultTextBySession(sessionId)
        if (!fetched.ok) {
            return { ok: false, message: fetched.message }
        }
        applyAiResultJsonToFeatureValues(fetched.resultJson, ctx, mode)
        return { ok: true }
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
}

/** 刷新页面后检测服务端是否已有该 offerId 的帮填结果 */
export const checkServerAiFillRestoreAvailable = async (offerId: string): Promise<boolean> => {
    const res = await apiService.advancedAiEditRestoreResult(offerId)
    return res.code === 200
}

/** 刷新页面后按 offerId 从服务端恢复帮填结果 */
export const restoreAiFillResultFromServer = async (
    offerId: string,
    ctx: AiApplyContext
): Promise<{ ok: boolean; message?: string }> => {
    const res = await apiService.advancedAiEditRestoreResult(offerId)
    if (res.code !== 200) {
        return { ok: false, message: res.msg || res.data?.errorMsg }
    }
    let bizResult: unknown = res.data?.bizResult || '{}'
    if (typeof bizResult === 'string') {
        bizResult = JSON.parse(bizResult)
    }
    const resultJson = (bizResult as { resultJson?: unknown })?.resultJson
    applyAiResultJsonToFeatureValues(resultJson, ctx, 'recover')
    return { ok: true }
}

// —— SSE 消费 ——

export const consumeAiAgentSse = async (
    sessionId: string,
    ctx: AiSseContext
): Promise<string> => {
    return new Promise((resolve, reject) => {
        ctx.setSessionId(sessionId)
        ctx.setRejectPromise(reject)
        if (ctx.getStopRequested()) {
            ctx.setRejectPromise(null)
            ctx.setSessionId(null)
            reject(ctx.createStoppedError())
            return
        }

        // 动态跟踪各节点流式输出，key 优先 nodeId 避免同名节点冲突
        const nodeOrder: string[] = []
        const nodeState: Record<string, { label: string; result: string; reasoningContent: string }> = {}
        const loggedProgressKeys = new Set<string>()
        let renderedOutput = ''
        let lastRenderedLen = 0
        let settled = false

        const closeSseConnectionOnly = () => {
            ctx.closeEventSource()
        }

        // setTimeout 做 15s 无消息重连；thinkingInterval 在等待期间输出思考提示
        let messageTimeout: ReturnType<typeof setTimeout> | null = null
        let thinkingInterval: ReturnType<typeof setInterval> | null = null
        let messageTimeoutCount = 0

        const clearMessageTimeout = () => {
            if (messageTimeout) {
                clearTimeout(messageTimeout)
                messageTimeout = null
            }
            if (thinkingInterval) {
                clearInterval(thinkingInterval)
                thinkingInterval = null
            }
        }

        const cleanupAiAgentSse = (options?: { keepSessionId?: boolean }) => {
            // 终态收口时必须清掉重连/思考定时器，避免服务端终态错误后仍触发重连
            clearMessageTimeout()
            ctx.closeEventSource()
            if (!options?.keepSessionId) {
                ctx.setSessionId(null)
            }
            ctx.setRejectPromise(null)
        }

        const rejectAiAgentSse = (error: Error, options?: { keepSessionId?: boolean }) => {
            if (settled) return
            settled = true
            cleanupAiAgentSse(options)
            reject(normalizeUnknownError(error, 'AI 智能体任务执行失败'))
        }

        const resolveAiAgentSse = (result: string) => {
            if (settled) return
            settled = true
            cleanupAiAgentSse()
            resolve(result)
        }

        const getNodeStateKey = (event: AiSseNodeEvent) => event.nodeId || event.nodeName

        const ensureNodeState = (event: AiSseNodeEvent) => {
            const key = getNodeStateKey(event)
            if (!nodeState[key]) {
                nodeState[key] = { label: event.nodeName, result: '', reasoningContent: '' }
                nodeOrder.push(key)
            }
            return nodeState[key]!
        }

        const appendNodeProgressLog = (event: AiSseNodeEvent) => {
            const status = event.nodeStatus.toLowerCase()
            if (!status) return
            const progressKey = `${getNodeStateKey(event)}:${status}`
            if (loggedProgressKeys.has(progressKey)) return
            if (status === 'executing') {
                loggedProgressKeys.add(progressKey)
                ctx.appendLog(`[节点] ${event.nodeName} executing`)
                return
            }
            if (status === 'success' || status === 'failed' || status === 'fail') {
                loggedProgressKeys.add(progressKey)
                const timeSuffix = event.nodeExecTime ? ` (${event.nodeExecTime})` : ''
                ctx.appendLog(`[节点] ${event.nodeName} ${status}${timeSuffix}`)
            }
        }

        const renderOutput = () => {
            const parts = nodeOrder
                .filter((key) => {
                    const state = nodeState[key]
                    return Boolean(state?.result || state?.reasoningContent)
                })
                .map((key) => {
                    const state = nodeState[key]!
                    return [
                        `=== ${state.label} ===`,
                        'reasoningContent:',
                        state.reasoningContent || '',
                        '',
                        'result:',
                        state.result || ''
                    ].join('\n')
                })
            renderedOutput = parts.join('\n\n')
            if (renderedOutput.length > lastRenderedLen) {
                ctx.appendLogDelta(renderedOutput.slice(lastRenderedLen))
                lastRenderedLen = renderedOutput.length
            }
        }

        const consumePayload = (payload: unknown) => {
            const events = extractNodeEventsFromSsePayload(payload)
            if (events.length === 0) {
                // 适配纯文本状态消息，如 {"message":"AI Thinking...","timestamp":...}
                const parsed = parseSseEventData(payload) as Record<string, unknown> | null
                const msg = parsed && typeof parsed === 'object' ? parsed.message : null
                if (typeof msg === 'string' && msg.trim()) {
                    const parsedMsg = safeParseJson(msg)
                    // message 不是节点数组时，按纯文本写入日志
                    if (!Array.isArray(parsedMsg)) {
                        ctx.appendLog(`[SSE] ${msg.trim()}`)
                    }
                }
                return
            }
            events.forEach((event) => {
                appendNodeProgressLog(event)
                if (!event.result && !event.reasoningContent) return
                const state = ensureNodeState(event)
                const resultInc = calcIncrement(state.result, event.result)
                const reasoningInc = calcIncrement(state.reasoningContent, event.reasoningContent)
                state.result += resultInc
                state.reasoningContent += reasoningInc
            })
            renderOutput()
        }

        ctx.closeEventSource()

        const startMessageTimeout = () => {
            // 业务终态后不再启动心跳重连
            if (settled) return
            clearMessageTimeout()
            if (messageTimeoutCount >= 5) {
                ctx.appendLog('[SSE] 网络波动，智能体连接已断开，请稍后点击【恢复帮填信息】获取结果')
                ctx.onShowRecoverButton()
                // 重连耗尽后最后一次拉取结果，避免 Promise 永不 settle 卡住批量帮填
                void getSseResult(sessionId)
                return
            }
            // 15 秒无消息则重连；等待期间每 3 秒输出一次思考提示
            thinkingInterval = setInterval(() => {
                ctx.appendLog('[SSE] AI Thinking...')
            }, 3000)
            messageTimeout = setTimeout(() => {
                if (settled) {
                    clearMessageTimeout()
                    return
                }
                clearMessageTimeout()
                messageTimeoutCount++
                // 重连仅关闭旧连接，保留 sessionId 供后续手动恢复
                closeSseConnectionOnly()
                if (messageTimeoutCount >= 5) {
                    ctx.appendLog('[SSE] 网络波动，智能体连接已断开，请稍后点击【恢复帮填信息】获取结果')
                    ctx.onShowRecoverButton()
                    void getSseResult(sessionId)
                    return
                }
                startSSE()
            }, 15000)
        }

        const getSseResult = async (sid: string) => {
            if (settled) return
            try {
                const fetched = await fetchAiFillResultTextBySession(sid)
                if (fetched.ok) {
                    ctx.appendLog('[SSE] 查询AI思考结果成功，开始回填特征值')
                    ctx.applyAiResult(fetched.resultJson)
                    resolveAiAgentSse(renderedOutput)
                    return
                }
                ctx.appendLog('[SSE] 查询AI思考结果失败，请稍后点击【恢复帮填信息】获取结果')
                ctx.onShowRecoverButton()
                if (fetched.message) {
                    ctx.appendLog('[SSE] 错误信息：' + fetched.message)
                }
                rejectAiAgentSse(new Error(fetched.message || '查询AI思考结果失败'), { keepSessionId: true })
            } catch (error) {
                rejectAiAgentSse(error instanceof Error ? error : new Error(String(error)), { keepSessionId: true })
            }
        }

        const startSSE = () => {
            // 已进入终态时禁止再次建连
            if (settled) return
            createSseStream(sessionId)
                .then((es) => {
                    if (settled) {
                        es.close()
                        return
                    }
                    ctx.setEventSource(es)
                    startMessageTimeout()
                    es.addEventListener('connected', () => {
                        ctx.appendLog('[SSE] AI Thinking...')
                    })
                    es.addEventListener('message', (event: MessageEvent) => {
                        clearMessageTimeout()
                        const payload = parseSseEventData(event.data)
                        consumePayload(payload)
                        startMessageTimeout()
                    })
                    es.addEventListener('complete', (event: MessageEvent) => {
                        clearMessageTimeout()
                        const payload = parseSseEventData(event.data) as Record<string, unknown>
                        consumePayload(payload)
                        if (payload?.success === true) {
                            ctx.appendLog('[SSE] AI思考已完成，开始查询结果')
                        }
                    })
                    es.addEventListener('error', (event: MessageEvent) => {
                        clearMessageTimeout()
                        const payload = parseSseEventData((event as MessageEvent & { data?: unknown }).data)
                        consumePayload(payload)
                        const payloadObj = payload as Record<string, unknown>
                        if (payloadObj?.errorCode === 'SESSION_ALREADY_ENDED') {
                            ctx.appendLog('[SSE] AI思考已完成，开始查询结果')
                            void getSseResult(sessionId)
                            return
                        }
                        // 兼容旧服务的终态错误码：转换为本地服务提示并停止重连
                        if (payloadObj?.errorCode === 'INSUFFICIENT_POINTS') {
                            const errorMessage = '本地 AI 服务暂不可用，请检查服务配置后重试'
                            ctx.appendLog(`[error] ${JSON.stringify(payload)}`)
                            ctx.appendLog(`[SSE] ${errorMessage}`)
                            rejectAiAgentSse(new Error(errorMessage))
                            return
                        }
                        ctx.appendLog(
                            `[error] ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`
                        )
                        ctx.appendLog(
                            '[SSE] 网络波动，智能体连接已断开，请稍后点击【恢复帮填信息】获取结果'
                        )
                        ctx.onShowRecoverButton()
                        const errorMessage =
                            typeof payload === 'string'
                                ? payload
                                : String(
                                      payloadObj?.msg ||
                                          payloadObj?.message ||
                                          payloadObj?.error ||
                                          'AI 任务执行失败'
                                  )
                        rejectAiAgentSse(new Error(errorMessage), { keepSessionId: true })
                    })
                    es.addEventListener('cancel', () => {
                        clearMessageTimeout()
                        rejectAiAgentSse(new Error('AI 任务被取消'))
                    })
                    es.addEventListener('end', (event: MessageEvent) => {
                        clearMessageTimeout()
                        const payload = parseSseEventData(
                            (event as MessageEvent & { data?: unknown }).data
                        ) as Record<string, unknown>
                        if (payload && typeof payload.successCount === 'number') {
                            const failedCount =
                                typeof payload.failedCount === 'number' ? payload.failedCount : 0
                            ctx.appendLog(`[SSE] 任务汇总：成功 ${payload.successCount}，失败 ${failedCount}`)
                        }
                        // 须等 getSseResult 回填完成后再 resolve，否则批量帮填会在回填前写草稿
                        void getSseResult(sessionId)
                    })
                    es.onerror = () => {
                        clearMessageTimeout()
                        if (settled) return
                        ctx.appendLog('[SSE] 网络波动，智能体连接失败，正在查询AI任务状态')
                        void getSseResult(sessionId)
                    }
                })
                .catch((error) => {
                    clearMessageTimeout()
                    rejectAiAgentSse(error instanceof Error ? error : new Error(String(error)))
                })
        }

        startSSE()
    })
}

// —— AI 启动 payload ——

export function buildAiFillPayload(
    data1688: unknown,
    featureAttrs: unknown[],
    collectPlatform: string,
    offerId: string
) {
    return {
        appCode: 'ozonAiNoThinkMultiNode',
        collectPlatform,
        platform: 'ozon',
        offerId,
        bizInput: {
            data_1688: data1688,
            ozon_attr: featureAttrs
        },
        incrementalOutput: true
    }
}

// —— 上架 payload ——

const buildAttributeValues = (
    attr: any,
    raw: unknown
): Array<{ dictionary_value_id?: number; value?: string }> => {
    if (raw == null || raw === '') return []
    const options = Array.isArray(attr?.dictionary_values) ? attr.dictionary_values : []
    const toDictId = (item: unknown): number | null => {
        const text = String(item ?? '').trim()
        if (!text) return null
        const byId = options.find((opt: any) => String(opt?.id) === text)
        if (byId) return Number(byId.id)
        const byText = options.find(
            (opt: any) =>
                normalizeFeatureName(opt?.value) === normalizeFeatureName(text)
        )
        if (byText) return Number(byText.id)
        return null
    }

    const rawList = Array.isArray(raw) ? raw : [raw]
    if (attr?.dictionary_id && Number(attr.dictionary_id) !== 0) {
        return rawList
            .map((item) => toDictId(item))
            .filter((id): id is number => id != null)
            .map((id) => ({ dictionary_value_id: id }))
    }

    return rawList
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .map((item) => ({ value: item }))
}

const getPublicAttrRawValue = (
    attr: any,
    firstFeatureData: Record<string, unknown>,
    getFeatureAttrExistingValue: (attr: any) => string | number | string[] | undefined
): unknown => {
    const existingValue = getFeatureAttrExistingValue(attr)
    if (existingValue !== undefined) return existingValue
    return getRawValueByFeatureName(firstFeatureData || {}, attr?.name || '')
}

export const buildV2Attributes = (
    sku: any,
    firstFeatureData: Record<string, unknown>,
    rootDescription: string,
    variantIndex: number,
    ctx: Pick<
        OzonSubmitContext,
        'featureAttrs' | 'transformedData' | 'skuVideoUrlList' | 'getFeatureAttrExistingValue'
    >
) => {
    const attrs: any[] = []
    const descText = String(
        sku?.[SKU_VARIANT_DESCRIPTION_STORAGE_KEY] || rootDescription || ''
    ).trim()
    const featureScopeMap =
        ctx.transformedData?.global_data?.[FEATURE_SCOPE_STORAGE_KEY] || {}
    const variantFeatureValues = sku?.[SKU_VARIANT_FEATURE_STORAGE_KEY] || {}

    ;(ctx.featureAttrs || []).forEach((attr: any) => {
        const isIntroAttr = normalizeFeatureName(attr?.name || '') === '简介'
        const attrId = Number(attr?.id)
        let raw = attr?.is_aspect
            ? sku?.aspect_feature_values?.[String(attr.id)]
            : featureScopeMap?.[String(attr?.id)] === 'variant'
              ? variantFeatureValues?.[String(attr?.id)]
              : getPublicAttrRawValue(attr, firstFeatureData, ctx.getFeatureAttrExistingValue)

        if (attrId === FEATURE_ATTR_ID_VIDEO_URL) {
            const videoRaw = String(ctx.skuVideoUrlList[variantIndex] || '').trim()
            if (videoRaw) raw = videoRaw
        }
        if (isIntroAttr && descText) {
            raw = descText
        }
        const values = buildAttributeValues(attr, raw)
        if (!values.length) return
        const row: Record<string, unknown> = {
            id: attrId,
            values
        }
        if (attr.attribute_complex_id != null) {
            row.complex_id = Number(attr.attribute_complex_id)
        }
        attrs.push(row)
        if (row.id === FEATURE_ATTR_ID_VIDEO_URL) {
            const firstVal = values[0]?.value
            const videoName = String(firstVal || '')
                .split('/')
                .pop()
                ?.split('.')[0]
            const value = 'video_' + (videoName || Date.now())
            attrs.push({
                complex_id: 100001,
                id: 21837,
                values: [{ value }]
            })
        }
    })
    return attrs
}

export const resolveSubmitImageUrlToOss = async (
    rawUrl: string,
    cache: Map<string, string>,
    variantIndex: number,
    imageIndex: number
): Promise<string> => {
    const url = String(rawUrl || '').trim()
    if (!url) return ''
    const base = `edited_image_v${variantIndex + 1}_${imageIndex + 1}_${Date.now()}`
    return ensureHttpImageUrlOnOss(url, base, cache)
}

export const normalizeSubmitImagesToOss = async (
    urls: string[],
    cache: Map<string, string>,
    variantIndex: number
): Promise<string[]> => {
    const next: string[] = []
    for (let i = 0; i < urls.length; i++) {
        const resolved = await resolveSubmitImageUrlToOss(urls[i], cache, variantIndex, i)
        if (!resolved) continue
        if (!next.includes(resolved)) next.push(resolved)
    }
    return next
}

export const buildOzonSubmitPayload = async (ctx: OzonSubmitContext) => {
    const selectedCategoryTemplate = ctx.categoryTemplates.find(
        (t) => t.id === ctx.categoryTemplateId
    )
    const categoryMeta: Record<string, unknown> =
        (selectedCategoryTemplate?.data?.metadata as Record<string, unknown>) || {}
    const descriptionCategoryId = toLongOrNull(
        categoryMeta.descriptionCategoryId ?? categoryMeta.level2Id
    )
    const typeId = toLongOrNull(categoryMeta.typeId)

    const root = JSON.parse(JSON.stringify(ctx.transformedData || {}))
    let aiRowsFallback: any[] = []
    if (!Array.isArray(ctx.aiResultJsonList) || ctx.aiResultJsonList.length === 0) {
        try {
            const parsed = ctx.parseAiOutputFallback?.()
            if (Array.isArray(parsed)) {
                aiRowsFallback = parsed
            }
        } catch {
            aiRowsFallback = []
        }
    }
    const firstFeatureData = ctx.aiResultPublicFeatureData || {}
    const basicName = String(root?.global_data?.product_name || '').trim()
    const basicDesc = String(root?.global_data?.description_clean_text || '').trim()
    const submitImageUploadCache = new Map<string, string>()

    const items = await Promise.all(
        (root?.sku_matrix || []).map(async (sku: any, index: number) => {
            const priceValue = sku?.sale_price ?? sku?.price_amount ?? 0
            const imagesRaw = (sku.skuImgList || []).map((item: any) => item.transformUrl)
            const images = await normalizeSubmitImagesToOss(
                imagesRaw,
                submitImageUploadCache,
                index
            )
            const prefix = String(sku?.offerid_prefix || generateDefaultOfferidPrefix())
            const aiResultRow =
                ctx.aiResultJsonList?.[index] || aiRowsFallback[index] || {}
            const nameFromAi = String(aiResultRow?.['[商品名称]'] || '').trim()
            const rowTitle = String(sku?.sku_name || '')
                .replace(/\s+/g, ' ')
                .trim()
            const itemName = rowTitle || basicName || nameFromAi || `SKU-${index + 1}`

            return {
                attributes: buildV2Attributes(
                    sku,
                    firstFeatureData,
                    basicDesc,
                    index,
                    ctx
                ),
                description_category_id: descriptionCategoryId,
                new_description_category_id: null,
                type_id: typeId,
                currency_code: 'CNY',
                dimension_unit: 'mm',
                weight_unit: 'g',
                depth: toIntOrNull(sku?.length),
                height: toIntOrNull(sku?.height),
                width: toIntOrNull(sku?.width),
                weight: toIntOrNull(sku?.weight),
                price: toPriceString(priceValue),
                old_price: '0',
                name: itemName,
                offer_id: prefix,
                primary_image: images[0] || '',
                images
            }
        })
    )

    return {
        shopWarehouseConfigs: ctx.selectedShopIds.map((shopId) => {
            const row = ctx.shopWarehouseInventory[shopId]
            return {
                shopId,
                warehouseId: row?.warehouseId ?? null,
                stock: row?.quantity ?? 0
            }
        }),
        items,
        originalLink: root?.meta_info?.source_url || ''
    }
}

// —— 提交前校验 ——

const isJsonRichTextFeatureAttr = (attr: any): boolean => {
    return normalizeFeatureName(attr?.name || '').includes('JSON富内容')
}

const isIntroFeatureAttr = (attr: any): boolean => {
    return normalizeFeatureName(attr?.name || '').includes('简介')
}

const isManagedBySkuMediaAttr = (attr: any): boolean => {
    return MANAGED_BY_SKU_MEDIA_ATTR_IDS.has(Number(attr?.id))
}

const isFeatureAttrFreeTextInput = (attr: any): boolean => {
    return Number(attr?.dictionary_id ?? 0) === 0
}

const shouldCheckFeatureAttrChinese = (attr: any): boolean => {
    if (!attr) return false
    if (FEATURE_ATTR_IDS_ALLOW_CHINESE.has(Number(attr?.id))) return false
    if (isManagedBySkuMediaAttr(attr)) return false
    if (isIntroFeatureAttr(attr)) return false
    if (isJsonRichTextFeatureAttr(attr)) return true
    return isFeatureAttrFreeTextInput(attr)
}

const getSkuTitleFieldKey = (rowIndex: number) => `title-${rowIndex}`
const getSkuOfferidPrefixFieldKey = (rowIndex: number) => `offerid-prefix-${rowIndex}`
const getSkuAspectFieldKey = (rowIndex: number, attrId: number) => `${rowIndex}-${attrId}`
const getSkuVariantDescriptionFieldKey = (rowIndex: number) => `description-${rowIndex}`
const getSkuVariantFeatureFieldKey = (rowIndex: number, attrId: number) =>
    `variant-${rowIndex}-${attrId}`

const truncateChineseFieldPreview = (raw: unknown): string => {
    const text = Array.isArray(raw)
        ? raw.map((v) => String(v ?? '').trim()).filter(Boolean).join('、')
        : String(raw ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return text
}

const pushChineseFieldMark = (
    list: ChineseFieldMark[],
    seen: Set<string>,
    label: string,
    raw: unknown,
    mark?: Pick<ChineseFieldMark, 'attrId' | 'skuFieldKey'>
) => {
    if (!hasChineseChar(raw)) return
    const value = truncateChineseFieldPreview(raw)
    if (!value) return
    const dedupeKey = `${label}\0${value}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    list.push({ label, value, ...mark })
}

const readCommonFeatureAttrRaw = (
    ctx: SubmitValidateContext,
    attr: any
): unknown => {
    const attrId = Number(attr?.id)
    const wbText = ctx.workbenchReader?.getFeatureAttrValue?.(attrId)
    if (wbText != null && String(wbText).trim() !== '') {
        return attr?.is_collection ? asArrayValue(wbText) : wbText
    }
    return ctx.getFeatureAttrExistingValue(attr)
}

const readSkuAspectFeatureRaw = (
    ctx: SubmitValidateContext,
    rowIndex: number,
    attr: any
): unknown => {
    const attrId = Number(attr?.id)
    const wbText = ctx.workbenchReader?.getSkuAspectString?.(rowIndex, attrId)
    if (wbText != null && String(wbText).trim() !== '') {
        return attr?.is_collection ? asArrayValue(wbText) : wbText
    }
    const sku = ctx.transformedData?.sku_matrix?.[rowIndex]
    return sku?.aspect_feature_values?.[String(attr.id)]
}

const readSkuVariantFeatureRaw = (
    ctx: SubmitValidateContext,
    rowIndex: number,
    attr: any
): unknown => {
    const attrId = Number(attr?.id)
    const wbText = ctx.workbenchReader?.getSkuVariantFeatureValue?.(rowIndex, attrId)
    if (wbText != null && String(wbText).trim() !== '') {
        return attr?.is_collection ? asArrayValue(wbText) : wbText
    }
    const sku = ctx.transformedData?.sku_matrix?.[rowIndex]
    return sku?.[SKU_VARIANT_FEATURE_STORAGE_KEY]?.[String(attr.id)]
}

export const scanChineseFieldsBeforeSubmit = (
    ctx: SubmitValidateContext
): ChineseFieldMark[] => {
    const list: ChineseFieldMark[] = []
    const seen = new Set<string>()
    const root = ctx.transformedData
    const globalData = root?.global_data || {}
    const featureScopeMap = globalData[FEATURE_SCOPE_STORAGE_KEY] || {}
    const fieldScopeMap = globalData[FIELD_SCOPE_STORAGE_KEY] || {}
    const skuList = Array.isArray(root?.sku_matrix) ? root.sku_matrix : []
    const wb = ctx.workbenchReader

    if (fieldScopeMap?.description !== 'variant') {
        pushChineseFieldMark(list, seen, '商品描述', globalData.description_clean_text, {
            attrId: FEATURE_ATTR_ID_DESCRIPTION
        })
    }

    skuList.forEach((sku: any, index: number) => {
        const skuName = wb?.getSkuTitleValue?.(sku) ?? sku?.sku_name
        const label = skuList.length > 1 ? `第 ${index + 1} 个变体商品名称` : '商品标题'
        pushChineseFieldMark(list, seen, label, skuName, {
            skuFieldKey: getSkuTitleFieldKey(index)
        })
    })

    skuList.forEach((sku: any, index: number) => {
        const prefix = sku?.offerid_prefix
        const label = skuList.length > 1 ? `第 ${index + 1} 个变体的货号` : '货号'
        pushChineseFieldMark(list, seen, label, prefix, {
            skuFieldKey: getSkuOfferidPrefixFieldKey(index)
        })
    })

    if (fieldScopeMap?.description === 'variant') {
        skuList.forEach((sku: any, index: number) => {
            const desc =
                wb?.getSkuVariantDescription?.(index) ??
                sku?.[SKU_VARIANT_DESCRIPTION_STORAGE_KEY]
            pushChineseFieldMark(list, seen, `第 ${index + 1} 个变体的描述`, desc, {
                skuFieldKey: getSkuVariantDescriptionFieldKey(index)
            })
        })
    }

    ;(ctx.featureAttrs || []).forEach((attr: any) => {
        if (!shouldCheckFeatureAttrChinese(attr)) return
        const attrId = Number(attr.id)
        const attrLabel = attr?.name || String(attr.id)

        if (isJsonRichTextFeatureAttr(attr)) {
            skuList.forEach((_sku: any, index: number) => {
                const raw =
                    wb?.getSkuJsonRichText?.(index) ??
                    ctx.getVariantJsonRichTextValue?.(index, String(attr.id))
                if (!String(raw ?? '').trim()) return
                pushChineseFieldMark(
                    list,
                    seen,
                    `第 ${index + 1} 个变体的「${attrLabel}」`,
                    raw,
                    { skuFieldKey: getSkuVariantFeatureFieldKey(index, attrId) }
                )
            })
            return
        }

        if (attr?.is_aspect) {
            skuList.forEach((_sku: any, index: number) => {
                const raw = readSkuAspectFeatureRaw(ctx, index, attr)
                if (!isAttrValueFilled(attr, raw)) return
                pushChineseFieldMark(
                    list,
                    seen,
                    `第 ${index + 1} 个变体的特征「${attrLabel}」`,
                    raw,
                    { skuFieldKey: getSkuAspectFieldKey(index, attrId) }
                )
            })
            return
        }

        if (featureScopeMap?.[String(attr.id)] === 'variant') {
            skuList.forEach((_sku: any, index: number) => {
                const raw = readSkuVariantFeatureRaw(ctx, index, attr)
                if (!isAttrValueFilled(attr, raw)) return
                pushChineseFieldMark(
                    list,
                    seen,
                    `第 ${index + 1} 个变体的特征「${attrLabel}」`,
                    raw,
                    { skuFieldKey: getSkuVariantFeatureFieldKey(index, attrId) }
                )
            })
            return
        }

        const raw = readCommonFeatureAttrRaw(ctx, attr)
        if (!isAttrValueFilled(attr, raw)) return
        pushChineseFieldMark(list, seen, `公共特征「${attrLabel}」`, raw, { attrId })
    })

    return list
}

export type FeatureAttrValidationResult = {
    valid: boolean
    message?: string
    errors: Record<string, string>
}

export const validateFeatureAttrsBeforeSubmit = (
    ctx: SubmitValidateContext
): FeatureAttrValidationResult => {
    const errors: Record<string, string> = {}
    let requiredMissingCount = 0
    const featureScopeMap =
        ctx.transformedData?.global_data?.[FEATURE_SCOPE_STORAGE_KEY] || {}

    ;(ctx.featureAttrs || []).forEach((attr: any) => {
        if (attr?.is_aspect) return
        const key = String(attr?.id ?? '')
        if (featureScopeMap?.[key] === 'variant') return
        const raw = ctx.getFeatureAttrExistingValue(attr)
        if (isJsonRichTextFeatureAttr(attr)) return

        if (attr?.is_required === true && !isAttrValueFilled(attr, raw)) {
            errors[key] = '必填项不能为空'
            requiredMissingCount++
        }
    })

    return {
        valid: requiredMissingCount === 0,
        message:
            requiredMissingCount === 0
                ? undefined
                : `属性校验未通过：必填属性未填写 ${requiredMissingCount} 项`,
        errors
    }
}

export const isAspectValueFilled = (raw: unknown): boolean => {
    if (Array.isArray(raw)) {
        return raw.some((item) => String(item ?? '').trim() !== '')
    }
    if (typeof raw === 'string') {
        return raw.trim() !== ''
    }
    if (raw == null) return false
    return String(raw).trim() !== ''
}

export type VariantAspectIssueType =
    | 'missing_any_aspect'
    | 'missing_required_aspect'
    | 'missing_description'
    | 'missing_variant_attr'

export type VariantAspectValidationItem = {
    variantIndex: number
    issueType: VariantAspectIssueType
    attrName?: string
    attrId?: number
    availableAspectNames?: string[]
}

export type VariantAspectValidationPayload = {
    message: string
    items: VariantAspectValidationItem[]
}

export const validateSkuAspectBeforeSubmit = (
    ctx: Pick<SubmitValidateContext, 'featureAttrs' | 'transformedData'>
): { valid: boolean; message?: string; items?: VariantAspectValidationItem[] } => {
    const attrs = (ctx.featureAttrs || []).filter((a: any) => a?.is_aspect === true)
    const featureScopeMap =
        ctx.transformedData?.global_data?.[FEATURE_SCOPE_STORAGE_KEY] || {}
    const variantAttrs = (ctx.featureAttrs || []).filter(
        (a: any) => !a?.is_aspect && featureScopeMap?.[String(a?.id)] === 'variant'
    )
    const descriptionVariantEnabled =
        ctx.transformedData?.global_data?.[FIELD_SCOPE_STORAGE_KEY]?.description ===
        'variant'
    if (!attrs.length && !variantAttrs.length && !descriptionVariantEnabled) {
        return { valid: true }
    }
    const skuList = ctx.transformedData?.sku_matrix
    if (!Array.isArray(skuList) || !skuList.length) return { valid: true }

    const items: VariantAspectValidationItem[] = []
    const availableAspectNames = attrs.map((a: any) => String(a?.name || '变体特征').trim()).filter(Boolean)

    for (let i = 0; i < skuList.length; i++) {
        const sku = skuList[i] as Record<string, unknown>
        const aspectValues = sku?.aspect_feature_values as Record<string, unknown> | undefined
        const variantFeatureValues =
            (sku?.[SKU_VARIANT_FEATURE_STORAGE_KEY] as Record<string, unknown>) || {}
        const variantIndex = i + 1

        for (const attr of attrs) {
            if (attr?.is_required === true) {
                const value = aspectValues?.[String(attr.id)]
                if (!isAspectValueFilled(value)) {
                    items.push({
                        variantIndex,
                        issueType: 'missing_required_aspect',
                        attrName: String(attr?.name || '变体特征'),
                        attrId: Number(attr?.id),
                    })
                }
            }
        }

        if (attrs.length > 0) {
            const hasAtLeastOneAspect = attrs.some((attr: any) =>
                isAspectValueFilled(aspectValues?.[String(attr.id)])
            )
            if (!hasAtLeastOneAspect) {
                items.push({
                    variantIndex,
                    issueType: 'missing_any_aspect',
                    availableAspectNames: availableAspectNames.length ? availableAspectNames : undefined,
                })
            }
        }

        if (descriptionVariantEnabled) {
            const descriptionValue = String(
                sku?.[SKU_VARIANT_DESCRIPTION_STORAGE_KEY] || ''
            ).trim()
            if (!descriptionValue) {
                items.push({
                    variantIndex,
                    issueType: 'missing_description',
                    attrName: '变体描述',
                })
            }
        }

        for (const attr of variantAttrs) {
            const value = variantFeatureValues?.[String(attr.id)]
            if (attr?.is_required === true && !isAspectValueFilled(value)) {
                items.push({
                    variantIndex,
                    issueType: 'missing_variant_attr',
                    attrName: String(attr?.name || '变体属性'),
                    attrId: Number(attr?.id),
                })
            }
        }
    }

    if (!items.length) return { valid: true }

    const variantText = [...new Set(items.map((item) => item.variantIndex))]
        .sort((a, b) => a - b)
        .map((index) => `第${index}个变体`)
        .join('、')
    return {
        valid: false,
        message: `${variantText}的变体特征未完善，请补充后重试`,
        items,
    }
}

/** 将变体特征校验结果转为 ValidationWarningModal 列表项 */
export const buildVariantAspectWarningFields = (
    items: VariantAspectValidationItem[]
): Array<{ label: string; value: string }> => {
    return items.map((item) => {
        const label = `第${item.variantIndex}个变体`
        switch (item.issueType) {
            case 'missing_any_aspect': {
                const names = (item.availableAspectNames || []).join('、')
                const value = names
                    ? `未填写变体特征（可选：${names}）`
                    : '未填写变体特征'
                return { label, value }
            }
            case 'missing_required_aspect':
                return { label, value: `${item.attrName || '变体特征'} 为必填项` }
            case 'missing_description':
                return { label, value: '变体描述不能为空' }
            case 'missing_variant_attr':
                return { label, value: `${item.attrName || '变体属性'} 为必填项` }
            default:
                return { label, value: '变体信息未完善' }
        }
    })
}

/** Ozon 单变体图片上限（超出后后台会报错） */
export const MAX_VARIANT_IMAGE_COUNT = 29

export type VariantImageCountExceededItem = {
    variantIndex: number
    imageCount: number
}

export type VariantImageCountExceededPayload = {
    message: string
    items: VariantImageCountExceededItem[]
}

/** 上架前校验各变体图片数量是否超出 Ozon 上限 */
export const validateVariantImageCountBeforeSubmit = (
    ctx: Pick<SubmitValidateContext, 'transformedData'>
): { valid: boolean; message?: string; items?: VariantImageCountExceededItem[] } => {
    const skuList = ctx.transformedData?.sku_matrix
    if (!Array.isArray(skuList) || !skuList.length) return { valid: true }

    const items: VariantImageCountExceededItem[] = []
    skuList.forEach((sku: unknown, index: number) => {
        const row = sku as { skuImgList?: unknown[] }
        const imgList = Array.isArray(row?.skuImgList) ? row.skuImgList : []
        if (imgList.length > MAX_VARIANT_IMAGE_COUNT) {
            items.push({ variantIndex: index + 1, imageCount: imgList.length })
        }
    })
    if (!items.length) return { valid: true }

    const variantText = items.map((item) => `第${item.variantIndex}个变体`).join('、')
    return {
        valid: false,
        message: `${variantText}的图片数量超过${MAX_VARIANT_IMAGE_COUNT}张，请调整后重试`,
        items,
    }
}

/** 将变体图片超限结果转为 ValidationWarningModal 列表项 */
export const buildVariantImageCountWarningFields = (
    items: VariantImageCountExceededItem[]
): Array<{ label: string; value: string }> => {
    return items.map(({ variantIndex, imageCount }) => ({
        label: `第${variantIndex}个变体`,
        value: `${imageCount}张（限${MAX_VARIANT_IMAGE_COUNT}张）`,
    }))
}

// —— 上传与恢复 ——

/** aiCreateV2 单店铺上架成功的 message 标识 */
export const OZON_LISTING_SUCCESS_MESSAGE = '上品成功'

export interface OzonShopListingResult {
    shopId: number
    message: string
    success: boolean
    taskId?: number
}

export interface OzonListingParsedResult {
    shopResults: OzonShopListingResult[]
    allSuccess: boolean
    failures: OzonShopListingResult[]
}

/**
 * 解析 aiCreateV2 返回的 data 数组：仅以 message ===「上品成功」判定上架成功
 */
export function parseOzonAiCreateV2Response(data: unknown): OzonListingParsedResult {
    if (!Array.isArray(data) || data.length === 0) {
        const fallback: OzonShopListingResult = {
            shopId: 0,
            message: '接口返回数据异常，未获取到店铺上架结果',
            success: false,
        }
        return { shopResults: [fallback], allSuccess: false, failures: [fallback] }
    }

    const shopResults: OzonShopListingResult[] = data.map((item) => {
        const raw = item as { shopId?: number; message?: string; taskId?: number }
        const message = String(raw?.message ?? '未知错误')
        const success = message === OZON_LISTING_SUCCESS_MESSAGE
        return {
            shopId: Number(raw?.shopId ?? 0),
            message,
            success,
            taskId: raw?.taskId,
        }
    })

    const failures = shopResults.filter((r) => !r.success)
    return {
        shopResults,
        allSuccess: failures.length === 0,
        failures,
    }
}

export const uploadOzonProduct = async (data: unknown) => {
    const response = await apiService.aiCreateProductV2(data)
    console.log('==提交结果==', response)
    if (response.code === 200) {
        return response
    }
    throw new Error(response.msg || '上传失败')
}

// —— 上架提交流程编排 ——

export type OzonSubmitRunResult =
    | { status: 'validation_failed'; message: string }
    | { status: 'chinese_blocked'; marks: ChineseFieldMark[] }
    | { status: 'submit_failed'; parsed: OzonListingParsedResult; response: ApiResponse }
    | { status: 'success'; parsed: OzonListingParsedResult; response: ApiResponse }
    | { status: 'error'; message: string }

export interface OzonSubmitUploadHooks {
    onProgress?: (text: string) => void
    onUploading?: (show: boolean) => void
    onSuccess?: (data: unknown) => void
    onError?: (message: string) => void
    /** 为 true 时 console 输出最终上传 JSON */
    debugLogPayload?: boolean
}

export interface OzonSubmitValidationHooks extends OzonSubmitUploadHooks {
    setFeatureValidationErrors?: (errors: Record<string, string>) => void
    onValidationFailed?: (message: string) => void
    /** 变体图片超出 Ozon 上限时触发，供调用方弹 ValidationWarningModal */
    onVariantImageCountExceeded?: (payload: VariantImageCountExceededPayload) => void
    /** 变体特征校验未通过时触发，供调用方弹 ValidationWarningModal */
    onVariantAspectValidationFailed?: (payload: VariantAspectValidationPayload) => void
    onChineseBlocked?: (marks: ChineseFieldMark[]) => void
    /** 跳过校验与中文扫描，直接构建并上传（中文弹窗确认后等场景） */
    skipValidation?: boolean
}

/** 根据中文扫描结果生成工作台标红用的 feature / sku 错误映射 */
export function buildChineseValidationErrors(marks: ChineseFieldMark[]): {
    featureErrors: Record<string, string>
    skuErrors: Record<string, string>
} {
    const featureErrors: Record<string, string> = {}
    const skuErrors: Record<string, string> = {}
    marks.forEach((mark) => {
        if (mark.attrId != null) {
            featureErrors[String(mark.attrId)] = CHINESE_FIELD_ERROR_MESSAGE
        }
        if (mark.skuFieldKey) {
            skuErrors[mark.skuFieldKey] = CHINESE_FIELD_ERROR_MESSAGE
        }
    })
    return { featureErrors, skuErrors }
}

/** 构建 payload 并调用 aiCreateV2 上传 */
export async function executeOzonSubmitUpload(
    submitCtx: OzonSubmitContext,
    hooks?: OzonSubmitUploadHooks
): Promise<
    | { status: 'success'; parsed: OzonListingParsedResult; response: ApiResponse }
    | { status: 'submit_failed'; parsed: OzonListingParsedResult; response: ApiResponse }
    | { status: 'error'; message: string }
> {
    try {
        hooks?.onUploading?.(true)
        hooks?.onProgress?.('正在处理图片地址...')
        const finalData = await buildOzonSubmitPayload(submitCtx)

        if (hooks?.debugLogPayload) {
            console.log('==提交数据==', finalData)
        }

        hooks?.onProgress?.('正在上传商品数据...')
        const submitResponse = await uploadOzonProduct(finalData)
        hooks?.onUploading?.(false)

        const parsed = parseOzonAiCreateV2Response(submitResponse?.data)
        if (parsed.allSuccess) {
            hooks?.onSuccess?.(submitResponse.data)
            return { status: 'success', parsed, response: submitResponse }
        }
        return { status: 'submit_failed', parsed, response: submitResponse }
    } catch (error: unknown) {
        hooks?.onUploading?.(false)
        const message = normalizeUnknownError(error, '上传商品数据失败').message
        console.error('上传商品数据失败:', error)
        hooks?.onError?.(message)
        return { status: 'error', message }
    }
}

/**
 * 上架至 Ozon 完整流程：属性校验 → 变体校验 → 中文扫描 → 构建 payload → 上传
 */
export async function runOzonSubmitWithValidation(
    validateCtx: SubmitValidateContext,
    submitCtx: OzonSubmitContext,
    hooks?: OzonSubmitValidationHooks
): Promise<OzonSubmitRunResult> {
    if (!hooks?.skipValidation) {
        const attrValidation = validateFeatureAttrsBeforeSubmit(validateCtx)
        hooks?.setFeatureValidationErrors?.(attrValidation.errors)
        if (!attrValidation.valid) {
            const message = attrValidation.message || '属性校验未通过'
            hooks?.onValidationFailed?.(message)
            return { status: 'validation_failed', message }
        }

        const aspectValidation = validateSkuAspectBeforeSubmit(validateCtx)
        if (!aspectValidation.valid) {
            const message = aspectValidation.message || '变体特征校验未通过'
            const payload: VariantAspectValidationPayload = {
                message,
                items: aspectValidation.items || [],
            }
            if (hooks?.onVariantAspectValidationFailed) {
                hooks.onVariantAspectValidationFailed(payload)
            } else {
                hooks?.onValidationFailed?.(message)
            }
            return { status: 'validation_failed', message }
        }

        const imageCountValidation = validateVariantImageCountBeforeSubmit(validateCtx)
        if (!imageCountValidation.valid) {
            const message = imageCountValidation.message || '变体图片数量超出限制'
            const payload: VariantImageCountExceededPayload = {
                message,
                items: imageCountValidation.items || [],
            }
            if (hooks?.onVariantImageCountExceeded) {
                hooks.onVariantImageCountExceeded(payload)
            } else {
                hooks?.onValidationFailed?.(message)
            }
            return { status: 'validation_failed', message }
        }

        const chineseMarks = scanChineseFieldsBeforeSubmit(validateCtx)
        if (chineseMarks.length > 0) {
            hooks?.onChineseBlocked?.(chineseMarks)
            return { status: 'chinese_blocked', marks: chineseMarks }
        }
    }

    const uploadResult = await executeOzonSubmitUpload(submitCtx, hooks)
    if (uploadResult.status === 'error') {
        return { status: 'error', message: uploadResult.message }
    }
    if (uploadResult.status === 'submit_failed') {
        return {
            status: 'submit_failed',
            parsed: uploadResult.parsed,
            response: uploadResult.response,
        }
    }
    return {
        status: 'success',
        parsed: uploadResult.parsed,
        response: uploadResult.response,
    }
}
