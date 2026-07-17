import { isOzonListLikePage, resolveOzonPageType } from './ozonPageContext'
import { openSettings } from '../ozonCardSettings/settingsController'

// 卡片头部「计算利润」按钮的开关行为已迁移到内嵌利润计算面板自身（
// src/content/utils/ozonProfitCalc/inlineProfitCalc.ts 内部的 body click 委托），
// 这里不再派发自定义事件触发抽屉，避免与内嵌面板的切换重复响应。
// 旧事件名保留导出供 Widget.vue 解绑，无运行时依赖。
export const MJGD_OPEN_PROFIT_FROM_CARD = 'mjgd:open-profit-from-card'

/** 绑定卡片顶栏：字段配置（计算利润按钮的切换由内嵌面板模块接管） */
export function bindCardHeadActions(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.bcs-card-setting-btn').forEach((btn) => {
    if (btn.dataset.boundSetting === '1') return
    btn.dataset.boundSetting = '1'
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const isListPage = isOzonListLikePage(resolveOzonPageType())
      void openSettings({ tab: 'card', isListPage, cardOnly: true })
    })
  })
}
