import { defineConfig } from 'wxt'
import packageJson from './package.json'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: packageJson.displayName,
    description: packageJson.description,
    permissions: ['storage', 'activeTab', 'tabs', 'scripting', 'cookies', 'alarms'],
    host_permissions: [
      'https://www.ozon.ru/*',
      'https://ozon.ru/*',
      'https://seller.ozon.ru/*',
      'https://sso.ozon.ru/*',
      'https://*.ozon.ru/*',
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
      'http://127.0.0.1:9000/*',
    ],
    externally_connectable: {
      matches: [
        'http://localhost/*',
        'http://localhost:5173/*',
        'http://127.0.0.1/*',
        'http://127.0.0.1:5173/*',
      ],
    },
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
