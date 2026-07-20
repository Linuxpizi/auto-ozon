<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  NConfigProvider,
  NDialogProvider,
  NButton,
  NCard,
  NInput,
  NIcon,
  NMessageProvider,
  NTabPane,
  NTabs,
  type GlobalThemeOverrides,
} from 'naive-ui'
import {
  CloudDoneOutline,
  CloudOfflineOutline,
  CloudOutline,
  CubeOutline,
  PulseOutline,
} from '@vicons/ionicons5'
import RecordsPanel from '@/components/popup/RecordsPanel.vue'
import ScrapePanel from '@/components/popup/ScrapePanel.vue'
import { checkBackendHealth, login, register } from '@/lib/utils/api'
import { clearAuthSession, getAuthSession } from '@/lib/utils/storage'
import type { AuthSession } from '@/lib/utils/types'
import packageJson from '@/package.json'

const activeTab = ref('scrape')
const backendOk = ref<boolean | null>(null)
const session = ref<AuthSession | null>(null)
const authMode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const name = ref('')
const confirmPassword = ref('')
const authLoading = ref(false)
const authError = ref('')
const extensionName = packageJson.displayName || packageJson.name
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#5b5cf0',
    primaryColorHover: '#7475f4',
    primaryColorPressed: '#4546d7',
    primaryColorSuppl: '#5b5cf0',
    successColor: '#16a273',
    warningColor: '#d58a13',
    errorColor: '#dd5365',
    borderRadius: '10px',
    fontSize: '13px',
  },
  Button: { borderRadiusMedium: '10px', borderRadiusLarge: '12px' },
  Card: { borderRadius: '16px' },
  Tabs: { tabFontWeightActive: '650' },
}
const connectionLabel = computed(() => backendOk.value === null ? '检测中' : backendOk.value ? '服务正常' : '服务离线')
const connectionType = computed(() => backendOk.value === null ? 'pending' : backendOk.value ? 'online' : 'offline')
const connectionIcon = computed(() => backendOk.value === null ? CloudOutline : backendOk.value ? CloudDoneOutline : CloudOfflineOutline)
const isRegister = computed(() => authMode.value === 'register')
const userLabel = computed(() => session.value?.user.name || session.value?.user.email || '')

async function refreshBackend() {
  backendOk.value = null
  backendOk.value = await checkBackendHealth()
}

async function refreshSession() {
  session.value = await getAuthSession()
  if (session.value) await refreshBackend()
  else backendOk.value = null
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
  } catch (error) {
    authError.value = error instanceof Error ? error.message : '认证失败，请稍后重试'
  } finally {
    authLoading.value = false
  }
}

async function logout() {
  await clearAuthSession()
  session.value = null
  backendOk.value = null
}

onMounted(refreshSession)
watch(activeTab, (tab) => tab === 'records' && session.value && refreshBackend())
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NDialogProvider>
      <NMessageProvider>
        <main class="popup-shell">
          <header class="app-header">
            <div class="brand-mark" aria-hidden="true"><NIcon :component="CubeOutline" /></div>
            <div class="brand-copy">
              <div><strong>{{ extensionName }}</strong><span class="version">v{{ packageJson.version }}</span></div>
              <span>跨境商品采集工作台</span>
            </div>
            <button class="connection" :class="connectionType" type="button" @click="refreshBackend">
              <NIcon :component="connectionIcon" />
              <span>{{ connectionLabel }}</span>
            </button>
          </header>

          <div v-if="session" class="workspace-heading">
            <div>
              <span class="eyebrow"><NIcon :component="PulseOutline" />Extension workspace</span>
              <h1>商品采集控制台</h1>
            </div>
            <div class="account-summary">
              <span class="platform-count">{{ userLabel }}</span>
              <button class="logout-button" type="button" @click="logout">退出</button>
            </div>
          </div>

          <section v-if="!session" class="auth-card-wrap">
            <NCard class="auth-card" :bordered="false">
              <div class="auth-intro">
                <span class="eyebrow"><NIcon :component="PulseOutline" />Account access</span>
                <h1>{{ isRegister ? '创建工作台账号' : '登录采集工作台' }}</h1>
                <p>登录后即可同步采集记录并使用跨平台采集能力。</p>
              </div>
              <div class="auth-switch">
                <button type="button" :class="{ active: !isRegister }" @click="authMode = 'login'; authError = ''">登录</button>
                <button type="button" :class="{ active: isRegister }" @click="authMode = 'register'; authError = ''">注册</button>
              </div>
              <label v-if="isRegister" class="field-label">称呼（可选）</label>
              <NInput v-if="isRegister" v-model:value="name" placeholder="例如：小明" class="auth-input" />
              <label class="field-label">邮箱</label>
              <NInput v-model:value="email" type="text" placeholder="name@example.com" class="auth-input" @keyup.enter="submitAuth" />
              <label class="field-label">密码</label>
              <NInput v-model:value="password" type="password" show-password-on="click" placeholder="至少 8 位字符" class="auth-input" @keyup.enter="submitAuth" />
              <template v-if="isRegister">
                <label class="field-label">确认密码</label>
                <NInput v-model:value="confirmPassword" type="password" show-password-on="click" placeholder="再次输入密码" class="auth-input" @keyup.enter="submitAuth" />
              </template>
              <p v-if="authError" class="auth-error">{{ authError }}</p>
              <NButton type="primary" block size="large" :loading="authLoading" @click="submitAuth">
                {{ isRegister ? '注册并开始使用' : '登录' }}
              </NButton>
            </NCard>
          </section>

          <NTabs v-else v-model:value="activeTab" type="segment" animated class="app-tabs">
            <NTabPane name="scrape" tab="采集中心"><ScrapePanel /></NTabPane>
            <NTabPane name="records" tab="采集记录"><RecordsPanel /></NTabPane>
          </NTabs>
        </main>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>

<style scoped>
.popup-shell { width: 420px; min-height: 600px; padding-bottom: 16px; overflow: hidden; background: #f4f5fa; }
.app-header { height: 78px; padding: 16px 18px; display: flex; align-items: center; gap: 12px; color: white; background: linear-gradient(125deg, #25275f, #4748c9 58%, #6b55d9); position: relative; overflow: hidden; }
.app-header::before, .app-header::after { content: ''; position: absolute; border-radius: 50%; background: rgba(255,255,255,.08); pointer-events: none; }
.app-header::before { width: 150px; height: 150px; right: -58px; top: -100px; }
.app-header::after { width: 82px; height: 82px; left: 190px; bottom: -68px; }
.brand-mark { width: 42px; height: 42px; flex: none; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.2); border-radius: 13px; background: rgba(255,255,255,.14); font-size: 22px; box-shadow: inset 0 1px 0 rgba(255,255,255,.2); }
.brand-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 2px; line-height: 1.35; }
.brand-copy > div { display: flex; align-items: center; gap: 7px; }
.brand-copy strong { max-width: 155px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; letter-spacing: .01em; }
.brand-copy > span { color: rgba(255,255,255,.62); font-size: 11px; }
.version { padding: 2px 5px; border-radius: 5px; color: rgba(255,255,255,.75); background: rgba(255,255,255,.1); font-size: 9px; }
.connection { z-index: 1; display: flex; align-items: center; gap: 5px; padding: 7px 9px; border: 1px solid rgba(255,255,255,.13); border-radius: 999px; color: rgba(255,255,255,.88); background: rgba(20,20,60,.16); cursor: pointer; font-size: 10px; transition: background .2s ease; }
.connection:hover { background: rgba(255,255,255,.16); }
.connection .n-icon { font-size: 14px; color: #f8c65b; }
.connection.online .n-icon { color: #68e1b4; }
.connection.offline .n-icon { color: #ff8998; }
.workspace-heading { padding: 18px 18px 14px; display: flex; align-items: flex-end; justify-content: space-between; }
.workspace-heading h1 { margin: 5px 0 0; color: #202236; font-size: 20px; line-height: 1.15; }
.eyebrow { display: inline-flex; align-items: center; gap: 5px; color: #777b91; font-size: 10px; font-weight: 650; letter-spacing: .09em; text-transform: uppercase; }
.platform-count { padding: 5px 8px; border: 1px solid #e0e1ea; border-radius: 8px; color: #73768b; background: rgba(255,255,255,.7); font-size: 10px; }
.account-summary { display: flex; align-items: center; gap: 7px; max-width: 190px; }
.account-summary .platform-count { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logout-button { padding: 4px 0; border: 0; color: #777b91; background: transparent; cursor: pointer; font-size: 10px; }
.logout-button:hover { color: #5b5cf0; }
.app-tabs { padding: 0 14px; }
.app-tabs :deep(.n-tabs-rail) { padding: 4px; border: 1px solid #e7e8ef; background: #e9eaf1; }
.app-tabs :deep(.n-tabs-tab) { font-size: 12px; }
.app-tabs :deep(.n-tabs-pane-wrapper) { margin-top: 12px; }
.auth-card-wrap { padding: 10px 18px 24px; }
.auth-card { background: white; box-shadow: 0 10px 30px rgba(38, 41, 95, .08); }
.auth-intro h1 { margin: 6px 0 5px; color: #202236; font-size: 21px; }
.auth-intro p { margin: 0 0 18px; color: #777b91; font-size: 12px; line-height: 1.6; }
.auth-switch { display: flex; gap: 4px; padding: 4px; margin-bottom: 18px; border-radius: 9px; background: #eef0f7; }
.auth-switch button { flex: 1; padding: 8px; border: 0; border-radius: 7px; color: #777b91; background: transparent; cursor: pointer; font-size: 12px; }
.auth-switch button.active { color: #3e40b3; background: white; box-shadow: 0 2px 8px rgba(50, 53, 130, .1); font-weight: 650; }
.field-label { display: block; margin: 10px 0 6px; color: #53566c; font-size: 11px; font-weight: 600; }
.auth-input { margin-bottom: 2px; }
.auth-error { margin: 12px 0; color: #d84d61; font-size: 11px; line-height: 1.5; }
</style>