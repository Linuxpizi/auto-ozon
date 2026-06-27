import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Auto-Ozon 采集助手',
    description: 'Ozon / WB 平台商品数据采集与同步工具',
    permissions: ['storage', 'activeTab', 'tabs', 'scripting'],
    host_permissions: [
      'https://www.ozon.ru/*',
      'https://ozon.ru/*',
      'https://www.wildberries.ru/*',
      'https://wildberries.ru/*',
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
