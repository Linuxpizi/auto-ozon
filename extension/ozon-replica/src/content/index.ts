import { createApp } from 'vue'
import App from './App.vue'
import store from './store'
// 原 Ozon 扩展构建产物中的完整组件样式与 Element Plus 主题。
// 恢复版的业务样式已经合并到 ozonReplica.css，避免再次引用源码包中不存在的
// SCSS 入口；静态图片和字体按需求不迁移，对应资源请求失败不影响核心交互。
import './styles/ozonVendor.css'
import './styles/ozonReplica.css'
import { initFollowSellerPopupOnce } from './utils/ozonList/followSellerPopup'
import { initCardTooltipsOnce } from './utils/ozonList/cardTooltips'
import { initCorpTranslateOnce } from './utils/ozonList/sellerInfo'
import { initInlineProfitCalcWiring } from './utils/ozonProfitCalc/wiring'
import { isOzonRetailSite } from './utils/ozonList/ozonPageContext'
import './utils/mainWorldBridge' // MAIN 世界无 chrome API，由本模块监听 ext-bridge-req 并代理到 background

initFollowSellerPopupOnce()
initCardTooltipsOnce()
initCorpTranslateOnce()
initInlineProfitCalcWiring()

// 对齐旧版 ozon_old/src/ozon/index.js:1421 createPage 里的 window.scrollTo —— 插件 content script
// 在 Ozon 零售页（非 seller.ozon.ru）初始化时把页面平滑滚回顶部，让后续 OzonListHost.tryActivate
// 贴卡时用户视野就在第一屏，体验上"登录完卡片直接出现在顶部"。
// 仅限 retail 域：seller / 1688 / 淘宝 / 拼多多 等其他匹配站点不动。
if (isOzonRetailSite()) {
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch {
    // 个别老浏览器不支持 options 形式，退回到 (x, y)
    try {
      window.scrollTo(0, 0)
    } catch {
      /* ignore */
    }
  }
}

console.log('Content script loaded')

const injectRichTextEditorIconFont = () => {
  if (document.getElementById('mjgd-rich-text-editor-icon-font')) {
    return
  }
  const resolveAssetUrl = (fileName: string) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(`fonts/${fileName}`)
    }
    return `/fonts/${fileName}`
  }
  const style = document.createElement('style')
  style.id = 'mjgd-rich-text-editor-icon-font'
  style.textContent = `
    @font-face {
      font-family: "element-icons";
      src: url("${resolveAssetUrl('element-icons.ff18efd1.woff')}") format("woff"),
        url("${resolveAssetUrl('element-icons.f1a45d74.ttf')}") format("truetype");
      font-weight: normal;
      font-style: normal;
      font-display: block;
    }
  `
  document.head.appendChild(style)
}

const container = document.createElement('div')
container.id = 'mjgd-extension-app'
document.body.appendChild(container)
injectRichTextEditorIconFont()

const app = createApp(App)

app.use(store)

app.mount(container)




