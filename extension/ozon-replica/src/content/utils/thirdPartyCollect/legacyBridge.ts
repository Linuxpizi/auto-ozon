/**
 * 旧插件一键采集：经 background / 内联注入从 MAIN 世界取精简数据（postMessage 回传）。
 */
const chromeApi: any = (globalThis as any).chrome

function createToken(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export function fetchPddRawDataFromPage(timeoutMs = 12000): Promise<unknown | null> {
  return new Promise((resolve) => {
    const token = createToken('bcsPddRaw')
    let settled = false
    const finish = (val: unknown | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage, false)
      clearTimeout(timer)
      resolve(val)
    }
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data
      if (!d || typeof d !== 'object' || d.__bcsToken !== token || d.__bcsType !== 'pddRawData') return
      finish(Object.prototype.hasOwnProperty.call(d, 'payload') ? d.payload : null)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    window.addEventListener('message', onMessage, false)

    const injectFallback = () => {
      const src =
        `(function(){var t=${JSON.stringify(token)};function sc(g){if(!g)return 0;var a=g.skus;if(Array.isArray(a)&&a.length)return a.length;a=g.sku;if(Array.isArray(a)&&a.length)return a.length;a=g.skuList;if(Array.isArray(a)&&a.length)return a.length;if(g.skuMap&&typeof g.skuMap==='object'){var k=Object.keys(g.skuMap);if(k.length)return k.length;}return 0;}function ok(r){if(r==null||r.store==null||r.store.initDataObj==null)return false;var g=r.store.initDataObj.goods;return!!(g&&sc(g)>0);}` +
        `function send(r){var p=null;try{p=JSON.parse(JSON.stringify(r));}catch(e1){try{window.postMessage({__bcsToken:t,__bcsType:"pddRawData",payload:r},"*");return;}catch(e2){window.postMessage({__bcsToken:t,__bcsType:"pddRawData",payload:null},"*");return;}}window.postMessage({__bcsToken:t,__bcsType:"pddRawData",payload:p},"*");}` +
        `if(ok(window.rawData)){send(window.rawData);return;}var n=0,m=140,i=setInterval(function(){n++;var r=window.rawData;if(ok(r)){clearInterval(i);send(r);return;}if(n>=m)clearInterval(i);},50);})();`
      const s = document.createElement('script')
      s.textContent = src
      ;(document.documentElement || document.head).appendChild(s)
      s.remove()
    }

    if (chromeApi?.runtime?.sendMessage) {
      try {
        chromeApi.runtime.sendMessage({ action: 'BCS_PDD_FETCH_RAWDATA', token }, (res: any) => {
          if (chromeApi.runtime.lastError || !res?.ok) injectFallback()
        })
      } catch {
        injectFallback()
      }
    } else {
      injectFallback()
    }
  })
}

export interface TaobaoIceBundle {
  item?: Record<string, any>
  skuBase?: Record<string, any>
  skuCore?: Record<string, any>
  headImageVO?: Record<string, any>
  titleVO?: Record<string, any>
}

export function fetchTaobaoIceResFromPage(timeoutMs = 20000): Promise<TaobaoIceBundle | null> {
  return new Promise((resolve) => {
    const token = createToken('bcsTbIce')
    let settled = false
    const finish = (val: TaobaoIceBundle | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage, false)
      clearTimeout(timer)
      resolve(val)
    }
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data
      if (!d || typeof d !== 'object' || d.__bcsToken !== token || d.__bcsType !== 'taobaoIceRes') return
      finish(Object.prototype.hasOwnProperty.call(d, 'payload') ? d.payload : null)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    window.addEventListener('message', onMessage, false)

    const injectFallback = () => {
      const src =
        `(function(){var t=${JSON.stringify(token)};function ext(c){if(!c||!c.loaderData||!c.loaderData.home||!c.loaderData.home.data)return null;var r=c.loaderData.home.data.res;if(!r||!r.skuBase||!r.skuBase.skus||!r.skuBase.skus.length)return null;return{item:r.item,skuBase:r.skuBase,skuCore:r.skuCore,headImageVO:r.componentsVO&&r.componentsVO.headImageVO,titleVO:r.componentsVO&&r.componentsVO.titleVO};}` +
        `function send(x){var p=null;try{p=JSON.parse(JSON.stringify(x));}catch(e1){try{window.postMessage({__bcsToken:t,__bcsType:"taobaoIceRes",payload:x},"*");return;}catch(e2){window.postMessage({__bcsToken:t,__bcsType:"taobaoIceRes",payload:null},"*");return;}}window.postMessage({__bcsToken:t,__bcsType:"taobaoIceRes",payload:p},"*");}` +
        `var w=ext(window.__ICE_APP_CONTEXT__);if(w){send(w);return;}var n=0,m=150,i=setInterval(function(){n++;var u=ext(window.__ICE_APP_CONTEXT__);if(u){clearInterval(i);send(u);return;}if(n>=m)clearInterval(i);},100);})();`
      const s = document.createElement('script')
      s.textContent = src
      ;(document.documentElement || document.head).appendChild(s)
      s.remove()
    }

    if (chromeApi?.runtime?.sendMessage) {
      try {
        chromeApi.runtime.sendMessage({ action: 'BCS_TAOBAO_FETCH_ICE_RES', token }, (res: any) => {
          if (chromeApi.runtime.lastError || !res?.ok) injectFallback()
        })
      } catch {
        injectFallback()
      }
    } else {
      injectFallback()
    }
  })
}

/** 1688 一键采集：立即回传 window 数据（不走 AI 用的 getWindowData 1800ms 等待） */
export function requestLegacy1688WindowData(
  timeoutMs = 500,
  maxRetries = 10,
  retryDelayMs = 1000,
): Promise<{ source: string | null; data: unknown }> {
  return new Promise((resolve, reject) => {
    let retryCount = 0
    let timeoutId: number | null = null
    let isProcessing = false
    let hasSucceeded = false

    const handleResponse = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail || detail.type !== 'getOzonCollectData' || detail.action !== 'getOzonCollectData') return
      if (hasSucceeded || isProcessing) return
      isProcessing = true
      if (timeoutId != null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
      document.removeEventListener('ext-res', handleResponse)
      if (detail.success && detail.data != null) {
        hasSucceeded = true
        resolve({ source: detail.source ?? null, data: detail.data })
      } else {
        isProcessing = false
        scheduleRetry()
      }
    }

    const scheduleRetry = () => {
      if (hasSucceeded) return
      if (retryCount < maxRetries) {
        retryCount++
        window.setTimeout(tryRequest, retryDelayMs)
      } else {
        reject(new Error('未找到 window.__INIT_DATA 或 window.context'))
      }
    }

    const tryRequest = () => {
      if (hasSucceeded) return
      isProcessing = false
      document.addEventListener('ext-res', handleResponse)
      document.dispatchEvent(
        new CustomEvent('ext-req', {
          detail: { type: 'ext-req', action: 'getOzonCollectData' },
        }),
      )
      timeoutId = window.setTimeout(() => {
        if (hasSucceeded) {
          timeoutId = null
          return
        }
        if (!isProcessing) {
          document.removeEventListener('ext-res', handleResponse)
          scheduleRetry()
        }
        timeoutId = null
      }, timeoutMs)
    }

    tryRequest()
  })
}
