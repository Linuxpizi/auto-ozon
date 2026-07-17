/**
 * 三方一键采集：Background 在 MAIN 世界读取页面数据（对齐旧插件 BCS_PDD / BCS_TAOBAO）。
 * 与 AI 采集使用的 getWindowData 数据桥分离，避免走 1688 1800ms 等待与淘宝 SKU 点击循环。
 */

const chromeApi: any = chrome

export function handleThirdPartyCollectMessage(
  request: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): boolean {
  if (request.action === 'BCS_PDD_FETCH_RAWDATA' && sender.tab?.id) {
    const token = request.token
    if (!token || typeof token !== 'string') {
      sendResponse({ ok: false, error: 'bad token' })
      return false
    }
    chromeApi.scripting
      .executeScript({
        target: { tabId: sender.tab.id, allFrames: true },
        world: 'MAIN',
        injectImmediately: true,
        args: [token],
        func: (t: string) => {
          function pddSkuCount(g: any): number {
            if (!g) return 0
            let a = g.skus
            if (Array.isArray(a) && a.length) return a.length
            a = g.sku
            if (Array.isArray(a) && a.length) return a.length
            a = g.skuList
            if (Array.isArray(a) && a.length) return a.length
            if (g.skuMap && typeof g.skuMap === 'object') {
              const keys = Object.keys(g.skuMap)
              if (keys.length) return keys.length
            }
            return 0
          }
          function hasUsableRaw(raw: any): boolean {
            if (raw == null || raw.store == null || raw.store.initDataObj == null) return false
            const g = raw.store.initDataObj.goods
            if (!g) return false
            return pddSkuCount(g) > 0
          }
          function sendPayload(raw: any) {
            let payload: any = null
            try {
              payload = JSON.parse(JSON.stringify(raw))
            } catch {
              try {
                window.postMessage({ __bcsToken: t, __bcsType: 'pddRawData', payload: raw }, '*')
                return
              } catch {
                window.postMessage({ __bcsToken: t, __bcsType: 'pddRawData', payload: null }, '*')
                return
              }
            }
            window.postMessage({ __bcsToken: t, __bcsType: 'pddRawData', payload }, '*')
          }
          if (hasUsableRaw((window as any).rawData)) {
            sendPayload((window as any).rawData)
            return
          }
          let n = 0
          const max = 140
          const id = setInterval(() => {
            n++
            const raw = (window as any).rawData
            if (hasUsableRaw(raw)) {
              clearInterval(id)
              sendPayload(raw)
              return
            }
            if (n >= max) clearInterval(id)
          }, 50)
        },
      })
      .then(() => sendResponse({ ok: true }))
      .catch((err: Error) => sendResponse({ ok: false, error: err?.message || String(err) }))
    return true
  }

  if (request.action === 'BCS_TAOBAO_FETCH_ICE_RES' && sender.tab?.id) {
    const token = request.token
    if (!token || typeof token !== 'string') {
      sendResponse({ ok: false, error: 'bad token' })
      return false
    }
    chromeApi.scripting
      .executeScript({
        target: { tabId: sender.tab.id, allFrames: true },
        world: 'MAIN',
        injectImmediately: true,
        args: [token],
        func: (t: string) => {
          function extractSlimRes(ctx: any) {
            if (!ctx?.loaderData?.home?.data) return null
            const res = ctx.loaderData.home.data.res
            if (!res?.skuBase?.skus?.length) return null
            return {
              item: res.item,
              skuBase: res.skuBase,
              skuCore: res.skuCore,
              headImageVO: res.componentsVO?.headImageVO,
              titleVO: res.componentsVO?.titleVO,
            }
          }
          function sendPayload(payload: any) {
            let p: any = null
            try {
              p = JSON.parse(JSON.stringify(payload))
            } catch {
              try {
                window.postMessage({ __bcsToken: t, __bcsType: 'taobaoIceRes', payload }, '*')
                return
              } catch {
                window.postMessage({ __bcsToken: t, __bcsType: 'taobaoIceRes', payload: null }, '*')
                return
              }
            }
            window.postMessage({ __bcsToken: t, __bcsType: 'taobaoIceRes', payload: p }, '*')
          }
          const slim = extractSlimRes((window as any).__ICE_APP_CONTEXT__)
          if (slim) {
            sendPayload(slim)
            return
          }
          let n = 0
          const max = 150
          const id = setInterval(() => {
            n++
            const s = extractSlimRes((window as any).__ICE_APP_CONTEXT__)
            if (s) {
              clearInterval(id)
              sendPayload(s)
              return
            }
            if (n >= max) clearInterval(id)
          }, 100)
        },
      })
      .then(() => sendResponse({ ok: true }))
      .catch((err: Error) => sendResponse({ ok: false, error: err?.message || String(err) }))
    return true
  }

  return false
}
