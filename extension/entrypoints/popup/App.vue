<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NButton,
  NConfigProvider,
  NDialogProvider,
  NInput,
  NInputNumber,
  NMessageProvider,
  type GlobalThemeOverrides,
} from 'naive-ui'
import OzonboxPanel from '@/components/popup/OzonboxPanel.vue'
import RecordsPanel from '@/components/popup/RecordsPanel.vue'
import ScrapePanel from '@/components/popup/ScrapePanel.vue'
import { validatedErpBaseUrl } from '@/lib/ozonbox/erp-url'
import { isOzonProductUrl } from '@/lib/ozonbox/url'
import { checkBackendHealth, getCurrentUser, login, register } from '@/lib/utils/api'
import { clearAuthSession, getAuthSession, getSettings, saveAuthSession, saveSettings } from '@/lib/utils/storage'
import type { AuthSession } from '@/lib/utils/types'
import packageJson from '@/package.json'

type PopupView = 'home' | 'auth' | 'settings' | 'scrape' | 'records'

const APP_NAME = '鲸智 AI'
const view = ref<PopupView>('home')
const session = ref<AuthSession | null>(null)
const sessionLoading = ref(true)
const backendOk = ref<boolean | null>(null)
const erpBaseUrl = ref('')
const isOzonProductPage = ref(false)
const authMode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const name = ref('')
const confirmPassword = ref('')
const authLoading = ref(false)
const logoutLoading = ref(false)
const authError = ref('')
const homeNotice = ref('')
const erpBaseUrlDraft = ref('')
const ozonListTarget = ref(50)
const ozonListTargetDraft = ref<number | null>(50)
const settingsError = ref('')
const settingsSaving = ref(false)

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1677ff',
    primaryColorHover: '#4096ff',
    primaryColorPressed: '#0958d9',
    primaryColorSuppl: '#1677ff',
    successColor: '#16a34a',
    borderRadius: '8px',
    fontSize: '13px',
  },
  Button: { borderRadiusMedium: '8px', borderRadiusLarge: '8px' },
  Card: { borderRadius: '12px' },
}

const isRegister = computed(() => authMode.value === 'register')
const userLabel = computed(() => session.value?.user.name || session.value?.user.email || '')
const managerUrl = computed(() => {
  if (!erpBaseUrl.value.trim()) return ''
  try {
    return validatedErpBaseUrl(erpBaseUrl.value)
  } catch {
    return ''
  }
})
const loginStatus = computed(() => {
  if (sessionLoading.value) return { label: '正在检查登录状态', className: 'pending', symbol: '⚪' }
  if (session.value) return { label: '已登录', className: 'logged-in', symbol: '✅' }
  return { label: '未登录', className: 'logged-out', symbol: '⚪' }
})
const serviceLabel = computed(() => {
  if (!session.value || backendOk.value === null) return ''
  return backendOk.value ? '服务正常' : '服务离线'
})
const viewTitle = computed(() => view.value === 'records' ? '采集记录' : '采集中心')

async function inspectActivePage() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    isOzonProductPage.value = isOzonProductUrl(tab?.url || '')
  } catch {
    isOzonProductPage.value = false
  }
}

async function loadSettings() {
  try {
    const settings = await getSettings()
    erpBaseUrl.value = settings.erpBaseUrl
    erpBaseUrlDraft.value = settings.erpBaseUrl
    ozonListTarget.value = settings.ozon.maxItems
    ozonListTargetDraft.value = settings.ozon.maxItems
  } catch {
    erpBaseUrl.value = ''
    erpBaseUrlDraft.value = ''
    ozonListTarget.value = 50
    ozonListTargetDraft.value = 50
  }
}

async function refreshBackend() {
  backendOk.value = null
  backendOk.value = await checkBackendHealth()
}

async function refreshSession() {
  sessionLoading.value = true
  try {
    const storedSession = await getAuthSession()
    session.value = storedSession
    if (!storedSession) {
      backendOk.value = null
      return
    }

    const currentUser = await getCurrentUser()
    const refreshedSession = { ...storedSession, user: currentUser }
    session.value = refreshedSession
    await saveAuthSession(refreshedSession)
    await refreshBackend()
  } catch {
    // 401 会由 API 公共请求层清除会话；普通网络错误保留本地会话并标记服务离线。
    session.value = await getAuthSession().catch(() => null)
    if (session.value) await refreshBackend()
    else backendOk.value = null
  } finally {
    sessionLoading.value = false
  }
}

function validateAuth(): string | null {
  const normalizedEmail = email.value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return '请输入有效的邮箱地址'
  if (password.value.length < 8) return '密码至少需要 8 位'
  if (isRegister.value && password.value !== confirmPassword.value) return '两次输入的密码不一致'
  return null
}

async function submitAuth() {
  authError.value = ''
  const validationError = validateAuth()
  if (validationError) {
    authError.value = validationError
    return
  }

  authLoading.value = true
  try {
    session.value = isRegister.value
      ? await register(email.value.trim(), password.value, name.value.trim() || undefined)
      : await login(email.value.trim(), password.value)
    password.value = ''
    confirmPassword.value = ''
    await refreshBackend()
    view.value = 'home'
  } catch (error) {
    authError.value = error instanceof Error ? error.message : '认证失败，请稍后重试'
  } finally {
    authLoading.value = false
  }
}

async function logout() {
  logoutLoading.value = true
  try {
    await clearAuthSession()
    session.value = null
    backendOk.value = null
    view.value = 'home'
  } finally {
    logoutLoading.value = false
  }
}

function openAuth() {
  authError.value = ''
  view.value = 'auth'
}

function goHome() {
  view.value = 'home'
}

function setAuthMode(mode: 'login' | 'register') {
  authMode.value = mode
  authError.value = ''
}

function openSettings() {
  erpBaseUrlDraft.value = erpBaseUrl.value
  ozonListTargetDraft.value = ozonListTarget.value
  settingsError.value = ''
  homeNotice.value = ''
  view.value = 'settings'
}

async function saveErpSettings() {
  settingsError.value = ''
  settingsSaving.value = true
  try {
    const normalizedUrl = validatedErpBaseUrl(erpBaseUrlDraft.value)
    const normalizedTarget = ozonListTargetDraft.value
    if (!Number.isSafeInteger(normalizedTarget) || (normalizedTarget ?? 0) < 1) {
      throw new Error('Ozon 目标数量必须是大于 0 的整数')
    }
    const currentSettings = await getSettings()
    await saveSettings({
      ...currentSettings,
      erpBaseUrl: normalizedUrl,
      ozon: { ...currentSettings.ozon, maxItems: normalizedTarget as number },
    })
    erpBaseUrl.value = normalizedUrl
    erpBaseUrlDraft.value = normalizedUrl
    ozonListTarget.value = normalizedTarget as number
    ozonListTargetDraft.value = normalizedTarget
    homeNotice.value = '插件设置已保存'
    view.value = 'home'
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : '保存失败，请稍后重试'
  } finally {
    settingsSaving.value = false
  }
}

function handleManagerClick(event: MouseEvent) {
  homeNotice.value = ''
  if (managerUrl.value) return
  event.preventDefault()
  openSettings()
}

function openWorkspace(target: 'scrape' | 'records') {
  if (!session.value) {
    openAuth()
    return
  }
  view.value = target
}

function switchWorkspace() {
  view.value = view.value === 'records' ? 'scrape' : 'records'
}

onMounted(() => {
  void refreshSession()
  void loadSettings()
  void inspectActivePage()
})
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NDialogProvider>
      <NMessageProvider>
        <main class="popup-shell">
          <section v-if="view === 'home'" class="home-view">
            <a
              class="brand-entry"
              :class="{ unconfigured: !managerUrl }"
              :href="managerUrl || undefined"
              target="_blank"
              rel="noreferrer"
              :aria-label="managerUrl ? '进入 ERP 管理中心' : '配置 ERP Web 地址'"
              @click="handleManagerClick"
            >
              <img class="brand-logo" src="/brand-logo.png" :alt="APP_NAME">
              <div class="welcome">欢迎使用{{ APP_NAME }}</div>
              <span class="manager-link">点击进入 ERP 管理中心</span>
              <div class="version">v{{ packageJson.version }}</div>
            </a>

            <div class="login-section">
              <div class="login-status" :class="loginStatus.className">
                {{ loginStatus.symbol }} {{ loginStatus.label }}
              </div>
              <div v-if="session && userLabel" class="user-label" :title="userLabel">{{ userLabel }}</div>
              <div v-if="serviceLabel" class="service-status" :class="{ offline: backendOk === false }">{{ serviceLabel }}</div>

              <template v-if="session">
                <div class="workspace-actions" aria-label="插件业务入口">
                  <button type="button" @click="openWorkspace('scrape')">采集中心</button>
                  <button type="button" @click="openWorkspace('records')">采集记录</button>
                </div>
                <button class="link-button logout-link" type="button" :disabled="logoutLoading" @click="logout">
                  {{ logoutLoading ? '正在退出' : '退出插件登录' }}
                </button>
              </template>
              <template v-else-if="!sessionLoading">
                <div class="login-hint">请点击插件的登录按钮登录</div>
                <button class="link-button" type="button" @click="openAuth">登录插件</button>
              </template>
              <button class="link-button settings-link" type="button" @click="openSettings">
                {{ managerUrl ? '修改插件设置' : '配置插件设置' }}
              </button>
              <p v-if="homeNotice" class="home-notice">{{ homeNotice }}</p>
            </div>
          </section>

          <section v-else-if="view === 'auth'" class="compact-view auth-view">
            <header class="view-header">
              <button class="back-button" type="button" @click="goHome">返回</button>
              <strong>{{ isRegister ? '注册鲸智 AI' : '登录鲸智 AI' }}</strong>
              <span aria-hidden="true"></span>
            </header>
            <div class="auth-switch">
              <button type="button" :class="{ active: !isRegister }" @click="setAuthMode('login')">登录</button>
              <button type="button" :class="{ active: isRegister }" @click="setAuthMode('register')">注册</button>
            </div>
            <label v-if="isRegister" class="field-label">称呼（可选）</label>
            <NInput v-if="isRegister" v-model:value="name" placeholder="例如：小明" />
            <label class="field-label">邮箱</label>
            <NInput v-model:value="email" type="text" placeholder="name@example.com" @keyup.enter="submitAuth" />
            <label class="field-label">密码</label>
            <NInput v-model:value="password" type="password" show-password-on="click" placeholder="至少 8 位字符" @keyup.enter="submitAuth" />
            <template v-if="isRegister">
              <label class="field-label">确认密码</label>
              <NInput v-model:value="confirmPassword" type="password" show-password-on="click" placeholder="再次输入密码" @keyup.enter="submitAuth" />
            </template>
            <p v-if="authError" class="auth-error">{{ authError }}</p>
            <NButton class="auth-submit" type="primary" block :loading="authLoading" @click="submitAuth">
              {{ isRegister ? '注册并登录' : '登录插件' }}
            </NButton>
          </section>

          <section v-else-if="view === 'settings'" class="compact-view settings-view">
            <header class="view-header">
              <button class="back-button" type="button" @click="goHome">返回</button>
              <strong>插件设置</strong>
              <span aria-hidden="true"></span>
            </header>
            <p class="settings-description">配置 ERP Web 根地址与 Ozon 列表采集目标。目标仅统计命中选品规则且成功上报的商品。</p>
            <label class="field-label" for="erp-base-url">ERP Web 根地址</label>
            <NInput
              id="erp-base-url"
              v-model:value="erpBaseUrlDraft"
              type="text"
              placeholder="请输入 http 或 https 地址"
              clearable
              @keyup.enter="saveErpSettings"
            />
            <p class="settings-hint">仅支持不含账号密码、查询参数和锚点的 http/https 地址。</p>
            <label class="field-label" for="ozon-list-target">Ozon 列表采集目标数量</label>
            <NInputNumber
              id="ozon-list-target"
              v-model:value="ozonListTargetDraft"
              :min="1"
              :precision="0"
              :step="1"
              placeholder="请输入目标数量"
            />
            <p class="settings-hint">未命中规则或处理失败的商品不计入目标，默认 50。</p>
            <p v-if="settingsError" class="auth-error" role="alert">{{ settingsError }}</p>
            <NButton class="auth-submit" type="primary" block :loading="settingsSaving" @click="saveErpSettings">
              保存插件设置
            </NButton>
          </section>

          <section v-else class="workspace-view">
            <header class="view-header workspace-header">
              <button class="back-button" type="button" @click="goHome">返回</button>
              <strong>{{ viewTitle }}</strong>
              <button class="switch-button" type="button" @click="switchWorkspace">
                {{ view === 'records' ? '去采集' : '看记录' }}
              </button>
            </header>
            <div class="workspace-content">
              <RecordsPanel v-if="view === 'records'" />
              <OzonboxPanel v-else-if="isOzonProductPage" />
              <ScrapePanel v-else />
            </div>
          </section>
        </main>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>

<style scoped>
.popup-shell { width: 320px; overflow: hidden; color: #262626; background: #fff; }
.home-view { width: 320px; padding: 16px; }
.brand-entry { display: flex; flex-direction: column; align-items: center; justify-content: center; color: inherit; text-decoration: none; transition: filter .2s ease; }
.brand-entry:hover { filter: drop-shadow(0 4px 8px rgba(22, 119, 255, .16)); }
.brand-logo { width: 60px; height: 60px; margin-bottom: 20px; object-fit: contain; }
.welcome { margin-bottom: 4px; color: #9ca3af; font-size: 14px; line-height: 20px; }
.manager-link { padding: 4px 15px; color: #1677ff; font-size: 14px; line-height: 22px; }
.brand-entry.unconfigured .manager-link { color: #d97706; }
.version { margin-top: 8px; color: #6b7280; font-size: 12px; line-height: 18px; }
.login-section { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; margin-top: 20px; }
.login-status { margin-bottom: 8px; color: #6b7280; font-size: 12px; line-height: 18px; }
.login-status.logged-in { color: #16a34a; }
.login-status.pending { color: #9ca3af; }
.user-label { max-width: 246px; overflow: hidden; color: #595959; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.service-status { color: #16a34a; font-size: 11px; }
.service-status.offline { color: #ef4444; }
.login-hint { color: #9ca3af; font-size: 12px; line-height: 18px; }
.link-button, .back-button, .switch-button { padding: 0; border: 0; color: #1677ff; background: transparent; cursor: pointer; font-size: 12px; line-height: 20px; }
.link-button:hover, .back-button:hover, .switch-button:hover { color: #4096ff; }
.link-button:disabled { color: #bfbfbf; cursor: default; }
.logout-link { margin-top: 2px; }
.settings-link { margin-top: 2px; color: #6b7280; }
.workspace-actions { display: grid; width: 100%; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.workspace-actions button { padding: 7px 10px; border: 1px solid #d9d9d9; border-radius: 6px; color: #595959; background: #fff; cursor: pointer; font-size: 12px; }
.workspace-actions button:hover { border-color: #4096ff; color: #1677ff; }
.home-notice { margin: 2px 0 0; color: #d97706; font-size: 11px; line-height: 1.5; text-align: center; }
.compact-view { width: 320px; padding: 16px; }
.view-header { display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; margin-bottom: 16px; }
.view-header strong { color: #262626; font-size: 14px; text-align: center; }
.view-header > :last-child { text-align: right; }
.auth-switch { display: flex; gap: 4px; padding: 3px; margin-bottom: 14px; border-radius: 7px; background: #f5f5f5; }
.auth-switch button { flex: 1; padding: 6px; border: 0; border-radius: 5px; color: #8c8c8c; background: transparent; cursor: pointer; font-size: 12px; }
.auth-switch button.active { color: #1677ff; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, .08); }
.field-label { display: block; margin: 10px 0 5px; color: #595959; font-size: 11px; }
.auth-error { margin: 10px 0 0; color: #ef4444; font-size: 11px; line-height: 1.5; }
.auth-submit { margin-top: 14px; }
.settings-description, .settings-hint { margin: 0; color: #6b7280; font-size: 11px; line-height: 1.6; }
.settings-hint { margin-top: 6px; color: #8c8c8c; }
.workspace-view { width: 320px; max-height: 580px; overflow-y: auto; background: #f5f5f7; }
.workspace-header { position: sticky; z-index: 3; top: 0; padding: 12px 14px; margin: 0; border-bottom: 1px solid #e8e8ec; background: rgba(255, 255, 255, .96); }
.workspace-content { padding: 10px; }
</style>
