import { getAiCategory } from '../../../utils/aiApi'
import { apiService } from '../../../utils/api'
import { proxyFetchJson } from '../../../utils/proxyFetch'
import {
  isAttrValueFilled,
  normalizeFeatureName,
} from '../ozonAiFillAndSubmit'
import type { AiAutoSelectDraftItem } from '../aiAutoSelect/types'
import {
  ensureDefaultFeatureAttrSelectionsOnSession,
  ensureRandomModelNameFeatureAttrsOnSession,
  getSessionFeatureAttrExistingValue,
  setSessionWorkbenchFeatureAttrValue,
} from './featureAttrSessionHelpers'
import type { ProductSession } from './types'

const FEATURE_ATTR_ID_TYPE = 8229
const FEATURE_ATTR_ID_BRAND_TYPE = 85
const FEATURE_ATTR_ID_ORIGIN_COUNTRY = 4389
const NO_BRAND_OPTION = { id: 126745801, value: '无品牌' }
const CHINA_ORIGIN_OPTION = { id: 90296, value: 'Китай' }

const prependDictionaryOptionIfMissing = (
  attr: Record<string, unknown>,
  option: { id: number; value: string },
) => {
  const currentDict = Array.isArray(attr?.dictionary_values) ? attr.dictionary_values : []
  const exists = currentDict.some((item: Record<string, unknown>) => {
    return Number(item?.id) === option.id
      || normalizeFeatureName(String(item?.value ?? '')) === normalizeFeatureName(option.value)
  })
  if (exists) return attr
  return { ...attr, dictionary_values: [option, ...currentDict] }
}

function getSessionCategoryMeta(session: ProductSession): { typeId: string; level2Id: string } | null {
  if (!session.categoryTemplateId || !session.categoryTemplates.length) return null
  const tpl = session.categoryTemplates.find((t) => t.id === session.categoryTemplateId)
  const meta = tpl?.data as { metadata?: { typeId?: unknown; level2Id?: unknown } } | undefined
  if (!meta?.metadata) return null
  const typeId = String(meta.metadata.typeId ?? '').trim()
  const level2Id = String(meta.metadata.level2Id ?? '').trim()
  if (!typeId && !level2Id) return null
  return { typeId, level2Id }
}

/** 1688 自动选品：加载类目特征到 session */
async function loadFeatureAttrsForSession(session: ProductSession, typeId: string, level2Id: string): Promise<void> {
  const tid = String(typeId ?? '').trim()
  const lid = String(level2Id ?? '').trim()
  if (!tid && !lid) {
    session.featureAttrs = []
    return
  }

  const res = await apiService.getCategoryAndOptionList(tid, lid)
  const data = res?.data
  const resolvedTypeId = String(data?.typeId ?? '').trim()
  const zhOssPath = typeof data?.zhOssPath === 'string' ? data.zhOssPath : ''
  if (!zhOssPath) {
    throw new Error('未返回属性配置地址')
  }

  const json = await proxyFetchJson<unknown[]>(zhOssPath)
  const list = Array.isArray(json) ? json : null
  if (!list) {
    throw new Error('属性数据格式错误')
  }

  const normalizedList = list.map((attr) => {
    if (!attr || typeof attr !== 'object') return attr
    const row = attr as Record<string, unknown>
    const attrId = Number(row?.id)
    if (attrId === FEATURE_ATTR_ID_TYPE && resolvedTypeId) {
      if (isAttrValueFilled(row, row?.value)) return row
      return { ...row, value: resolvedTypeId }
    }
    if (attrId === FEATURE_ATTR_ID_BRAND_TYPE) {
      return prependDictionaryOptionIfMissing(row, NO_BRAND_OPTION)
    }
    if (attrId === FEATURE_ATTR_ID_ORIGIN_COUNTRY) {
      return prependDictionaryOptionIfMissing(row, CHINA_ORIGIN_OPTION)
    }
    return row
  })

  session.featureAttrs = normalizedList

  if (resolvedTypeId) {
    const typeAttr = normalizedList.find(
      (item) => Number((item as Record<string, unknown>)?.id) === FEATURE_ATTR_ID_TYPE
        && !(item as Record<string, unknown>)?.is_aspect,
    ) as Record<string, unknown> | undefined
    const existingTypeValue = typeAttr ? getSessionFeatureAttrExistingValue(session, typeAttr) : undefined
    if (typeAttr && !isAttrValueFilled(typeAttr, existingTypeValue)) {
      setSessionWorkbenchFeatureAttrValue(session, FEATURE_ATTR_ID_TYPE, resolvedTypeId)
    }
  }

  ensureDefaultFeatureAttrSelectionsOnSession(session)
  ensureRandomModelNameFeatureAttrsOnSession(session)
}

async function applyAiCategoryToSession(session: ProductSession, title: string): Promise<boolean> {
  const categoryResponse = await getAiCategory(title)
  if (categoryResponse.code === 200 && categoryResponse.data && categoryResponse.data.length > 0) {
    session.categoryTemplates = categoryResponse.data.map((item, index) => ({
      id: index + 1,
      name: `${item.metadata.level1NameZh}/${item.metadata.level2NameZh}/${item.metadata.typeNameZh}`,
      data: item,
    }))
    if (session.categoryTemplates.length > 0) {
      session.categoryTemplateId = session.categoryTemplates[0].id
      const first = categoryResponse.data[0]
      const meta = first?.metadata
      if (meta) {
        const typeId = String(meta.typeId ?? '')
        const level2Id = String(meta.level2Id ?? '')
        if (typeId !== '' || level2Id !== '') {
          await loadFeatureAttrsForSession(session, typeId, level2Id)
        }
      }
    }
    return true
  }
  return false
}

/** 批量帮填前：确保 session 已有类目与特征 */
export async function ensureSessionCategoryAndFeatureAttrs(
  session: ProductSession,
  item?: AiAutoSelectDraftItem,
): Promise<boolean> {
  if (!session.categoryTemplateId) {
    const fromTransformed = (session.transformed?.global_data as { product_name?: string } | undefined)?.product_name
    const title = String(item?.title || fromTransformed || session.title || '').trim()
    if (!title) return false
    const ok = await applyAiCategoryToSession(session, title)
    if (!ok) return false
  }

  if (!session.featureAttrs?.length) {
    const meta = getSessionCategoryMeta(session)
    if (!meta) return false
    try {
      await loadFeatureAttrsForSession(session, meta.typeId, meta.level2Id)
    } catch (err) {
      console.error('[productSession] 加载类目特征失败:', err)
    }
  }

  return Boolean(session.featureAttrs?.length)
}

export function getSessionCategoryMetaForExport(session: ProductSession) {
  return getSessionCategoryMeta(session)
}
