import { apiService } from '../../../utils/api'
import { API_CONFIG } from '../../../utils/api-config'

export interface UploadEditResponse {
  code: number
  data?: string | number
  msg?: string
}

/**
 * 上传编辑上架数据（移植旧版 POST {java}/system/goods/plugin/uploadEdit）。
 * 走 apiService.request → background 代理，token 由拦截器以 Bearer 注入。
 */
export async function submitEditUpload(
  editData: Record<string, unknown>,
): Promise<UploadEditResponse> {
  return apiService.request<UploadEditResponse>(API_CONFIG.ENDPOINTS.UPLOAD_EDIT, {
    method: 'POST',
    baseURL: API_CONFIG.LOCAL_API_BASE_URL,
    data: editData,
    timeout: 60000,
  })
}
