import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '鲸智 AI',
    description: '鲸智 AI — 跨境电商智能采集与管理工具',
    permissions: ['storage', 'activeTab', 'tabs', 'scripting'],
    host_permissions: [
      'https://www.ozon.ru/*',
      'https://ozon.ru/*',
      'https://www.wildberries.ru/*',
      'https://wildberries.ru/*',
      'https://detail.1688.com/*',
      'https://s.1688.com/*',
      'https://www.1688.com/*',
      'http://localhost:9000/*',
    ],
    action: {
      default_popup: 'popup.html',
      default_icon: {
        '16': 'icon-16.png',
        '32': 'icon-32.png',
        '48': 'icon-48.png',
        '128': 'icon-128.png',
      },
    },
    icons: {
      '16': 'icon-16.png',
      '32': 'icon-32.png',
      '48': 'icon-48.png',
      '128': 'icon-128.png',
    },
  },
})
