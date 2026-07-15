import { defineConfig } from 'wxt'
import packageJson from './package.json'

const extensionName = `${packageJson.name} v${packageJson.version}`

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: extensionName,
    description: `${packageJson.name} — 跨境电商智能采集与管理工具`,
    permissions: ['storage', 'activeTab', 'tabs', 'scripting'],
    host_permissions: [
      'https://www.ozon.ru/*',
      'https://ozon.ru/*',
      'https://www.wildberries.ru/*',
      'https://wildberries.ru/*',
      'https://detail.1688.com/*',
      'https://s.1688.com/*',
      'https://www.1688.com/*',
      'https://yangkeduo.com/*',
      'https://*.yangkeduo.com/*',
      'https://pinduoduo.com/*',
      'https://*.pinduoduo.com/*',
      'http://localhost:9000/*',
    ],
    action: {
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
