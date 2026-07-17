/**
 * 纯配置模块：无 axios / DOM / toast，可供 Service Worker 安全引用。
 */
export const API_CONFIG = {
  LOCAL_API_BASE_URL: import.meta.env.VITE_LOCAL_API_BASE_URL || 'http://localhost:9000/api',
  LOCAL_FRONTEND_URL: import.meta.env.VITE_LOCAL_FRONTEND_URL || 'http://localhost:5173',
  LOCAL_VISION_BASE_URL:
    import.meta.env.VITE_LOCAL_VISION_BASE_URL || 'http://localhost:9000/api/v1/image',
  LOCAL_SSE_BASE_URL: import.meta.env.VITE_LOCAL_SSE_BASE_URL || 'http://localhost:9000/api/sse',
  LOCAL_URL: import.meta.env.VITE_LOCAL_URL || 'http://localhost:9000',
  ENDPOINTS: {
    COLLECT: '/system/selection/batch',
    PRODUCT_DETAIL: '/product/detail',
    AIRETOUCH_LIST: '/system/AIRetouch/list',
    ADVANCED_AI_EDIT: '/vision/baiLian/start',
    ADVANCED_AI_EDIT_CANCEL: '/vision/baiLian/cancel',
    ADVANCED_AI_START: '/vision/baiLian/ai/start',
    ADVANCED_AI_EDIT_RESULT: '/vision/baiLian/ai/result',
    ADVANCED_AI_EDIT_RESULT_RESTORE: '/vision/baiLian/ai/result/restore',
    GET_CATEGORY_AND_OPTION_LIST: '/system/ozonCategoryAttrJson/getOne',
    GET_WAREHOUSE: '/system/ozonRecord/warehouse',
    AI_CREATE_PRODUCT_V2: '/system/goods/plugin/aiCreateV2',
    AI_CREATE_V2_COLLECTION_BOX: '/system/goods/plugin/aiCreateV2CollectionBox',
    UPLOAD_EDIT: '/system/goods/plugin/uploadEdit',
    PLUGIN_RECOMMEND_WORDS: '/system/goods/plugin/recommendWords',
    OSS_PRODUCT_UPLOAD: '/oss/product/upload',
    BATCH_IMAGE_TRANSLATE: '/xiangji/translate/batchImage',
    BATCH_IMAGE_TRANSLATE_QUERY: '/xiangji/translate/batchImage/query',
    ALI_IMAGE_TRANSLATE: '/vision/baiLian/image-translate/submit',
    ALI_IMAGE_TRANSLATE_QUERY: '/vision/baiLian/image-translate/fetch',
    IMAGE_REPAINT: '/vision/imageRepaint',
    IMAGE_REPAINT_MODELS: '/vision/imageRepaint/models',
    IMAGE_REPAINT_STATUS: '/vision/imageRepaint/status',
  },
}
