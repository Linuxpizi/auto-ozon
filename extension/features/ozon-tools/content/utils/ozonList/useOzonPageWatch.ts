import { onMounted, onUnmounted, ref } from 'vue'
import { resolveOzonPageType, type OzonPageType } from './ozonPageContext'

/** 监听 Ozon SPA 路由变化，保持页面类型与按钮显隐同步 */
export function useOzonPageWatch() {
  const ozonPageType = ref<OzonPageType>(resolveOzonPageType())

  function refreshPageType() {
    const next = resolveOzonPageType()
    if (next !== ozonPageType.value) {
      ozonPageType.value = next
    }
  }

  let origPushState: History['pushState'] | null = null
  let origReplaceState: History['replaceState'] | null = null
  let urlObserver: MutationObserver | null = null
  let lastHref = ''

  onMounted(() => {
    lastHref = window.location.href
    origPushState = history.pushState.bind(history)
    origReplaceState = history.replaceState.bind(history)

    history.pushState = (...args) => {
      origPushState!(...args)
      refreshPageType()
    }
    history.replaceState = (...args) => {
      origReplaceState!(...args)
      refreshPageType()
    }
    window.addEventListener('popstate', refreshPageType)

    urlObserver = new MutationObserver(() => {
      if (window.location.href !== lastHref) {
        lastHref = window.location.href
        refreshPageType()
      }
    })
    urlObserver.observe(document.body, { childList: true, subtree: true })
  })

  onUnmounted(() => {
    if (origPushState) history.pushState = origPushState
    if (origReplaceState) history.replaceState = origReplaceState
    window.removeEventListener('popstate', refreshPageType)
    urlObserver?.disconnect()
  })

  return { ozonPageType, refreshPageType }
}
