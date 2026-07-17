import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, CancelTokenSource } from 'axios';
import { hasExtensionMessaging } from './runtime';
import { API_CONFIG } from './api-config';
import { proxyRequestViaBackground } from './proxyRequestAdapter';
import { ProxyEventSource } from './proxySse';

export { API_CONFIG };

export interface ApiResponse<T = any> {
    code: number;
    msg?: string;
    data?: T;
    [key: string]: any;
}

/** 象集批量图片翻译语言方向（与 RuoYi translateData.language 一致） */
export type BatchImageTranslateLanguage = 'CHS>RUS' | 'CHS>ENG' | 'ENG>RUS';

/** 提交批量翻译：返回 data.content 为 requestId 数组 */
export interface BatchImageTranslateSubmitData {
    urls: string[];
    engine?: string;
    language: BatchImageTranslateLanguage;
}

/** 查询单条翻译结果（content 对象 value 的结构） */
export interface BatchImageTranslateResultItem {
    originUrl?: string;
    sslUrl?: string;
    code?: number;
    [key: string]: any;
}

// aliyun 提交批量翻译：返回 data.taskId 为任务id数组
export interface BatchImageTranslateSubmitDataALI {
    imageUrls: string[];
    sourceLang: string;
    targetLang: string;
}
// 阿里云翻译结果项
export interface BatchImageTranslateResultItemALI {
    taskId?: string;
    taskStatus?: string;
    imageUrl?: string;
    message?: string;
    errorCode?: string;
}

export interface ImageRepaintModelOption {
    model: string;
    label: string;
    disabled?: boolean;
    disabledReason?: string;
    pointsPerImage?: number;
}

export interface ImageRepaintModelsData {
    models: ImageRepaintModelOption[];
    defaultModel: string;
    tip: string;
}

const LOCAL_QUICK_LOGIN_SHOPS_KEY = 'ozon_replica_quick_login_shops';

interface LocalQuickLoginShop {
    id: number;
    clientid: string;
    cookie: string;
    updatedAt: string;
}

async function readLocalQuickLoginShops(): Promise<LocalQuickLoginShop[]> {
    const chromeApi = (globalThis as any).chrome;
    if (chromeApi?.storage?.local) {
        const stored = await chromeApi.storage.local.get(LOCAL_QUICK_LOGIN_SHOPS_KEY);
        return Array.isArray(stored?.[LOCAL_QUICK_LOGIN_SHOPS_KEY])
            ? stored[LOCAL_QUICK_LOGIN_SHOPS_KEY]
            : [];
    }
    try {
        const raw = globalThis.localStorage?.getItem(LOCAL_QUICK_LOGIN_SHOPS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function writeLocalQuickLoginShops(shops: LocalQuickLoginShop[]): Promise<void> {
    const chromeApi = (globalThis as any).chrome;
    if (chromeApi?.storage?.local) {
        await chromeApi.storage.local.set({ [LOCAL_QUICK_LOGIN_SHOPS_KEY]: shops });
        return;
    }
    globalThis.localStorage?.setItem(LOCAL_QUICK_LOGIN_SHOPS_KEY, JSON.stringify(shops));
}

const normalizeRequestError = (
    error: unknown,
    fallbackMessage = '请求失败'
): Error => {
    if (error instanceof Error) {
        return error;
    }

    if (typeof error === 'string' && error.trim()) {
        return new Error(error);
    }

    if (error && typeof error === 'object') {
        const record = error as Record<string, any>;
        const message =
            record.message ||
            record.msg ||
            record.error ||
            fallbackMessage;
        const normalized = new Error(String(message));
        Object.assign(normalized, record);
        return normalized;
    }

    return new Error(fallbackMessage);
};

export class ApiService {
    private axiosInstance: AxiosInstance;

    constructor() {
        // 无账户会话：所有复刻业务默认请求本地 API。
        this.axiosInstance = axios.create({
            baseURL: API_CONFIG.LOCAL_API_BASE_URL,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // 响应拦截器：统一处理错误
        this.axiosInstance.interceptors.response.use(
            (response: any) => {
                return response.data;
            },
            (error: any) => {
                console.log('error', error)
                // 如果是取消请求，直接抛出
                if (axios.isCancel(error)) {
                    return Promise.reject(error);
                }

                // 处理网络错误
                if (!error.response) {
                    console.error('API Network Error:', error.message);
                    return Promise.reject({ code: 0, msg: '网络错误，请检查网络连接' });
                }

                // 处理其他错误
                const errorData = error.response?.data || { msg: error.message };
                const status = error.response?.status || 500;
                console.error('API Request Error:', error);
                return Promise.reject({ code: status, ...errorData });
            }
        );
    }

    /** 初始化本地 API 客户端；保留方法以兼容已恢复的功能模块。 */
    async init(): Promise<null> {
        return null;
    }

    // 通用请求方法
    async request<T = any>(endpoint: string, options: AxiosRequestConfig = {}): Promise<T> {
        const axiosConfig = { ...options };

        // 扩展环境：经 background 代理，绕过第三方页面 CORS
        if (hasExtensionMessaging()) {
            try {
                return await proxyRequestViaBackground<T>(endpoint, axiosConfig, this);
            } catch (error: any) {
                throw normalizeRequestError(error);
            }
        }

        // 如果 endpoint 是绝对路径（如 http 开头），直接使用
        if (endpoint.startsWith('http')) {
            axiosConfig.url = endpoint;
            axiosConfig.baseURL = undefined;
        } else {
            axiosConfig.url = endpoint;
            // 如果指定了 baseURL，使用指定的，否则使用默认的
            if (options.baseURL) {
                axiosConfig.baseURL = options.baseURL;
            }
        }

        try {
            const response = await this.axiosInstance.request<T>(axiosConfig);
            return response as T;
        } catch (error: any) {
            // 错误已在拦截器中处理，直接抛出
            throw normalizeRequestError(error);
        }
    }

    // 创建可取消的请求（用于 Vue3 组件卸载时取消请求）
    createCancelToken(): CancelTokenSource {
        return axios.CancelToken.source();
    }

    // 本地模式不维护插件账户；保留稳定的展示信息。
    async getInfo(): Promise<ApiResponse> {
        return {
            code: 200,
            msg: 'success',
            user: { userName: '本地模式', nickName: '本地模式' },
        };
    }

    // 获取商品详情（旧接口，已废弃）
    async getProductDetail(): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.PRODUCT_DETAIL}`;
        return this.request<ApiResponse>(url, {
            method: 'GET'
        });
    }

    // 获取商品销量信息（新接口）
    async getSkuInfo(sku: string | number): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}/system/sku/skuss/new?sku=${sku}`;
        return this.request<ApiResponse>(url, {
            method: 'GET'
        });
    }

    // 采集商品
    async collectProducts(data: any): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.COLLECT}`;
        return this.request<ApiResponse>(url, {
            method: 'POST',
            data
        });
    }

    // 三方一键采集（非 AI 直采）：对齐旧插件 POST /system/ozonCollect，采集 标题/图片/视频/SKU 直接入后台
    async ozonCollect(data: any): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}/system/ozonCollect`;
        return this.request<ApiResponse>(url, {
            method: 'POST',
            data
        });
    }

    // 获取精修模板列表
    async getRefineTemplateList(params?: any): Promise<any> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.AIRETOUCH_LIST}`;
        return this.request(url, {
            method: 'GET',
            params: { pageNum: 1, pageSize: 500, ...params }
        });
    }

    // 百炼处理
    async advancedAiEdit(data: any): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.ADVANCED_AI_EDIT}`;
        return this.request<ApiResponse>(url, {
            method: 'POST',
            data
        });
    }

    /** 取消视觉工坊（进阶 AI 改图）任务 */
    async advancedAiEditCancel(sessionId: string): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.ADVANCED_AI_EDIT_CANCEL}`;
        return this.request<ApiResponse>(url, {
            method: 'POST',
            data: { sessionId },
        });
    }

    // 百炼处理（新版接口，拆分start和result）
    async advancedAiStart(data: any): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.ADVANCED_AI_START}`;
        return this.request<ApiResponse>(url, {
            method: 'POST',
            data
        });
    }
    // 百炼处理结果查询（sse失败后查询结果）
    async advancedAiEditResult(sessionId: string): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.ADVANCED_AI_EDIT_RESULT}/${sessionId}`;
        return this.request<ApiResponse>(url, {
            method: 'GET',
        });
    }
    /** 商品详情页刷新后，按 offerId 检测/恢复服务端的帮填结果（非 SSE 失败重取） */
    async advancedAiEditRestoreResult(offerId: string): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.ADVANCED_AI_EDIT_RESULT_RESTORE}`;
        return this.request<ApiResponse>(url, {
            method: 'GET',
            params: { offerId }
        });
    }
    
    // 获取类目与可选值列表
    async getCategoryAndOptionList(typeId: string, level2CategoryId: string): Promise<any> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.GET_CATEGORY_AND_OPTION_LIST}`;
        return this.request(url, {
            method: 'GET',
            params: { typeId: typeId, level2CategoryId: level2CategoryId }
        });
    }

    /** 按店铺拉取 Ozon 仓库列表（与 ruoyi plAdd 同源接口） */
    async getWarehouse(shopId: number): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.GET_WAREHOUSE}`;
        return this.request<ApiResponse>(url, {
            method: 'POST',
            data: { shopId },
            timeout: 100000
        });
    }

    /** AI 创建商品 V2（shopWarehouseConfigs + items） */
    async aiCreateProductV2(data: any): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.AI_CREATE_PRODUCT_V2}`;
        return this.request<ApiResponse>(url, {
            method: 'POST',
            data,
        });
    }

    /** 加入采集箱（请求体与 aiCreateV2 一致，无需店铺仓库配置） */
    async aiCreateV2CollectionBox(data: unknown): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.AI_CREATE_V2_COLLECTION_BOX}`;
        return this.request<ApiResponse>(url, {
            method: 'POST',
            data,
        });
    }

    /** 上传商品图片（base64/blob 转 OSS） */
    async uploadProductImage(file: File | Blob, fileName = 'edited_image.jpg'): Promise<string> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.OSS_PRODUCT_UPLOAD}`;
        const formData = new FormData();
        formData.append('file', file, fileName);
        const response = await this.request<ApiResponse>(url, {
            method: 'POST',
            data: formData,
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        const uploadedUrl = response?.url || response?.data?.url;
        if (!uploadedUrl) {
            throw new Error(response?.msg || '服务器未返回有效的图片URL');
        }
        return String(uploadedUrl);
    }

    /**
     * 批量提交图片翻译（象集 /xiangji/translate/batchImage）
     * @returns data.content 为 requestId 数组
     */
    async addBatchImageTranslate(
        data: BatchImageTranslateSubmitData
    ): Promise<ApiResponse<{ content?: string[] }>> {
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.BATCH_IMAGE_TRANSLATE}`;
        return this.request<ApiResponse<{ content?: string[] }>>(url, {
            method: 'POST',
            data: {
                urls: data.urls,
                engine: data.engine ?? 'aliyun',
                language: data.language
            }
        });
    }

    /**
     * 查询批量图片翻译结果（象集 /xiangji/translate/batchImage/query）
     * @param requestIds 提交接口返回的 id 列表
     * @returns data.content 为 requestId -> 结果对象 的映射
     */
    async queryBatchImageTranslate(
        requestIds: string[]
    ): Promise<ApiResponse<{ content?: Record<string, BatchImageTranslateResultItem> }>> {
        const qs = requestIds.map(encodeURIComponent).join(',');
        const url = `${API_CONFIG.LOCAL_API_BASE_URL}${API_CONFIG.ENDPOINTS.BATCH_IMAGE_TRANSLATE_QUERY}?requestIds=${qs}`;
        return this.request<ApiResponse<{ content?: Record<string, BatchImageTranslateResultItem> }>>(url, {
            method: 'GET'
        });
    }

    /**
     * 批量提交图片翻译（阿里云 /vision/baiLian/image-translate/submit）
     * @returns data.content 为 requestId 数组
     */
    async addBatchImageTranslateALI(data: BatchImageTranslateSubmitDataALI): Promise<ApiResponse> {
        const url = `${API_CONFIG.LOCAL_VISION_BASE_URL}${API_CONFIG.ENDPOINTS.ALI_IMAGE_TRANSLATE}`;
        return this.request<ApiResponse>(url, {
            method: 'POST',
            data: {
                imageUrls: data.imageUrls,
                sourceLang: data.sourceLang,
                targetLang: data.targetLang
            }
        });
    }
    /**
     * 查询批量图片翻译结果（阿里云 /vision/baiLian/image-translate/fetch）
     * @param taskIds 提交接口返回的 id 列表
     * @returns data.data 为 taskId -> 结果对象 的映射
     */
    async queryBatchImageTranslateALI(taskIds: string[]): Promise<ApiResponse<BatchImageTranslateResultItemALI[]>> {
        const url = `${API_CONFIG.LOCAL_VISION_BASE_URL}${API_CONFIG.ENDPOINTS.ALI_IMAGE_TRANSLATE_QUERY}`;
        return this.request<ApiResponse<BatchImageTranslateResultItemALI[]>>(url, {
            method: 'POST',
            data: { taskIds }
        });
    }

    /** 获取图片重绘可选模型列表 */
    async getImageRepaintModels(): Promise<ApiResponse<ImageRepaintModelsData>> {
        const url = `${API_CONFIG.LOCAL_VISION_BASE_URL}${API_CONFIG.ENDPOINTS.IMAGE_REPAINT_MODELS}`;
        return this.request<ApiResponse<ImageRepaintModelsData>>(url, { method: 'GET' });
    }

    /** 提交图片重绘任务 */
    async submitImageRepaint(data: {
        imageUrls: string[];
        prompt?: string;
        prompts?: string[];
        userContext: string;
        imageSize: string;
        model: string;
        imageType: string;
    }): Promise<ApiResponse<{ taskId: number; estimatedPoints?: number; estimatedSeconds?: number }>> {
        const url = `${API_CONFIG.LOCAL_VISION_BASE_URL}${API_CONFIG.ENDPOINTS.IMAGE_REPAINT}`;
        return this.request(url, { method: 'POST', data });
    }

    /** 查询图片重绘任务状态 */
    async getImageRepaintStatus(taskId: number | string): Promise<ApiResponse<{
        taskId: number;
        status: string;
        errorMsg?: string;
        imageUrls?: string[];
        totalPointsCost?: number;
    }>> {
        const url = `${API_CONFIG.LOCAL_VISION_BASE_URL}${API_CONFIG.ENDPOINTS.IMAGE_REPAINT_STATUS}/${taskId}`;
        return this.request(url, { method: 'GET' });
    }

    // ==================== Ozon 店铺 Cookie 管理（仅本地存储） ====================

    /** 本机保存的店铺列表；保留旧响应形状以兼容 Popup。 */
    async getQuickLoginShopList(): Promise<ApiResponse<any> & { rows?: any[] }> {
        const rows = await readLocalQuickLoginShops();
        return { code: 200, msg: 'success', rows };
    }

    /** 读取本机店铺详情（data.cookie 为权限 Cookie 的 JSON 字符串）。 */
    async getQuickLoginShop(id: number | string): Promise<ApiResponse<{ cookie?: string }>> {
        const shop = (await readLocalQuickLoginShops()).find(item => String(item.id) === String(id));
        return shop
            ? { code: 200, msg: 'success', data: { cookie: shop.cookie } }
            : { code: 404, msg: '未找到本地店铺' };
    }

    /** 将店铺 Cookie 保存到扩展本地存储，不与任何账户服务交互。 */
    async saveQuickLoginShop(data: { clientid: string; cookie: string }): Promise<ApiResponse> {
        const shops = await readLocalQuickLoginShops();
        const existing = shops.find(item => item.clientid === data.clientid);
        const now = new Date().toISOString();
        if (existing) {
            existing.cookie = data.cookie;
            existing.updatedAt = now;
        } else {
            shops.push({
                id: Date.now(),
                clientid: data.clientid,
                cookie: data.cookie,
                updatedAt: now,
            });
        }
        await writeLocalQuickLoginShops(shops);
        return { code: 200, msg: 'success' };
    }

}

// 导出单例
export const apiService = new ApiService();

/**
 * 创建进阶 AI 改图 SSE 连接（本地服务，无账户 token）。
 * @param sessionId 会话ID，来自 /sjgf/baiLian/start 返回的 data.sessionId
 * @returns EventSource 实例
 */
export async function createSseConnection(sessionId: string): Promise<EventSource> {
    const baseUrl = API_CONFIG.LOCAL_SSE_BASE_URL.replace(/\/$/, '');
    const url = `${baseUrl}/vision/baiLian/stream?sessionId=${encodeURIComponent(sessionId)}&_t=${Date.now()}`;
    if (hasExtensionMessaging()) {
        return new ProxyEventSource(url) as unknown as EventSource;
    }
    return new EventSource(url);
}

/**
 * 创建 SSE 连接（本地服务，无账户 token）。
 * @param sessionId 会话ID，来自 /baiLian/ai/start 返回的 data.sessionId
 * @returns EventSource 实例
 */
export async function createSseStream(sessionId: string): Promise<EventSource> {
    const baseUrl = API_CONFIG.LOCAL_SSE_BASE_URL.replace(/\/$/, '');
    const url = `${baseUrl}/vision/baiLian/ai/stream?sessionId=${encodeURIComponent(sessionId)}&_t=${Date.now()}`;
    if (hasExtensionMessaging()) {
        return new ProxyEventSource(url) as unknown as EventSource;
    }
    return new EventSource(url);
}