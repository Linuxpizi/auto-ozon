import { apiService } from './api';
import { API_CONFIG } from './api';

export interface ShopItem {
    id: number;
    keyName: string;
    shopUsername?: string;
    activityStatus?: any;
    freshStatus?: any;
    deliveryMethodStatus?: any;
    clientId?: any;
    dateFirstEnd?: any;
    endBalanceAmount?: any;
    gfcookie?: any;
    gfcookieExies?: any;
    apiKey?: any;
    username?: any;
    currencyCode?: string;
    [key: string]: any;
}

export interface ShopListPageData {
    total?: number;
    rows?: ShopItem[];
    [key: string]: any;
}

export interface ShopListResponse {
    code: number;
    msg: string | null;
    data: ShopItem[];
}

export interface ExchangeRateResponse {
    code: number;
    msg: string | null;
    data: {
        /** 人民币/卢布：1 RUB 对应的 CNY 数量。 */
        cnyPerRub: number;
    };
}

const DEFAULT_CNY_PER_RUB = 0.0919;

export interface CategoryItem {
    metadata: {
        level1NameZh: string;
        level2NameZh: string;
        typeNameZh: string;
        level1NameRu?: string;
        level1NameEn?: string;
        level2NameRu?: string;
        level2NameEn?: string;
        typeNameRu?: string;
        typeNameEn?: string;
        level1Id?: string;
        level2Id?: string;
        typeId?: string;
        score?: number;
        [key: string]: any;
    };
    score?: number;
    text?: string;
    [key: string]: any;
}

export interface CategoryResponse {
    code: number;
    msg: string;
    data: CategoryItem[];
}

/**
 * 获取店铺列表（归一化为 ShopItem[]，兼容 data.rows 分页结构）
 * @returns 店铺列表数据
 */
export async function getShopList(): Promise<ShopListResponse> {
    try {
        const res = await apiService.request<{ code: number; msg: string | null; data?: ShopItem[] | ShopListPageData }>('/system/ozonShop/ozon/list', {
            method: 'GET',
            baseURL: API_CONFIG.LOCAL_API_BASE_URL
        });
        const rawData = res.data;
        const rows = Array.isArray(rawData) ? rawData : (Array.isArray(rawData?.rows) ? rawData.rows : []);
        return { code: res.code, msg: res.msg, data: rows };
    } catch (error) {
        console.warn('[aiApi] 本地店铺列表服务不可用，继续使用无店铺模式', error);
        return {
            code: 200,
            msg: '本地店铺服务未配置',
            data: [],
        };
    }
}

/**
 * 获取AI智选类目
 * @param query 查询标题
 * @returns 类目列表数据
 */
export async function getAiCategory(query: string): Promise<CategoryResponse> {
    const encodedQuery = encodeURIComponent(query);
    try {
        return await apiService.request<CategoryResponse>(`/knowledge/retrieve?query=${encodedQuery}&rerankTopN=10`, {
            method: 'GET',
            baseURL: API_CONFIG.LOCAL_API_BASE_URL
        });
    } catch (error) {
        console.warn('[aiApi] 本地 AI 类目服务不可用', error);
        return {
            code: 200,
            msg: '本地 AI 类目服务未配置',
            data: [],
        };
    }
}

export interface PluginRecommendWordResult {
    categoryPath: string;
    keywords: string;
    fromCache: boolean;
}

export interface PluginRecommendWordResponse {
    code: number;
    msg: string;
    data?: PluginRecommendWordResult;
}

/**
 * 获取 AI 推荐词（插件选品类目）
 * @param categoryPath 用户选中的类目名（一级/二级/三级均可）
 */
export async function getPluginRecommendWords(categoryPath: string): Promise<PluginRecommendWordResponse> {
    return apiService.request<PluginRecommendWordResponse>(API_CONFIG.ENDPOINTS.PLUGIN_RECOMMEND_WORDS, {
        method: 'POST',
        baseURL: API_CONFIG.LOCAL_API_BASE_URL,
        data: { categoryPath },
        timeout: 60000,
    });
}

export interface AttributeItem {
    id: number;
    attribute_complex_id: number;
    name: string;
    description: string;
    type: string;
    is_collection: boolean;
    is_required: boolean;
    is_aspect: boolean;
    max_value_count: number;
    group_name: string;
    group_id: number;
    dictionary_id: number;
    category_dependent: boolean;
    complex_is_collection: boolean;
    value: string | number;
    dictionary_values?: any[];
    选项?: DictionaryValue[];
    [key: string]: any;
}

export interface DictionaryValue {
    id: number;
    value: string;
    info: string;
    picture: string;
}

export interface AttributeListResponse {
    code: number;
    msg: string;
    data: {
        result: AttributeItem[];
    };
}

export interface AttributeDictionaryResponse {
    code: number;
    msg: string;
    data: {
        result: DictionaryValue[];
        has_next: boolean;
    };
}

/**
 * 获取特征属性列表
 * @param level2Id 二级类目ID
 * @param typeId 类型ID
 * @returns 特征属性列表数据
 */
export async function getAttributeList(level2Id: string, typeId: string): Promise<AttributeListResponse> {
    return apiService.request<AttributeListResponse>(`/system/ozonCollect/getAttribute/${level2Id}/${typeId}`, {
        method: 'GET',
        baseURL: API_CONFIG.LOCAL_API_BASE_URL
    });
}

/**
 * 获取特征属性的可选列表
 * @param level2Id 二级类目ID
 * @param typeId 类型ID
 * @param attributeId 特征ID
 * @param category_dependent 是否类目依赖
 * @returns 可选列表数据
 */
export async function getAttributeDictionary(level2Id: string, typeId: string, attributeId: number, category_dependent?: boolean): Promise<AttributeDictionaryResponse> {
    let url = `/system/ozonCollect/getAttribute/${level2Id}/${typeId}/${attributeId}`
    if (category_dependent !== undefined) {
        url += `?category_dependent=${category_dependent}`
    }
    return apiService.request<AttributeDictionaryResponse>(url, {
        method: 'GET',
        baseURL: API_CONFIG.LOCAL_API_BASE_URL
    });
}

/**
 * 从本地 FastAPI 汇率服务获取汇率，并转换为旧调用方使用的
 * `data.cnyPerRub` 结构。汇率服务不可用时使用内置参考值，避免阻塞采集。
 */
export async function getExchangeRate(): Promise<ExchangeRateResponse> {
    try {
        const response = await apiService.request<{
            rates?: Record<string, unknown>;
        }>('/v1/exchange-rates', {
            method: 'GET',
            baseURL: API_CONFIG.LOCAL_API_BASE_URL
        });
        // 后端的 CNY/RUB 表示 1 CNY 对应的 RUB 数量，调用方需要其倒数。
        const rubPerCny = Number(response?.rates?.['CNY/RUB']);
        const cnyPerRub = rubPerCny > 0 && Number.isFinite(rubPerCny)
            ? 1 / rubPerCny
            : DEFAULT_CNY_PER_RUB;

        return {
            code: 200,
            msg: rubPerCny > 0 && Number.isFinite(rubPerCny) ? null : '使用默认汇率',
            data: { cnyPerRub },
        };
    } catch (error) {
        console.warn('[aiApi] 本地汇率服务不可用，使用默认汇率', error);
        return {
            code: 200,
            msg: '使用默认汇率',
            data: { cnyPerRub: DEFAULT_CNY_PER_RUB },
        };
    }
}

