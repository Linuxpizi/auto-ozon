<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiService, API_CONFIG } from '../utils/api'
import { resolveAssetUrl } from '../utils/runtime'
import { GET_COOKIES_ACTION } from '../background/cookieHandler'
import fallbackLogo from '../assets/img/newlogo.png'

const logoUrl = resolveAssetUrl('src/assets/img/newlogo.png', fallbackLogo)
const chromeApi: any = (globalThis as any).chrome

const SELLER_DASHBOARD_URL = 'https://seller.ozon.ru/app/dashboard'
const API_KEYS_URL = 'https://seller.ozon.ru/app/settings/api-keys'
const SIGNIN_URL = 'https://seller.ozon.ru/app/registration/signin'
const localFrontendUrl = String(API_CONFIG.LOCAL_FRONTEND_URL || '').replace(/\/$/, '')

interface ShopItem {
  id: number | string
  shopName?: string
  clientid?: string
}

interface BrowserTab {
  id?: number
  url?: string
}

interface BrowserCookie {
  name: string
  value: string
}

const clientId = ref('')
const shops = ref<ShopItem[]>([])

// ==================== chrome.* Promise 包装 ====================
function getActiveTab(): Promise<BrowserTab | undefined> {
  return new Promise((resolve) => {
    chromeApi.tabs.query(
      { active: true, currentWindow: true },
      (tabs: BrowserTab[]) => resolve(tabs?.[0]),
    )
  })
}

function getCookie(url: string, name: string): Promise<BrowserCookie | null> {
  return new Promise((resolve) => {
    chromeApi.cookies.get(
      { url, name },
      (cookie: BrowserCookie | null) => resolve(cookie),
    )
  })
}

function getAllCookies(details: Record<string, unknown>): Promise<BrowserCookie[]> {
  return new Promise((resolve) => {
    chromeApi.cookies.getAll(
      details,
      (cookies: BrowserCookie[]) => resolve(cookies || []),
    )
  })
}

function removeCookie(url: string, name: string): Promise<void> {
  return new Promise((resolve) => {
    chromeApi.cookies.remove({ url, name }, () => resolve())
  })
}

function setCookie(details: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chromeApi.cookies.set(details, () => resolve())
  })
}

function sendBg<T>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chromeApi.runtime.sendMessage(payload, (res: T) => {
      if (chromeApi.runtime.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message))
        return
      }
      resolve(res as T)
    })
  })
}

// ==================== 本地店铺列表 ====================
async function loadShopList() {
  try {
    const res: any = await apiService.getQuickLoginShopList()
    shops.value = Array.isArray(res?.rows) ? res.rows : []
  } catch (e) {
    console.error('[popup] 读取本地店铺列表失败', e)
    shops.value = []
  }
}

// ==================== 点击店铺：注入 Cookie 并跳转登录 ====================
async function onShopClick(shop: ShopItem) {
  try {
    const res: any = await apiService.getQuickLoginShop(shop.id)
    const data = res?.data
    if (!data?.cookie) return

    const cookies = JSON.parse(data.cookie) as Record<string, string>

    // 先清除 ozon.ru 现有 cookie
    const existing = await getAllCookies({ url: SELLER_DASHBOARD_URL })
    await Promise.all(existing.map((c) => removeCookie(SELLER_DASHBOARD_URL, c.name)))

    // 写入店铺权限 cookie（有效期一年）
    const expirationDate = Date.now() / 1000 + 365 * 24 * 3600
    for (const key in cookies) {
      if (!Object.prototype.hasOwnProperty.call(cookies, key)) continue
      await setCookie({
        url: SELLER_DASHBOARD_URL,
        name: key,
        value: String(cookies[key]),
        domain: '.ozon.ru',
        path: '/',
        secure: true,
        httpOnly: true,
        expirationDate,
      })
    }

    // 刷新跳转到店铺后台
    const tab = await getActiveTab()
    if (tab?.id != null) {
      chromeApi.tabs.update(tab.id, { url: SELLER_DASHBOARD_URL })
    }
  } catch (e) {
    console.error('[popup] 快登店铺失败', e)
  }
}

// ==================== 保存本地店铺切换 Cookie ====================
async function onSaveQuickLoginShop() {
  const bacntid = await getCookie(SELLER_DASHBOARD_URL, 'bacntid')
  if (bacntid?.value && bacntid.value !== '0' && bacntid.value !== '') {
    const clientidVal = bacntid.value
    const cookies = await getAllCookies({ url: SELLER_DASHBOARD_URL })
    const myObject: Record<string, string> = {}
    cookies.forEach((c) => {
      if (
        c.name.indexOf('__Secure') !== -1 ||
        c.name.indexOf('rfuid') !== -1 ||
        c.name.indexOf('xcid') !== -1
      ) {
        myObject[c.name] = c.value
      }
    })

    try {
      const res: any = await apiService.saveQuickLoginShop({
        clientid: clientidVal,
        cookie: JSON.stringify(myObject),
      })
      if (res > 0 || res?.code === 200) {
        alert('保存店铺成功！')
      } else {
        alert(res?.msg || '保存失败')
      }
    } catch (e: any) {
      alert(e?.message || '保存本地店铺失败')
    }
  } else {
    // 未登录店铺：跳转登录页并提示
    const tab = await getActiveTab()
    if (tab?.id != null) {
      chromeApi.tabs.update(tab.id, { url: SIGNIN_URL })
    }
    alert('智能检测，店铺未登录，请登录店铺后再保存！')
  }
}

// ==================== 获取 ClientId（bcCookieShopClientid）====================
async function onGetClientId() {
  const tab = await getActiveTab()
  if (tab?.url && tab.url.indexOf('api-keys') !== -1) {
    const cookie = await getCookie(tab.url, 'sc_company_id')
    if (cookie?.value && cookie.value !== '0' && cookie.value !== '') {
      clientId.value = cookie.value
    } else {
      alert('获取店铺clientid失败请手动填写！')
    }
  } else {
    if (confirm('非法页面，确定将前往指定页面获取 ClinentID！')) {
      window.open(API_KEYS_URL, '_blank')
    }
  }
}

// ==================== 上传店铺 Cookie 到本地服务 ====================
async function onSaveCookie() {
  const tab = await getActiveTab()
  if (!tab?.url || tab.url.indexOf('api-keys') === -1) {
    alert('非法页面，请前往指定页面保存Cookie！')
    return
  }

  if (!clientId.value) {
    alert('请先获取或填写clientId！')
    return
  }

  let cookieStr = ''
  try {
    const resp = await sendBg<{ cookies?: string }>({ action: GET_COOKIES_ACTION })
    cookieStr = resp?.cookies || ''
  } catch {
    cookieStr = ''
  }

  if (!cookieStr) {
    const shouldRedirect = confirm('智能检测，刷新当前页面后，再重新保存Cookie，点击确定自动刷新！')
    if (shouldRedirect && tab.id != null) {
      chromeApi.tabs.reload(tab.id)
    }
    return
  }

  try {
    const res: any = await apiService.saveShopCookie({
      clientId: clientId.value,
      gfcookie: cookieStr,
    })
    if (res > 0 || res?.code === 200) {
      alert('保存店铺成功！')
    } else {
      alert(res?.msg || '保存失败')
    }
  } catch (e: any) {
    alert(e?.message || '本地服务不可用，请检查后端是否已启动')
  }
}

onMounted(() => {
  void loadShopList()
})

</script>

<template>
  <div class="popup-container">
    <!-- ==================== 头部 ==================== -->
    <div class="popup-header">
      <div class="popup-brand">
        <img :src="logoUrl" alt="logo" class="popup-logo" />
        <h1 class="popup-title">Ozon 本地工具</h1>
      </div>
      <a :href="localFrontendUrl" target="_blank" rel="noopener" class="popup-link">
        打开本地控制台
      </a>
    </div>

    <!-- ==================== 主体 ==================== -->
    <div class="popup-body">
      <div class="popup-user-info">
        <span class="popup-user-info__label">运行模式：</span>
        <span class="popup-user-info__name">本地免登录</span>
        <span class="popup-user-info__tip">Cookie 仅保存在扩展与本地服务中</span>
      </div>

      <!-- 店铺 Cookie 管理（始终显示） -->
      <div class="popup-card popup-card--clientid">
        <div class="popup-card__title">店铺 Cookie 管理</div>
        <div class="popup-form-group">
          <label for="myInput" class="popup-label">ClientId</label>
          <div class="popup-input-row">
            <input
              id="myInput"
              v-model="clientId"
              type="text"
              class="popup-input"
              placeholder="请输入或获取 ClientId"
            />
            <div class="popup-btn-group">
              <button type="button" class="popup-btn popup-btn--secondary" @click="onGetClientId">
                获取
              </button>
              <button type="button" class="popup-btn popup-btn--primary" @click="onSaveCookie">
                保存
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 本地店铺列表 -->
      <div id="shopList" class="popup-card popup-card--shops">
        <button
          type="button"
          class="popup-btn popup-btn--primary popup-btn--block"
          @click="onSaveQuickLoginShop"
        >
          保存本地店铺
        </button>
        <h2 class="popup-card__title">店铺列表</h2>
        <div class="popup-shop-list">
          <label v-for="shop in shops" :key="shop.id" @click="onShopClick(shop)">
            {{ shop.shopName || shop.clientid || `店铺 ${shop.id}` }}
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* ==================== 设计变量 ==================== */
:root {
  --popup-primary: #1677ff;
  --popup-primary-hover: #4096ff;
  --popup-primary-active: #0958d9;
  --popup-secondary: #f5f5f5;
  --popup-secondary-hover: #e8e8e8;
  --popup-text: #1f2937;
  --popup-text-secondary: #6b7280;
  --popup-text-muted: #9ca3af;
  --popup-border: #e5e7eb;
  --popup-bg: #ffffff;
  --popup-bg-subtle: #f9fafb;
  --popup-warning: #f59e0b;
  --popup-warning-bg: #fffbeb;
  --popup-success: #10b981;
  --popup-radius: 8px;
  --popup-radius-sm: 6px;
  --popup-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  --popup-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --popup-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

/* ==================== 基础重置 ==================== */
body,
body * {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 320px;
  min-height: 200px;
  font-family: var(--popup-font);
  font-size: 14px;
  color: var(--popup-text);
  background: var(--popup-bg);
  -webkit-font-smoothing: antialiased;
}

/* ==================== 容器 ==================== */
#app {
  min-height: 100%;
}

.popup-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* ==================== 头部 ==================== */
.popup-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%);
  color: #fff;
  flex-shrink: 0;
}

.popup-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.popup-logo {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.2);
}

.popup-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.popup-link {
  display: inline-block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  text-decoration: none;
  transition: color 0.2s;
}

.popup-link:hover {
  color: #fff;
  text-decoration: underline;
}

/* ==================== 主体 ==================== */
.popup-body {
  flex: 1;
  padding: 16px 20px 20px;
  background: var(--popup-bg-subtle);
}

/* ==================== 提示信息 ==================== */
.popup-alert {
  padding: 12px 14px;
  border-radius: var(--popup-radius-sm);
  font-size: 13px;
  line-height: 1.5;
}

.popup-alert--warning {
  background: var(--popup-warning-bg);
  border: 1px solid #fde68a;
  color: var(--popup-warning);
}

.popup-alert--warning a {
  color: var(--popup-warning);
  font-weight: 500;
  text-decoration: none;
}

.popup-alert--warning a:hover {
  text-decoration: underline;
}

/* ==================== 用户信息 ==================== */
.popup-user-info {
  padding: 12px 14px;
  margin-bottom: 12px;
  background: var(--popup-bg);
  border: 1px solid var(--popup-border);
  border-radius: var(--popup-radius-sm);
  font-size: 13px;
  line-height: 1.5;
}

.popup-user-info__label {
  color: var(--popup-text-secondary);
}

.popup-user-info__name {
  font-weight: 600;
  color: var(--popup-primary);
}

.popup-user-info__tip {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--popup-text-muted);
}

/* ==================== 开关行 ==================== */
.popup-switch-row {
  margin-bottom: 16px;
  padding: 10px 14px;
  background: var(--popup-bg);
  border: 1px solid var(--popup-border);
  border-radius: var(--popup-radius-sm);
}

/* 透视眼开关 */
.perspective-eye-switch-wrap {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.perspective-eye-switch-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.perspective-eye-switch-slider {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  background: var(--popup-border);
  border-radius: 24px;
  transition: background 0.25s ease;
  flex-shrink: 0;
}

.perspective-eye-switch-slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 2px;
  top: 2px;
  background: #fff;
  border-radius: 50%;
  box-shadow: var(--popup-shadow);
  transition: transform 0.25s ease;
}

.perspective-eye-switch-input:checked + .perspective-eye-switch-slider {
  background: var(--popup-primary);
}

.perspective-eye-switch-input:checked + .perspective-eye-switch-slider::before {
  transform: translateX(20px);
}

.perspective-eye-switch-text {
  margin-right: 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--popup-text);
}

/* ==================== 卡片 ==================== */
.popup-card {
  background: var(--popup-bg);
  border: 1px solid var(--popup-border);
  border-radius: var(--popup-radius);
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--popup-shadow);
}

.popup-card:last-child {
  margin-bottom: 0;
}

.popup-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--popup-text);
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--popup-border);
}

/* ==================== 表单 ==================== */
.popup-form-group {
  margin-bottom: 0;
}

.popup-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--popup-text-secondary);
  margin-bottom: 8px;
}

.popup-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.popup-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--popup-text);
  background: var(--popup-bg);
  border: 1px solid var(--popup-border);
  border-radius: var(--popup-radius-sm);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.popup-input::placeholder {
  color: var(--popup-text-muted);
}

.popup-input:focus {
  outline: none;
  border-color: var(--popup-primary);
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
}

/* ==================== 按钮组 ==================== */
.popup-btn-group {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.popup-btn {
  height: 36px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: var(--popup-radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.popup-btn--primary {
  background: var(--popup-primary);
  color: #fff;
}

.popup-btn--primary:hover {
  background: var(--popup-primary-hover);
}

.popup-btn--primary:active {
  background: var(--popup-primary-active);
}

.popup-btn--secondary {
  background: var(--popup-secondary);
  color: var(--popup-text);
  border: 1px solid var(--popup-border);
}

.popup-btn--secondary:hover {
  background: var(--popup-secondary-hover);
  border-color: #d1d5db;
}

.popup-btn--block {
  width: 100%;
  margin-bottom: 12px;
}

/* ==================== 店铺列表 ==================== */
.popup-shop-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 0;
  border-radius: var(--popup-radius-sm);
}

.popup-shop-list::-webkit-scrollbar {
  width: 6px;
}

.popup-shop-list::-webkit-scrollbar-track {
  background: var(--popup-bg-subtle);
  border-radius: 3px;
}

.popup-shop-list::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.popup-shop-list::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

.popup-shop-list label {
  display: block;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--popup-text);
  cursor: pointer;
  border-radius: var(--popup-radius-sm);
  transition: background 0.2s, color 0.2s;
}

.popup-shop-list label:hover {
  background: var(--popup-bg-subtle);
  color: var(--popup-primary);
}

.popup-shop-list label + br {
  display: none;
}

/* ==================== 兼容旧选择器 ==================== */
#shopList .popup-card__title {
  margin-top: 4px;
  margin-bottom: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--popup-border);
}

#shopList .popup-card__title:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
</style>
