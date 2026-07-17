<template>
  <div id="mjgd-widget-container">
    <div v-show="!crawlOverlayVisible" class="mjgd-widget-container-inner" ref="widgetRef" :style="containerStyle" @mousedown="onContainerMouseDown">
      <!-- Icon - 只在手动折叠时显示 -->
      <div v-if="isCollapsed" class="mjgd-icon" @click="toggleWidget">
        <img :src="logoUrl" alt="logo" class="mjgd-icon-logo">
      </div>

      <!-- 本地模式功能菜单，与圆标共用同一容器锚点 -->
      <div v-if="showMenu" class="mjgd-modal">
        <div class="mjgd-modal-header">
          <span class="mjgd-widget-drag-handle">功能菜单</span>
          <span class="mjgd-minimize-btn" @click="handleMinimize">-</span>
        </div>
        <!-- 品牌信息 -->
        <div class="mjgd-brand-info">
          <div class="mjgd-brand-header">
            <img :src="logoUrl" alt="logo" class="mjgd-brand-logo">
            <span class="mjgd-brand-name">Auto Ozon · 本地模式</span>
          </div>
          <div class="mjgd-version-info" @click="handleUpdateDownload">当前版本 {{ currentVersion }}<span v-if="hasNewVersion" class="mjgd-update-badge"></span></div>
          <div class="mjgd-website-link">本地控制台: <a :href="localFrontendUrl" target="_blank" rel="noopener noreferrer" class="mjgd-website-link-text">{{ localFrontendLabel }}</a></div>
        </div>
        <div class="mjgd-brand-info-border"></div>
        <!-- 功能菜单 -->
        <div class="mjgd_modal_body_menu">
          <div class="mjgd_user_info_bar">
            <div class="mjgd-user-info">{{ currentUserName }}</div>
          </div>
          <div class="mjgd-menu-btn-list">
            <div v-if="widgetMenuPrimaryItems.length" class="mjgd-menu-btn-group">
              <div v-for="item in widgetMenuPrimaryItems" :key="item.key" class="mjgd-menu-btn mjgd-primary-btn" :class="{ 'mjgd-profit-btn-loading': isMenuItemLoading(item) }"
                @click="handleMenuItemClick(item, $event)">
                <span v-if="isMenuItemLoading(item)" class="mjgd-profit-spinner" aria-hidden="true"></span>
                <AiMenuBtnIcon v-if="isAiIconMenuItem(item)" />
                <span class="mjgd-menu-btn-label">{{ getMenuItemLabel(item) }}</span>
              </div>
            </div>
            <div class="mjgd-menu-btn-divider"></div>
            <div v-if="widgetMenuSecondaryItems.length" class="mjgd-menu-btn-group">
              <div v-for="item in widgetMenuSecondaryItems" :key="item.key" class="mjgd-menu-btn mjgd-primary-btn" :class="{ 'mjgd-profit-btn-loading': isMenuItemLoading(item) }"
                @click="handleMenuItemClick(item, $event)">
                <span v-if="isMenuItemLoading(item)" class="mjgd-profit-spinner" aria-hidden="true"></span>
                <AiMenuBtnIcon v-if="isAiIconMenuItem(item)" />
                <span class="mjgd-menu-btn-label">{{ getMenuItemLabel(item) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 利润计算器右侧抽屉（Teleport 到 body，避免被宿主页裁剪） -->
    <Teleport to="body">
      <div id="bcs_profit_drawer_mask" v-show="profitDrawerMaskShown" class="bcs-profit-drawer-mask" @click="onProfitDrawerMaskClick"></div>
      <div id="bcs_profit_drawer" ref="profitDrawerRef" class="bcs-profit-drawer" :style="profitDrawerPanelStyle">
        <div id="bcs_profit_drawer_resize" ref="profitResizeHandleRef" class="bcs-profit-drawer-resize" @mousedown="onProfitDrawerResizeMouseDown"></div>
        <div class="bcs-profit-drawer-toolbar">
          <button id="bcs_profit_drawer_close" type="button" class="bcs-profit-drawer-close" @click="closeProfitDrawer">×</button>
        </div>
        <iframe id="bcs_profit_drawer_iframe" ref="profitIframeRef" class="bcs-profit-drawer-iframe" allow="clipboard-read; clipboard-write" title="利润计算器" :src="profitIframeSrc" />
      </div>
    </Teleport>

    <!-- 强制更新模态框 -->
    <div v-if="showForceUpdateModal" class="mjgd-force-update-overlay">
      <div class="mjgd-force-update-modal">
        <div class="mjgd-force-update-header">
          <svg class="mjgd-force-update-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
            <path d="M12 7V13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <circle cx="12" cy="16.5" r="1" fill="currentColor" />
          </svg>
          <span class="mjgd-force-update-title">发现新版本</span>
        </div>
        <div class="mjgd-force-update-body">
          <div class="mjgd-force-update-version">
            <span class="mjgd-version-label">当前版本:</span>
            <span class="mjgd-version-value">{{ currentVersion }}</span>
          </div>
          <div v-if="newVersionInfo" class="mjgd-force-update-version">
            <span class="mjgd-version-label">最新版本:</span>
            <span class="mjgd-version-value mjgd-version-new">{{ newVersionInfo }}</span>
          </div>
          <p class="mjgd-update-info-remark" v-if="newVersionRemark">{{ newVersionRemark }}</p>
          <p class="mjgd-force-update-message" v-else>Ozon AI上品插件有新版本可用，请立即下载更新以继续使用。</p>
          <div class="mjgd-force-update-btn" @click="handleForceUpdateDownload">
            <svg class="mjgd-download-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3V15M12 15L7 10M12 15L17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M3 17V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            立即下载更新
          </div>
        </div>
      </div>
    </div>

    <!-- 检测到新版本弹窗 -->
    <div v-if="showUpdateInfoModal" class="mjgd-update-info-overlay">
      <div class="mjgd-update-info-modal">
        <div class="mjgd-update-info-header">
          <svg class="mjgd-update-info-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3V15M12 15L7 10M12 15L17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M3 17V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <span class="mjgd-update-info-title">发现新版本</span>
        </div>
        <div class="mjgd-update-info-body">
          <div class="mjgd-update-info-row">
            <span class="mjgd-update-info-label">当前版本:</span>
            <span class="mjgd-update-info-value">{{ currentVersion }}</span>
          </div>
          <div v-if="newVersionInfo" class="mjgd-update-info-row">
            <span class="mjgd-update-info-label">最新版本:</span>
            <span class="mjgd-update-info-value mjgd-update-info-value-new">{{ newVersionInfo }}</span>
          </div>
          <div v-if="newVersionPlatform" class="mjgd-update-info-row">
            <span class="mjgd-update-info-label">平台:</span>
            <span class="mjgd-update-info-value">{{ newVersionPlatform }}</span>
          </div>
          <p class="mjgd-update-info-remark" v-if="newVersionRemark">{{ newVersionRemark }}</p>
          <div class="mjgd-update-info-actions">
            <div class="mjgd-update-info-download-btn" @click="handleUpdateInfoDownload">下载更新</div>
            <div class="mjgd-update-info-dismiss-btn" @click="handleUpdateDismiss">稍后再说</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 使用提示弹窗 -->
    <div v-if="showNeedGoodsDetailModal" class="mjgd-ai-countdown-overlay">
      <div class="mjgd-ai-uploading-modal">
        <div class="mjgd-ai-uploading-content">
          <div class="mjgd-ai-uploading-icon">
            <svg t="1776335041878" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5500" width="64" height="64">
              <path
                d="M512 0C230.4 0 0 230.4 0 512s230.4 512 512 512 512-230.4 512-512S793.6 0 512 0z m0 981.333333C251.733333 981.333333 42.666667 772.266667 42.666667 512S251.733333 42.666667 512 42.666667s469.333333 209.066667 469.333333 469.333333-209.066667 469.333333-469.333333 469.333333z"
                p-id="5501" fill="#707070"></path>
              <path d="M554.666667 209.066667h-85.333334l21.333334 469.333333h42.666666z" p-id="5502" fill="#707070"></path>
              <path d="M512 806.4z" fill="#707070" p-id="5503"></path>
              <path d="M533.333333 742.4h-42.666666v85.333333h42.666666" p-id="5504" fill="#707070"></path>
            </svg>
          </div>
          <div class="mjgd-ai-uploading-title">请在商品详情页使用AI精铺上架功能</div>
          <div class="mjgd-ai-uploading-text">
            <div>使用AI精铺上架功能需进入商品详情页</div>
            <div>若商品详情页与商品列表在同一页面，请展开商品详情页。</div>
          </div>
          <button class="mjgd-ai-success-btn" @click="showNeedGoodsDetailModal = false">我知道了</button>
        </div>
      </div>
    </div>

    <!-- 三方采集：列表页点击「一键采集 / 复制图片」提示弹窗（对齐旧版 alert） -->
    <div v-if="showThirdPartyNeedDetailModal" class="mjgd-ai-countdown-overlay">
      <div class="mjgd-ai-uploading-modal">
        <div class="mjgd-ai-uploading-content">
          <div class="mjgd-ai-uploading-icon">
            <svg t="1776335041878" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5500" width="64" height="64">
              <path
                d="M512 0C230.4 0 0 230.4 0 512s230.4 512 512 512 512-230.4 512-512S793.6 0 512 0z m0 981.333333C251.733333 981.333333 42.666667 772.266667 42.666667 512S251.733333 42.666667 512 42.666667s469.333333 209.066667 469.333333 469.333333-209.066667 469.333333-469.333333 469.333333z"
                p-id="5501" fill="#707070"></path>
              <path d="M554.666667 209.066667h-85.333334l21.333334 469.333333h42.666666z" p-id="5502" fill="#707070"></path>
              <path d="M512 806.4z" fill="#707070" p-id="5503"></path>
              <path d="M533.333333 742.4h-42.666666v85.333333h42.666666" p-id="5504" fill="#707070"></path>
            </svg>
          </div>
          <div class="mjgd-ai-uploading-title">请前往商品详情页使用插件采集</div>
          <div class="mjgd-ai-uploading-text">
            <div>一键采集与复制图片功能需在商品详情页使用</div>
            <div>请先打开目标商品的详情页后再操作。</div>
          </div>
          <button class="mjgd-ai-success-btn" @click="showThirdPartyNeedDetailModal = false">我知道了</button>
        </div>
      </div>
    </div>

    <!-- 可采集的三方平台弹窗 -->
    <div v-if="showCollectPlatformModalVisible" class="mjgd-collect-platform-overlay" @click.self="closeCollectPlatformModal">
      <div class="mjgd-platform-modal" role="dialog" aria-modal="true">
        <div class="mjgd-platform-modal-header">
          <h2 class="mjgd-platform-modal-title">可采集的平台</h2>
          <button type="button" id="mjgd_platform_modal_close" class="mjgd-platform-modal-close" aria-label="关闭" @click="closeCollectPlatformModal">×</button>
        </div>
        <div class="mjgd-platform-modal-body">
          <div class="mjgd-platform-grid">
            <a :href="item.url" target="_blank" rel="noopener noreferrer" class="mjgd-platform-card" v-for="item in collectPlatformList" :key="item.key">
              <div class="mjgd-platform-card-title">{{ item.name }}</div>
              <div class="mjgd-platform-card-desc">{{ item.url }}</div>
              <div class="mjgd-platform-card-remark">{{ item.remark }}</div>
            </a>
          </div>
          <div class="mjgd-platform-footer-wrap">
            <a href="https://docs.qq.com/doc/DQ2RuSnBRaXFsWk1J" target="_blank" class="mjgd-platform-tutorial-link">✨️ ozonAI三方采集教程</a>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch, type CSSProperties } from 'vue'
import { apiService, API_CONFIG, type ApiResponse } from '../../utils/api'
import { showToast } from '../../utils/toast'
import { resolveAssetUrl } from '../../utils/runtime'
import { requestMainWorldWindowData, extractTitleFromRawData, extractPackagingFromRawData, getFallbackProductTitleFromDom, type ProfitPackagingHint, } from '../utils/profitDrawerPageContext'
import { isGoodsDetailPage as checkIsGoodsDetailPage, OZON_HOSTS } from '../utils/isGoodsDetailPage'
import { isOzonRetailSite } from '../utils/ozonList/ozonPageContext'
import { useOzonPageWatch } from '../utils/ozonList/useOzonPageWatch'
import { useOzonMenuActions } from '../utils/ozonList/useOzonMenuActions'
import { useThirdPartyCollect } from '../utils/thirdPartyCollect'
import { getVisibleSidebarButtons, type OzonSidebarAction } from './OzonList/sidebarButtons'
import AiMenuBtnIcon from './common/AiMenuBtnIcon.vue'
import { MJGD_OPEN_PROFIT_FROM_CARD } from '../utils/ozonList/cardHeadActions'
import { getCrawlSnapshot, subscribeCrawlState } from '../utils/ozonBatchCrawl/crawlController'
import fallbackLogoUrl from '../../assets/img/newlogo.png'

const chromeApi: any = (globalThis as any).chrome
const logoUrl = resolveAssetUrl('src/assets/img/newlogo.png', fallbackLogoUrl)
const localFrontendUrl = String(API_CONFIG.LOCAL_FRONTEND_URL || '').trim().replace(/\/$/, '')
const localFrontendLabel = localFrontendUrl.replace(/^https?:\/\//, '') || 'localhost'
const currentVersion = chromeApi?.runtime?.id && chromeApi?.runtime?.getManifest?.()
  ? chromeApi.runtime.getManifest().version
  : '0.0.0'

const emit = defineEmits<{
  (e: 'ai-collect'): void
  (e: 'ai-auto-select'): void
}>()

const { ozonPageType } = useOzonPageWatch()
const { ozonMenuLoadingAction, handleOzonMenuAction } = useOzonMenuActions()
// 三方「一键采集 / 复制图片」：showAiButtons 在不支持 AI 的平台隐藏 AI 按钮；showCollectButtons 在三方货源站点显示这两项
const {
  showCollectButtons,
  showAiButtons,
  oneClickLoading,
  showNeedDetailModal: showThirdPartyNeedDetailModal,
  handleOneClickCollect,
  handleCopyImages,
} = useThirdPartyCollect()
/** 列表页点击「定价工具」后 loading，防重复点击 */
const profitCalculateLoading = ref(false)
/** 商品信息采集弹窗显示时，整体隐藏浮动侧边栏（与旧插件 #cj_move_page.hide() 行为对齐） */
const crawlOverlayVisible = ref(getCrawlSnapshot().visible)
let unsubscribeCrawlState: (() => void) | null = null
/** Ozon 零售站中，在 Widget 菜单里追加站点专属按钮。 */
const visibleOzonMenuButtons = computed(() => {
  if (!isOzonRetailSite()) return []
  return getVisibleSidebarButtons(ozonPageType.value)
})

// 功能菜单按钮类型定义
type WidgetMenuItem =
  | { key: string; kind: 'ai-auto-select' }
  | { key: string; kind: 'one-click-collect' }
  | { key: string; kind: 'copy-images' }
  | { key: string; kind: 'profit-calc' }
  | { key: string; kind: 'ai-jingpu' }
  | { key: string; kind: 'collect-platform' }
  | { key: string; kind: 'ozon'; action: OzonSidebarAction; label: string; icon: string }
// 获取功能菜单按钮标签
function getMenuItemLabel(item: WidgetMenuItem): string {
  switch (item.kind) {
    case 'ai-auto-select':
      return '自动选品'
    case 'one-click-collect':
      return oneClickLoading.value ? '采集中...' : '一键采集'
    case 'copy-images':
      return '复制图片'
    case 'profit-calc':
      return '定价工具'
    case 'ai-jingpu':
      return '精铺上架'
    case 'collect-platform':
      return '可采集平台'
    case 'ozon':
      // 返回 Ozon 专属按钮的标签
      return item.label
  }
}
// AI 功能按钮用图标替代文案前缀「AI」
function isAiIconMenuItem(item: WidgetMenuItem): boolean {
  return item.kind === 'ai-auto-select' || item.kind === 'ai-jingpu'
}
// 判断功能菜单按钮是否处于加载状态
function isMenuItemLoading(item: WidgetMenuItem): boolean {
  if (item.kind === 'one-click-collect') return oneClickLoading.value
  if (item.kind === 'profit-calc') return profitCalculateLoading.value
  if (item.kind === 'ozon') return ozonMenuLoadingAction.value === item.action
  return false
}
// 处理功能菜单按钮点击事件
function handleMenuItemClick(item: WidgetMenuItem, event: MouseEvent) {
  if (isMenuItemLoading(item)) return
  switch (item.kind) {
    case 'ai-auto-select':
      handleOpenAiAutoSelect()
      break
    case 'one-click-collect':
      void handleOneClickCollect()
      break
    case 'copy-images':
      handleCopyImages()
      break
    case 'profit-calc':
      void handleCalculateProfitMenu()
      break
    case 'ai-jingpu':
      handleOpenAiCollect()
      break
    case 'collect-platform':
      showCollectPlatformModal()
      break
    case 'ozon':
      void handleOzonMenuAction(item.action, event)
      break
  }
}
// 计算 Ozon 专属按钮的映射关系
const visibleOzonBtnMap = computed(() => {
  const map = new Map<OzonSidebarAction, (typeof visibleOzonMenuButtons.value)[number]>()
  for (const btn of visibleOzonMenuButtons.value) {
    map.set(btn.action, btn)
  }
  return map
})
// 将 Ozon 专属按钮添加到功能菜单按钮列表
function pushOzonMenuItem(items: WidgetMenuItem[], action: OzonSidebarAction) {
  const btn = visibleOzonBtnMap.value.get(action)
  if (btn) {
    items.push({ key: `ozon-${action}`, kind: 'ozon', action, label: btn.label, icon: btn.icon })
  }
}

/** 功能菜单第一组：业务操作（双列 grid 上半区） */
const widgetMenuPrimaryItems = computed((): WidgetMenuItem[] => {
  const items: WidgetMenuItem[] = []
  if (showAiButtons.value) items.push({ key: 'ai-jingpu', kind: 'ai-jingpu' })
  // 自动选品暂时关闭，后续再开放
  // if (showAiButtons.value) items.push({ key: 'ai-auto-select', kind: 'ai-auto-select' })
  pushOzonMenuItem(items, 'quick_shelve')
  pushOzonMenuItem(items, 'edit_upload')
  if (showCollectButtons.value) {
    items.push({ key: 'one-click-collect', kind: 'one-click-collect' })
    items.push({ key: 'copy-images', kind: 'copy-images' })
  }
  pushOzonMenuItem(items, 'copy_format')
  pushOzonMenuItem(items, 'start_crawl')
  pushOzonMenuItem(items, 'load_more')
  // Ozon 零售站：定价工具放在第一组末尾，与业务操作按钮同区展示
  if (isOzonRetailSite()) {
    items.push({ key: 'profit-calc', kind: 'profit-calc' })
  }
  return items
})
/** 功能菜单第二组：工具与账户（双列 grid 下半区） */
const widgetMenuSecondaryItems = computed((): WidgetMenuItem[] => {
  const items: WidgetMenuItem[] = []
  pushOzonMenuItem(items, 'check_cookie')
  pushOzonMenuItem(items, 'bind_cookie')
  if (!isOzonRetailSite()) {
    items.push({ key: 'profit-calc', kind: 'profit-calc' })
  }
  items.push({ key: 'collect-platform', kind: 'collect-platform' })
  pushOzonMenuItem(items, 'settings')
  return items
})
const showMenu = ref(true)
const isCollapsed = ref(false) // 是否手动折叠
const currentUserName = ref('本地模式')

// 判断是否是商品详情页（响应式，供模板与菜单逻辑使用）
const isGoodsDetailPage = ref(false)
const checkGoodsDetailPage = () => {
  isGoodsDetailPage.value = checkIsGoodsDetailPage()
}
const showNeedGoodsDetailModal = ref(false)

function handleOpenAiCollect() {
  if (isGoodsDetailPage.value) { // 检查是否在商品详情页
    emit('ai-collect')
  } else {
    showNeedGoodsDetailModal.value = true
  }
}

function handleOpenAiAutoSelect() {
  emit('ai-auto-select')
}

// 可采集的三方平台弹窗
interface CollectPlatformItem {
  key: string
  name: string
  url: string
  remark?: string
}
const collectPlatformList: CollectPlatformItem[] = [
  { key: '1688', name: '1688', url: 'https://www.1688.com/', remark: '' },
  { key: 'pdd', name: '拼多多', url: 'https://mobile.yangkeduo.com/', remark: '拼多多平台限制较为严格，采集频率请控制在每分钟3个以内' },
  { key: 'pdd-pifa', name: '拼多多批发', url: 'https://pifa.pinduoduo.com/', remark: '' },
  { key: 'taobao', name: '淘宝', url: 'https://www.taobao.com/', remark: '' },
  { key: 'tmall', name: '天猫', url: 'https://www.tmall.com/', remark: '' },
  { key: 'amazon', name: '亚马逊', url: 'https://www.amazon.com/', remark: '' },
  { key: 'aliexpress', name: '速卖通', url: 'https://aliexpress.ru/', remark: '' },
  { key: 'wildberries', name: 'Wildberries', url: 'https://www.wildberries.ru/', remark: '' },
  { key: 'temu', name: 'Temu', url: 'https://www.temu.com/', remark: '' },
  { key: 'ozon', name: 'Ozon', url: 'https://www.ozon.ru/', remark: '' },
]
const showCollectPlatformModalVisible = ref(false)
function showCollectPlatformModal() {
  showCollectPlatformModalVisible.value = true
}
function closeCollectPlatformModal() {
  showCollectPlatformModalVisible.value = false
}

/** 从 Ozon 价格文案中解析数值 */
function parseOzonRubPriceText(text: string): number {
  const t = (text || '').trim()
  if (!t) return 0
  let s = t.replace(/[\u00A0\u202F]/g, ' ').replace(/\s/g, '')
  s = s.replace(/[₽¥￥$\u20BD]/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// ---------- 利润计算器右侧抽屉 ----------
const profitDrawerMaskShown = ref(false)
const profitDrawerOpen = ref(false)
const profitIframeSrc = ref('')
const profitDrawerRef = ref<HTMLElement | null>(null)
const profitIframeRef = ref<HTMLIFrameElement | null>(null)
const profitResizeHandleRef = ref<HTMLElement | null>(null)
const profitDrawerWidthPx = ref<number | null>(null)
const profitResizeDragging = ref(false)

const profitDrawerPanelStyle = computed((): CSSProperties => ({
  width: profitDrawerWidthPx.value != null ? `${profitDrawerWidthPx.value}px` : undefined,
  transform: profitDrawerOpen.value ? 'translateX(0)' : 'translateX(100%)',
  transition: profitResizeDragging.value ? 'none' : 'transform 0.2s ease',
}))

function getProfitPcBaseUrl(): string {
  return String(API_CONFIG.LOCAL_FRONTEND_URL || '').trim().replace(/\/$/, '')
}

/**
 * 利润计算器抽屉 - 打开。
 * 国内平台：productName + autoSearch；包装字段通过 URL 由 profit-tools-hub-bridge 回显。
 */
async function openProfitDrawer(
  sku?: string,
  salePrice?: number,
  productName?: string,
  autoSearch = false,
  packaging?: ProfitPackagingHint | null,
) {
  const base = getProfitPcBaseUrl()
  if (!base) {
    showToast('未配置本地前端地址 VITE_LOCAL_FRONTEND_URL', 3000)
    return
  }
  let iframeSrc = `${base}/ozon/profit-tools-hub?tab=pricingTool`
  if (sku) iframeSrc += `&sku=${encodeURIComponent(sku)}`
  if (Number.isFinite(salePrice) && salePrice != null && salePrice > 0) {
    iframeSrc += `&salePrice=${salePrice}`
  }
  const name = productName?.trim()
  if (name) {
    iframeSrc += `&productName=${encodeURIComponent(name)}`
  }
  if (autoSearch && name) {
    iframeSrc += `&autoSearch=1`
  }
  const pack = packaging || {}
  if (pack.weightG) iframeSrc += `&packWeightG=${encodeURIComponent(pack.weightG)}`
  if (pack.length) iframeSrc += `&packLength=${encodeURIComponent(pack.length)}`
  if (pack.width) iframeSrc += `&packWidth=${encodeURIComponent(pack.width)}`
  if (pack.height) iframeSrc += `&packHeight=${encodeURIComponent(pack.height)}`
  if (pack.volumeCm3) iframeSrc += `&packVolumeCm3=${encodeURIComponent(pack.volumeCm3)}`
  profitIframeSrc.value = iframeSrc
  profitDrawerMaskShown.value = true
  profitDrawerOpen.value = false
  await nextTick()
  setTimeout(() => {
    profitDrawerOpen.value = true
  }, 10)
}

/** 利润计算器抽屉 - 关闭（对应原 closeProfitDrawer） */
function closeProfitDrawer() {
  profitDrawerOpen.value = false
  setTimeout(() => {
    profitDrawerMaskShown.value = false
    profitIframeSrc.value = ''
  }, 300)
}

function onProfitDrawerMaskClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    closeProfitDrawer()
  }
}

/** 侧栏「计算利润」：列表页仅打开工具、不回显标题/包装且按钮 loading；详情页按平台回显 */
async function handleCalculateProfitMenu() {
  if (profitCalculateLoading.value) return
  profitCalculateLoading.value = true

  // 非详情页仅打开工具
  if (!isGoodsDetailPage.value) {
    try {
      await openProfitDrawer(undefined, undefined, undefined, false, null)
      await nextTick()
      await new Promise<void>((resolve) => setTimeout(resolve, 320))
    } finally {
      profitCalculateLoading.value = false
    }
    return
  }

  const { hostname, pathname } = window.location
  const isOzon = OZON_HOSTS.includes(hostname as (typeof OZON_HOSTS)[number]) && pathname.startsWith('/product')
  if (isOzon) {
    const skuEl = document.querySelector('[data-widget="webDetailSKU"]')
    const skuText = skuEl?.textContent || ''
    const skuMatch = skuText.match(/\d+/)
    const sku = skuMatch ? skuMatch[0] : ''

    let priceEl: Element | null = document.querySelector(
      '[data-widget="webPrice"] span.tsHeadline600Large',
    )
    if (!priceEl) {
      const spans = document.querySelectorAll('span.tsHeadline600Large')
      for (let i = 0; i < spans.length; i++) {
        const sp = spans[i]
        if (/[₽¥￥$\u20BD]/.test(sp.textContent || '')) {
          priceEl = sp
          break
        }
      }
    }
    let salePrice = 0
    if (priceEl) {
      salePrice = parseOzonRubPriceText(priceEl.textContent || '')
    }
    let packaging: ProfitPackagingHint = {}
    try {
      const raw = await requestMainWorldWindowData()
      packaging = extractPackagingFromRawData(raw)
    } catch (e) {
      console.warn('[MJGD][profitDrawer] Ozon 包装:', e)
    }
    void openProfitDrawer(sku, salePrice, undefined, false, packaging)
    profitCalculateLoading.value = false
    return
  }

  let productName = ''
  let packaging: ProfitPackagingHint = {}
  try {
    const raw = await requestMainWorldWindowData()
    productName = extractTitleFromRawData(raw)
    packaging = extractPackagingFromRawData(raw)
  } catch (e) {
    console.warn('[MJGD][profitDrawer] MAIN 世界标题:', e)
  }
  if (!productName.trim()) {
    productName = getFallbackProductTitleFromDom()
  }
  if (!productName.trim()) {
    showToast('未能读取商品标题，请确认在商品详情页或刷新后重试', 3200)
    profitCalculateLoading.value = false
    return
  }
  void openProfitDrawer(undefined, undefined, productName.trim(), true, packaging)
  profitCalculateLoading.value = false
}

/** 卡片内「计算利润」按钮（对应原 .bcs-card-profit-btn 委托逻辑），供外部调用 */
function openProfitDrawerFromCardElement(triggerEl: HTMLElement) {
  const sku = triggerEl.getAttribute('data-sku') || ''
  const card = triggerEl.closest('.e1fbcs')
  let salePrice = 0
  if (card) {
    const input = card.querySelector<HTMLInputElement>('.price-input')
    const val = input?.value?.trim()
    if (val) {
      const n = parseFloat(val)
      if (Number.isFinite(n)) salePrice = n
    }
  }
  void openProfitDrawer(sku, salePrice)
}

function onCardProfitEvent(e: Event) {
  const triggerEl = (e as CustomEvent<{ triggerEl?: HTMLElement }>).detail?.triggerEl
  if (triggerEl) openProfitDrawerFromCardElement(triggerEl)
}

function onProfitDrawerResizeMouseDown(e: MouseEvent) {
  e.preventDefault()
  profitResizeDragging.value = true
  if (profitDrawerWidthPx.value == null && profitDrawerRef.value) {
    profitDrawerWidthPx.value = profitDrawerRef.value.getBoundingClientRect().width
  }
  if (profitIframeRef.value) {
    profitIframeRef.value.style.pointerEvents = 'none'
  }
  if (profitResizeHandleRef.value) {
    profitResizeHandleRef.value.style.backgroundColor = '#d6d6d6'
  }
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  document.addEventListener('mousemove', onProfitDrawerResizeMouseMove)
  document.addEventListener('mouseup', onProfitDrawerResizeMouseUp)
}

function onProfitDrawerResizeMouseMove(e: MouseEvent) {
  if (!profitResizeDragging.value) return
  let newWidth = window.innerWidth - e.clientX
  if (newWidth < 320) newWidth = 320
  if (newWidth > window.innerWidth) newWidth = window.innerWidth
  profitDrawerWidthPx.value = newWidth
}

function onProfitDrawerResizeMouseUp() {
  if (!profitResizeDragging.value) return
  profitResizeDragging.value = false
  if (profitIframeRef.value) {
    profitIframeRef.value.style.pointerEvents = ''
  }
  if (profitResizeHandleRef.value) {
    profitResizeHandleRef.value.style.backgroundColor = ''
  }
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  document.removeEventListener('mousemove', onProfitDrawerResizeMouseMove)
  document.removeEventListener('mouseup', onProfitDrawerResizeMouseUp)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onProfitDrawerResizeMouseMove)
  document.removeEventListener('mouseup', onProfitDrawerResizeMouseUp)
})
// 利润计算器 end

// Dragging logic for icon
const widgetRef = ref<HTMLElement | null>(null)
const WIDGET_VIEWPORT_MARGIN = 8
// 默认右/下边距。对齐旧插件：浮窗一律用 right + bottom 锚定（而非绝对 left/top），
// 默认贴右下角；窗口缩放时浏览器自动让它贴着右/下边缘，位置“免费”还原，
// 无需吸附/意图值/换算逻辑（bottom 锚定和 right 一样是缩放稳定的）。
const WIDGET_DOCK_RIGHT_MARGIN = 20
const WIDGET_DOCK_BOTTOM_MARGIN = 20

const position = ref<{ left: number | null; top: number | null; right: number | null; bottom: number | null }>({ left: null, top: null, right: null, bottom: null })
let isDragging = false
let startX = 0
let startY = 0
// 拖动起点：记录距右边距 initialRight、距底边距 initialBottom（右下锚定），
// 以及拖动目标当次的宽高，用于把落点夹进视口。
let initialRight = 0
let initialBottom = 0
let dragTargetW = 0
let dragTargetH = 0
let widgetMoveRaf = 0
let pendingWidgetClientX = 0
let pendingWidgetClientY = 0

const containerStyle = computed(() => ({
  left: position.value.left !== null ? `${position.value.left}px` : 'auto',
  top: position.value.top !== null ? `${position.value.top}px` : 'auto',
  right: position.value.right !== null ? `${position.value.right}px` : 'auto',
  bottom: position.value.bottom !== null ? `${position.value.bottom}px` : 'auto'
}))

function scheduleFitWidgetInViewport() {
  void nextTick(() => {
    requestAnimationFrame(() => {
      fitWidgetInViewport()
    })
  })
}

/** 把 widget 夹进视口（右 + 下锚定）。
 *
 * 对齐旧插件：横向 right、纵向 bottom 锚定，默认贴右下角。两者都是缩放稳定的
 * （浏览器自动贴边），所以 resize 时位置“免费”还原，无需吸附/意图值。
 * 本函数只在内容变化/缩放时把 right/bottom 夹进视口范围，防止越界。
 *
 * ⚠️ .mjgd-widget-container-inner 是 position:fixed 但无宽高，.mjgd-modal / .mjgd-icon
 *    都是 absolute（right:0;bottom:0）→ 直接测 widgetRef 得 0×0。故测可见子元素（优先 modal，
 *    折叠时 icon）拿到真实宽高；它们贴右下角 → 换算 right = vw - rect.right、bottom = vh - rect.bottom。
 */
function fitWidgetInViewport() {
  const el = widgetRef.value
  if (!el) return

  const measureTarget =
    el.querySelector<HTMLElement>('.mjgd-modal') ||
    el.querySelector<HTMLElement>('.mjgd-icon')
  if (!measureTarget) return

  const rect = measureTarget.getBoundingClientRect()
  // 防御：刚切换 v-if 时浏览器可能尚未排版完成
  if (rect.width <= 0 || rect.height <= 0) return

  const vw = window.innerWidth
  const vh = window.innerHeight
  const m = WIDGET_VIEWPORT_MARGIN

  // 横向：右锚定。right 夹进 [m, vw-m-width]（正常窗口宽下恒为默认右距）。
  const maxRight = Math.max(m, vw - m - rect.width)
  let right = position.value.right != null ? position.value.right : WIDGET_DOCK_RIGHT_MARGIN
  if (right < m) right = m
  if (right > maxRight) right = maxRight

  // 纵向：下锚定。bottom 夹进 [m, vh-m-height]（正常窗口高下恒为默认下距）。
  const maxBottom = Math.max(m, vh - m - rect.height)
  let bottom = position.value.bottom != null ? position.value.bottom : WIDGET_DOCK_BOTTOM_MARGIN
  if (bottom < m) bottom = m
  if (bottom > maxBottom) bottom = maxBottom

  position.value.right = right
  position.value.bottom = bottom
  position.value.left = null
  position.value.top = null
}

/** 是否从该目标开始拖动容器（避免与点击/输入冲突） */
function shouldStartWidgetDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  // 登录/菜单层内仅标题条可拖，避免在面板空白处按下后误走 mouseup 清样式逻辑（旧版曾无条件清空内联定位）
  if (target.closest('.mjgd-modal')) {
    return !!target.closest('.mjgd-widget-drag-handle')
  }
  return !target.closest(
    'input, textarea, select, button, a, label, .mjgd-minimize-btn, .mjgd-menu-btn, .mjgd-action-btn, .mjgd-version-info, .mjgd-website-link'
  )
}

let resizeTimer: ReturnType<typeof setTimeout> | null = null
function onWindowResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    resizeTimer = null
    scheduleFitWidgetInViewport()
  }, 100)
}

const applyInitialWidgetState = () => {
  showMenu.value = true
  isCollapsed.value = false // 默认不折叠
}

onMounted(async () => {
  // 订阅采集弹窗显隐：弹窗显示时整体隐藏 Widget 浮动栏
  unsubscribeCrawlState = subscribeCrawlState(() => {
    crawlOverlayVisible.value = getCrawlSnapshot().visible
  })

  checkGoodsDetailPage()
  applyInitialWidgetState()

  // 初始化位置为右下角（对齐旧插件：right + bottom 锚定）
  await nextTick()
  position.value.left = null
  position.value.top = null
  position.value.right = WIDGET_DOCK_RIGHT_MARGIN
  position.value.bottom = WIDGET_DOCK_BOTTOM_MARGIN
  // 版本检查仅在用户点击版本号时访问可选的本地接口。

  scheduleFitWidgetInViewport()
  window.addEventListener('resize', onWindowResize)
  document.addEventListener(MJGD_OPEN_PROFIT_FROM_CARD, onCardProfitEvent)
})

onUnmounted(() => {
  document.removeEventListener(MJGD_OPEN_PROFIT_FROM_CARD, onCardProfitEvent)
  window.removeEventListener('resize', onWindowResize)
  if (resizeTimer) clearTimeout(resizeTimer)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  unsubscribeCrawlState?.()
  unsubscribeCrawlState = null
})

// 保留旧公开方法名：本地模式下仅展开功能菜单。
const openLogin = () => {
  isCollapsed.value = false
  showMenu.value = true
  scheduleFitWidgetInViewport()
}

// 设置用户名（供外部调用）
const setUserName = (userName: string) => {
  currentUserName.value = userName || '用户'
}

const toggleWidget = async () => {
  if (isDragging) return
  isCollapsed.value = false
  showMenu.value = true
  await nextTick()
  scheduleFitWidgetInViewport()
}

// 检测新版相关状态
const showUpdateButton = ref(false)
const updateUrl = ref('')
const checkingVersion = ref(false)
const showForceUpdateModal = ref(false)  // 控制强制更新模态框显示
const newVersionInfo = ref('')           // 新版本号
// 判断是否有新版本
const hasNewVersion = computed(() => updateUrl.value !== '')

const showUpdateInfoModal = ref(false)   // 控制更新信息弹窗显示
const newVersionPlatform = ref('')       // 平台
const newVersionRemark = ref('')          // 备注
let MJGD_UPDATE_DISMISSED = 'mjgd_ozonai_update_dismissed_' //缓存当天不在提示的key

// 检测新版本
const checkVersion = async () => {
  if (checkingVersion.value) return
  checkingVersion.value = true
  try {
    const version = currentVersion
    const url = `${API_CONFIG.LOCAL_API_BASE_URL}/system/history/checkNewVersionInfo?platformKey=ozonAi&version=${version}`
    const response = await apiService.request<ApiResponse>(url, { method: 'GET' })
    if (response && response.code === 200) {
      const data = response.data
      if (data && data.url) {
        // 有新版本
        showUpdateButton.value = true
        updateUrl.value = data.url
        newVersionInfo.value = data.version || ''
        newVersionPlatform.value = data.platformKey || ''
        newVersionRemark.value = data.remark || ''

        // 如果是强制更新，显示强制更新模态框
        if (data.forcedUpdate === 1) {
          showForceUpdateModal.value = true
        } else {
          const dismissKey = `${MJGD_UPDATE_DISMISSED}${data.version}`
          const dismissedDate = localStorage.getItem(dismissKey)
          const today = new Date().toISOString().slice(0, 10)
          if (dismissedDate !== today) {
            showUpdateInfoModal.value = true
          }
        }
      } else {
        // 没有新版本
        showUpdateButton.value = true
        updateUrl.value = ''
        newVersionInfo.value = ''
        newVersionPlatform.value = ''
        newVersionRemark.value = ''
      }
    } else {
      showUpdateButton.value = true
      updateUrl.value = ''
      newVersionInfo.value = ''
    }
  } catch (error: any) {
    console.error('检测新版本失败:', error)
    // 检测失败时隐藏按钮
    showUpdateButton.value = false
    updateUrl.value = ''
    newVersionInfo.value = ''
  } finally {
    checkingVersion.value = false
  }
}

// 检查更新：有新版本弹窗展示，无新版本提示
const handleUpdateDownload = async () => {
  await checkVersion()
  if (updateUrl.value) {
    showUpdateInfoModal.value = true
  } else {
    showToast('当前版本已是最新版本')
  }
}

// 更新弹窗中点击下载
const handleUpdateInfoDownload = () => {
  if (updateUrl.value) {
    window.open(updateUrl.value, '_blank')
  }
  showUpdateInfoModal.value = false
}

// 稍后再说：记录当天已关闭，不再自动弹出
const handleUpdateDismiss = () => {
  if (newVersionInfo.value) {
    const dismissKey = `${MJGD_UPDATE_DISMISSED}${newVersionInfo.value}`
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(dismissKey, today)
  }
  showUpdateInfoModal.value = false
}

// 强制更新下载
const handleForceUpdateDownload = () => {
  if (updateUrl.value) {
    window.open(updateUrl.value, '_blank')
  }
}

const handleMinimize = async () => {
  isCollapsed.value = true
  showMenu.value = false
  await nextTick()
  scheduleFitWidgetInViewport()
}

function flushWidgetMove() {
  widgetMoveRaf = 0
  if (!widgetRef.value) return
  const dx = pendingWidgetClientX - startX
  const dy = pendingWidgetClientY - startY

  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    isDragging = true
    widgetRef.value.style.transition = 'none'

    const m = WIDGET_VIEWPORT_MARGIN
    // 右下锚定：鼠标右移(dx>0)→右边距减小；下移(dy>0)→下边距减小。
    let newRight = initialRight - dx
    let newBottom = initialBottom - dy

    const maxRight = Math.max(m, window.innerWidth - m - dragTargetW)
    const maxBottom = Math.max(m, window.innerHeight - m - dragTargetH)

    newRight = Math.max(m, Math.min(newRight, maxRight))
    newBottom = Math.max(m, Math.min(newBottom, maxBottom))

    // 只通过响应式 position 驱动 :style，避免与 Vue 内联样式绑定互相覆盖导致拖动中偶发“消失”
    position.value.right = newRight
    position.value.bottom = newBottom
    position.value.left = null
    position.value.top = null
  }
}

// Drag implementation：仅在外层容器上触发，避开可交互子节点
const onContainerMouseDown = (e: MouseEvent) => {
  if (!widgetRef.value || !shouldStartWidgetDrag(e.target)) return
  e.preventDefault()
  isDragging = false
  widgetMoveRaf = 0
  pendingWidgetClientX = e.clientX
  pendingWidgetClientY = e.clientY
  startX = e.clientX
  startY = e.clientY
  // 测可见子元素（modal/icon）拿真实外接矩形：inner 无宽高会得 0×0。
  // 记录起点距右边距、距底边距，以及尺寸，供拖动中右下锚定夹紧。
  const measureTarget =
    widgetRef.value.querySelector<HTMLElement>('.mjgd-modal') ||
    widgetRef.value.querySelector<HTMLElement>('.mjgd-icon')
  const rect = (measureTarget ?? widgetRef.value).getBoundingClientRect()
  initialRight = window.innerWidth - rect.right
  initialBottom = window.innerHeight - rect.bottom
  dragTargetW = rect.width
  dragTargetH = rect.height

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (e: MouseEvent) => {
  if (!widgetRef.value) return
  pendingWidgetClientX = e.clientX
  pendingWidgetClientY = e.clientY
  if (!widgetMoveRaf) {
    widgetMoveRaf = requestAnimationFrame(flushWidgetMove)
  }
}

const onMouseUp = () => {
  if (widgetMoveRaf) {
    cancelAnimationFrame(widgetMoveRaf)
    widgetMoveRaf = 0
    flushWidgetMove()
  }

  if (widgetRef.value) {
    widgetRef.value.style.transition = ''
  }

  if (isDragging) {
    scheduleFitWidgetInViewport()
    setTimeout(() => {
      isDragging = false
    }, 100)
  } else {
    isDragging = false
  }
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

watch(showMenu, () => {
  if (showMenu.value) {
    scheduleFitWidgetInViewport()
  }
})

// 暴露方法供外部调用
defineExpose({
  openLogin,
  setUserName,
  openProfitDrawer,
  openProfitDrawerFromCardElement,
})

</script>

<style scoped lang="scss">
// 变量定义
$primary-color: #005bff;
$primary-hover: #0042b3;
$danger-color: #ff4d4f;
$danger-hover: #d9363e;
$bg-white: #fff;
$bg-gray: #f0f0f0;
$border-color: #ddd;
$text-color: #333;
$error-color: red;

#mjgd-widget-container {
  font-family: Arial, sans-serif;
  display: inline-block;
  vertical-align: top;

  // 仅插件浮窗内使用 border-box（旧版登录表单各控件也显式写了 box-sizing）
  // 避免全局污染 Ozon 页面，同时防止快捷登录按钮 width:100%+padding 撑出面板
  &,
  & * {
    box-sizing: border-box;
  }
}

.mjgd-widget-container-inner {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: var(--mjgd-z-widget-float);
}

.mjgd-icon {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 50px;
  height: 50px;
  background-color: $bg-white;
  border-radius: 50%;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: grab;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  user-select: none;
  touch-action: none;
  font-weight: bold;
  transition: transform 0.2s;
  padding: 4px;
  box-sizing: border-box;

  .mjgd-icon-logo {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 50%;
  }

  &:active {
    cursor: grabbing;
  }

  &:hover {
    transform: scale(1.1);
  }
}

.mjgd-modal {
  position: absolute;
  bottom: 0;
  right: 0;
  background: $bg-white;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  width: 220px;
  overflow: hidden;

  .mjgd-modal-header {
    background: #ffffff;
    color: #1e293b;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e5e7eb;
    font-size: 14px;
    font-weight: bold;
    cursor: default;
    user-select: none;
    touch-action: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

    .mjgd-widget-drag-handle {
      flex: 1;
      cursor: grab;
      min-height: 1.2em;

      &:active {
        cursor: grabbing;
      }
    }
  }

  .mjgd_modal_body_login,
  .mjgd_modal_body_menu {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mjgd_modal_body_login {
    padding: 12px 18px 14px;

    .mjgd-quick-login-tip {
      font-size: 12px;
      line-height: 1.5;
      color: #64748b;
      padding: 8px;
      border-radius: 6px;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      max-width: 100%;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .mjgd-quick-login-cancel {
      font-size: 12px;
      color: #64748b;
      text-align: center;
      cursor: pointer;
      user-select: none;

      &:hover {
        color: #2563eb;
      }
    }

    // 登录区全宽大按钮
    .mjgd-action-btn {
      width: 100%;
      max-width: 100%;
      min-height: 32px;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      gap: 4px;
      position: relative;
      margin: 0;
      padding: 0 6px;
      border: none;
      box-shadow: none;
      font-family: Alibaba PuHuiTi, Alibaba PuHuiTi;
      font-size: 14px;
      color: #333333;
      cursor: pointer;
      box-sizing: border-box;
      white-space: normal;
      text-align: center;
      line-height: 1.3;

      // 快捷登录提交
      &.mjgd-quick-login-submit-btn {
        height: auto;
        padding: 8px;
        color: #fff;
        border-radius: 8px;
        background-color: #007bff;

        &:hover {
          background-color: #409eff;
          color: #fff;
        }
      }

      &.mjgd-update-btn {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid #efefef;
        border-radius: 8px;

        &:hover {
          color: #409eff;
          border-color: #409eff;
        }
      }

      &.mjgd-action-btn-loading {
        pointer-events: none;
        cursor: wait;
        opacity: 0.92;
        gap: 6px;

        &.mjgd-quick-login-submit-btn:hover {
          background-color: #409eff;
          color: #fff;
        }

        .mjgd-action-spinner {
          flex-shrink: 0;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: mjgd-action-spin 0.65s linear infinite;
        }
      }
    }
  }

  .mjgd_modal_body_menu {
    padding: 12px 8px 14px;

    .mjgd-menu-btn-list {
      display: flex;
      flex-direction: column;
    }

    .mjgd-menu-btn-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      justify-items: center;
    }

    .mjgd-menu-btn-divider {
      height: 1px;
      background: #e5e7eb;
      margin: 10px 0;
    }

    // 功能菜单小按钮
    .mjgd-menu-btn {
      box-sizing: border-box;
      width: 100%;
      height: 34px;
      padding: 0 6px;
      background: rgba(255, 255, 255, 0.96);
      border-radius: 5px;
      border: 1px solid #efefef;
      color: #333333;
      font-size: 14px;
      font-family: Alibaba PuHuiTi, Alibaba PuHuiTi;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      gap: 4px;
      position: relative;
      cursor: pointer;

      .mjgd-menu-btn-label {
        line-height: 32px;
        text-align: center;
        word-break: keep-all;
      }

      &:hover {
        color: #409eff;
        border-color: #409eff;
        cursor: pointer;
      }

      // 主要按钮（AI采集、Ozon 功能键）—— 对齐旧插件菜单：白底黑字灰边，悬停字+边框变蓝
      &.mjgd-primary-btn {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid #efefef;
        color: #000000;

        &:hover {
          background: rgba(255, 255, 255, 0.96);
          color: #409eff;
          border-color: #409eff;
        }

        &.mjgd-profit-btn-loading {
          pointer-events: none;
          cursor: wait;
          opacity: 0.92;
          gap: 4px;

          &:hover {
            background: rgba(255, 255, 255, 0.96);
            color: #000000;
            border-color: #efefef;
          }

          .mjgd-profit-spinner {
            flex-shrink: 0;
            width: 14px;
            height: 14px;
            border: 2px solid rgba(64, 158, 255, 0.25);
            border-top-color: #409eff;
            border-radius: 50%;
            animation: mjgd-profit-spin 0.65s linear infinite;
          }
        }
      }
    }
  }
}

@keyframes mjgd-action-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes mjgd-profit-spin {
  to {
    transform: rotate(360deg);
  }
}

.mjgd-minimize-btn {
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 5px;
  color: #94a3b8;

  &:hover {
    color: #475569;
  }
}

.mjgd-error-msg {
  max-width: 100%;
  color: $error-color;
  font-size: 12px;
  text-align: center;
  overflow-wrap: break-word;
  word-break: break-word;
}

.mjgd_user_info_bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 5px;
  padding: 0 4px;
}

.mjgd-user-info {
  max-width: 100%;
  padding: 0 28px;
  font-size: 13px;
  text-align: center;
  color: $text-color;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mjgd_user_logout_btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: #999;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;

  &:hover {
    color: #47a2ff;
    background-color: rgba(71, 162, 255, 0.12);
  }

  &.mjgd_user_logout_btn_loading {
    pointer-events: none;
    cursor: wait;
    color: #47a2ff;
  }
}

.mjgd_user_logout_spinner {
  display: block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(71, 162, 255, 0.25);
  border-top-color: #47a2ff;
  border-radius: 50%;
  animation: mjgd-profit-spin 0.65s linear infinite;
}

.mjgd_user_logout_icon {
  display: block;
  width: 16px;
  height: 16px;
}

.mjgd-brand-info {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mjgd-brand-info-border {
  width: 166px;
  height: 0;
  margin: 0 auto;
  border-bottom: 1px solid $border-color;
}

.mjgd-brand-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.mjgd-brand-logo {
  width: 32px;
  height: 32px;
  margin-left: -8px;
  object-fit: contain;
  flex-shrink: 0;
}

.mjgd-brand-name {
  font-size: 13px;
  font-weight: 700 !important;
  color: $text-color;
}

.mjgd-version-info {
  position: relative;
  width: fit-content;
  margin: 0 auto;
  padding: 0 18px;
  color: #666;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;

  .mjgd-update-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background-color: #ff4d4f;
    border-radius: 50%;
    display: inline-block;
  }
}

.mjgd-website-link {
  font-size: 12px;
  color: #666;
  text-align: center !important;
  width: 100%;

  .mjgd-website-link-text {
    color: $primary-color;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
      color: $primary-hover;
    }
  }
}

// 强制更新模态框样式
.mjgd-force-update-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: calc(var(--mjgd-z-widget-dialog) + 1);
  animation: mjgd-fade-in 0.2s ease-out;
}

@keyframes mjgd-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes mjgd-slide-up {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes mjgd-pulse {

  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.05);
  }
}

.mjgd-force-update-modal {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 16px;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  width: 360px;
  overflow: hidden;
  animation: mjgd-slide-up 0.4s ease-out;
}

.mjgd-force-update-header {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 50%, #f39c12 100%);
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.mjgd-force-update-icon {
  width: 48px;
  height: 48px;
  color: white;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.mjgd-force-update-title {
  font-size: 20px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  letter-spacing: 0.5px;
}

.mjgd-force-update-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mjgd-force-update-version {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #f1f5f9;
  border-radius: 8px;
  font-size: 14px;
}

.mjgd-version-label {
  color: #64748b;
  font-weight: 500;
}

.mjgd-version-value {
  color: #334155;
  font-weight: 600;
  font-family: 'SF Mono', 'Consolas', monospace;
}

.mjgd-version-new {
  color: #10b981;
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  padding: 2px 8px;
  border-radius: 4px;
}

.mjgd-force-update-message {
  font-size: 14px;
  color: #475569;
  line-height: 1.6;
  text-align: center;
  margin: 8px 0;
  padding: 0 8px;
}

.mjgd-force-update-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 14px 32px;
  background: #2563EB;
  border-radius: 8px;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
  margin-top: 8px;
  white-space: nowrap;

  &:hover {
    background: #1d4ed8;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
  }
}

.mjgd-download-icon {
  width: 18px;
  height: 18px;
  animation: mjgd-pulse 2s infinite;
}

// 商品详情页使用AI采集功能提示模态框样式
.mjgd-ai-countdown-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: calc(var(--mjgd-z-widget-dialog) + 2);
  display: flex;
  justify-content: center;
  align-items: center;
  animation: fadeIn 0.2s ease-in-out;
}

.mjgd-ai-uploading-modal {
  background: #ffffff;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  min-width: 400px;
  text-align: center;
  animation: slideUp 0.2s ease-out;
}

.mjgd-ai-uploading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.mjgd-ai-uploading-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.mjgd-ai-uploading-title {
  font-size: 24px;
  font-weight: 600;
  color: #606266;
  line-height: 30px;
}

.mjgd-ai-uploading-text {
  font-size: 16px;
  color: #909399;
  line-height: 1.5;
}

.mjgd-ai-success-btn {
  padding: 12px 48px;
  background: linear-gradient(135deg, #409EFF 0%, #337ecc 100%);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(64, 158, 255, 0.4);
  }

  &:active {
    transform: translateY(0);
  }
}

.mjgd-ai-success-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/** 检测到新版本弹窗 */
.mjgd-update-info-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: calc(var(--mjgd-z-widget-dialog) + 3);
  animation: mjgd-fade-in 0.25s ease-out;
}

.mjgd-update-info-modal {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  width: 320px;
  overflow: hidden;
  animation: mjgd-slide-up 0.2s ease-out;
}

.mjgd-update-info-header {
  padding: 20px 24px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #f0f0f0;
}

.mjgd-update-info-icon {
  width: 22px;
  height: 22px;
  color: #2563eb;
  flex-shrink: 0;
}

.mjgd-update-info-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.mjgd-update-info-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 24px 14px;
}

.mjgd-update-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
  font-size: 13px;
}

.mjgd-update-info-label {
  color: #64748b;
}

.mjgd-update-info-value {
  color: #334155;
  font-weight: 500;
  font-family: 'SF Mono', 'Consolas', monospace;
}

.mjgd-update-info-value-new {
  color: #2563eb;
  font-weight: 600;
}

.mjgd-update-info-remark {
  max-height: 180px;
  padding: 10px 12px;
  margin: 4px 0;
  background: #f8fafc;
  border-radius: 6px;
  border-left: 3px solid #e2e8f0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  word-wrap: break-word;
  overflow-y: scroll;
}

.mjgd-update-info-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.mjgd-update-info-download-btn {
  text-align: center;
  padding: 10px;
  background: #2563eb;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #1d4ed8;
  }
}

.mjgd-update-info-dismiss-btn {
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
  cursor: pointer;
  padding: 6px 0;

  &:hover {
    color: #64748b;
  }
}

// 可采集的三方平台弹窗
.mjgd-collect-platform-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: calc(var(--mjgd-z-widget-dialog) + 4);
  display: flex;
  justify-content: center;
  align-items: center;
  animation: fadeIn 0.2s ease-in-out;
}

.mjgd-platform-modal,
.mjgd-platform-modal *,
.mjgd-platform-modal *::before,
.mjgd-platform-modal *::after {
  box-sizing: border-box;
}

.mjgd-platform-modal {
  width: 100%;
  max-width: 750px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
  overflow: hidden;
  animation: mjgd-platform-popup 0.22s ease-out;
}

@keyframes mjgd-platform-popup {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.mjgd-platform-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 8px;
}

.mjgd-platform-modal-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #2563eb;
  line-height: 1.2;
}

.mjgd-platform-modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 50%;
  font-size: 22px;
  line-height: 1;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mjgd-platform-modal-close:hover {
  background: #f3f4f6;
  color: #111827;
  transform: rotate(90deg);
}

.mjgd-platform-modal-body {
  padding: 10px 20px 18px;
}

.mjgd-platform-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.mjgd-platform-card {
  display: block;
  text-decoration: none;
  color: inherit;
  background: #fff;
  border: 1px solid #d9e0ea;
  border-radius: 12px;
  padding: 16px;
  min-height: 122px;
  transition: all 0.22s ease;
  position: relative;
  overflow: hidden;
}

.mjgd-platform-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.05), rgba(59, 130, 246, 0));
  opacity: 0;
  transition: opacity 0.22s ease;
}

.mjgd-platform-card:hover {
  transform: translateY(-4px);
  border-color: #90b7ff;
  box-shadow: 0 14px 24px rgba(37, 99, 235, 0.12);
}

.mjgd-platform-card:hover::before {
  opacity: 1;
}

.mjgd-platform-card-title,
.mjgd-platform-card-desc {
  position: relative;
  z-index: 1;
}

.mjgd-platform-card-title {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 8px;
  line-height: 1.2;
}

.mjgd-platform-card-desc {
  font-size: 13px;
  line-height: 1.55;
  color: #6b7280;
  word-break: break-all;
}

.mjgd-platform-card-remark {
  margin-top: 4px;
  color: #999999;
  font-size: 12px;
  line-height: 16px;
  word-break: break-all;
}

.mjgd-platform-footer-wrap {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #edf0f5;
  display: flex;
  justify-content: center;
}

.mjgd-platform-tutorial-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  color: #2563eb;
  padding: 8px 16px;
  border-radius: 999px;
  transition: all 0.2s ease;
}

.mjgd-platform-tutorial-link:hover {
  background: #eef4ff;
  color: #1d4ed8;
  transform: translateY(-2px);
}

// 可采集的三方平台弹窗 end

// 利润计算器抽屉（Teleport 到 body，与旧版 #bcs_profit_* 行为一致）
.bcs-profit-drawer-mask {
  position: fixed;
  inset: 0;
  z-index: var(--mjgd-z-profit-mask);
  background: rgba(0, 0, 0, 0.35);
}

.bcs-profit-drawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: min(480px, 100vw);
  max-width: 100vw;
  z-index: var(--mjgd-z-profit-drawer);
  background: #fff;
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.2s ease;
}

.bcs-profit-drawer-resize {
  position: absolute;
  left: 0;
  top: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 2;
  background-color: #f0f0f0;

  &:hover {
    background-color: #e0e0e0;
  }
}

.bcs-profit-drawer-toolbar {
  flex-shrink: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid #eee;
  box-sizing: border-box;
}

.bcs-profit-drawer-close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: #666;
  padding: 4px 10px;
  border-radius: 4px;

  &:hover {
    background: #f0f0f0;
    color: #333;
  }
}

.bcs-profit-drawer-iframe {
  flex: 1;
  width: 100%;
  border: 0;
  min-height: 0;
}

// 利润计算器 end
</style>
