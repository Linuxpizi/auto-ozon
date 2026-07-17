import '@/features/ozon-tools/content/scripts/ozon-seller-logout-main.js'

/**
 * Seller logout must be intercepted in the page's MAIN world. The isolated
 * Ozon content script forwards the emitted event to the WXT background.
 */
export default defineContentScript({
  matches: ['https://seller.ozon.ru/*'],
  world: 'MAIN',
  main() {},
})