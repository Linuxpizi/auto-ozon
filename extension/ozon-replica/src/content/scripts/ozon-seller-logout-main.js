/**
 * Seller 退出登录拦截（MAIN world）：
 * 阻止真实 logout API，伪造成功响应，并通知 ISOLATED bridge 清 Cookie + 刷新。
 */
;(() => {
  const LOGOUT_URL_RE = /\/api\/composer-api\.bx\/_action\/logout/i
  const LOGOUT_EVENT = 'bcs_seller_logout'
  // 同一页生命周期内只通知 bridge 一次，避免 fetch+XHR 双发或 SPA 重复打 logout 触发多次 reload
  let notified = false

  function isLogoutUrl(url) {
    return typeof url === 'string' && LOGOUT_URL_RE.test(url)
  }

  function notifyLogoutIntercepted() {
    if (notified) return
    notified = true
    try {
      document.dispatchEvent(new CustomEvent(LOGOUT_EVENT))
    } catch {
      /* ignore */
    }
  }

  function installFetchInterceptor() {
    if (window.fetch._ozonSellerLogoutPatched) return
    const nativeFetch = window.fetch
    window.fetch = function patchedFetch(input, init) {
      const url = input instanceof Request ? input.url : String(input || '')
      if (isLogoutUrl(url)) {
        // 阻止真实 logout，返回伪造成功响应，避免 SPA 卡在失败分支
        notifyLogoutIntercepted()
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      return nativeFetch.apply(this, arguments)
    }
    window.fetch._ozonSellerLogoutPatched = true
  }

  function installXHRInterceptor() {
    if (XMLHttpRequest.prototype.send._ozonSellerLogoutPatched) return
    const nativeOpen = XMLHttpRequest.prototype.open
    const nativeSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function open(method, url) {
      this._ozonSellerLogoutUrl = url
      return nativeOpen.apply(this, arguments)
    }

    XMLHttpRequest.prototype.send = function send(body) {
      const url = this._ozonSellerLogoutUrl || ''
      if (isLogoutUrl(String(url))) {
        notifyLogoutIntercepted()
        const fakeResponse = JSON.stringify({ success: true })
        Object.defineProperties(this, {
          responseText: { value: fakeResponse, configurable: true },
          response: { value: fakeResponse, configurable: true },
          status: { value: 200, configurable: true },
          statusText: { value: 'OK', configurable: true },
          readyState: { value: 4, configurable: true },
        })
        const xhr = this
        Promise.resolve().then(() => {
          xhr.onreadystatechange?.()
          xhr.onload?.()
        })
        return
      }
      return nativeSend.apply(this, arguments)
    }

    XMLHttpRequest.prototype.send._ozonSellerLogoutPatched = true
  }

  installFetchInterceptor()
  installXHRInterceptor()
})()
