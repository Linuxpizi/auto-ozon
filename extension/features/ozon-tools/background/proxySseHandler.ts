/**
 * SSE 流式代理 — Background 侧 Port handler
 */
import { PROXY_SSE_PORT_NAME } from '../utils/proxySse'

/** 解析 SSE 块为 eventType + data */
function parseSseBlock(block: string): { eventType: string; data: string } {
  let eventType = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    const trimmed = line.trimEnd()
    if (trimmed.startsWith('event:')) {
      eventType = trimmed.slice(6).trim()
    } else if (trimmed.startsWith('data:')) {
      dataLines.push(trimmed.slice(5).trim())
    }
  }
  return { eventType, data: dataLines.join('\n') }
}

function pumpSseStream(
  port: chrome.runtime.Port,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  bufferRef: { value: string },
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return reader.read().then(({ done, value }) => {
    if (signal.aborted) return
    if (done) {
      port.postMessage({ type: 'close' })
      return
    }
    bufferRef.value += decoder.decode(value, { stream: true })
    const parts = bufferRef.value.split('\n\n')
    bufferRef.value = parts.pop() || ''
    for (const block of parts) {
      if (!block.trim()) continue
      const { eventType, data } = parseSseBlock(block)
      try {
        port.postMessage({ type: 'event', eventType, data })
      } catch {
        reader.cancel().catch(() => {})
        return
      }
    }
    return pumpSseStream(port, reader, decoder, bufferRef, signal)
  })
}

export function setupProxySseHandler(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PROXY_SSE_PORT_NAME) return

    let abortController: AbortController | null = null

    port.onMessage.addListener((msg: { type?: string; url?: string }) => {
      if (msg.type === 'close') {
        abortController?.abort()
        abortController = null
        return
      }

      if (msg.type !== 'start' || !msg.url) return

      abortController?.abort()
      abortController = new AbortController()
      const signal = abortController.signal

      void (async () => {
        try {
          const response = await fetch(msg.url!, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
            signal,
          })

          if (!response.ok || !response.body) {
            port.postMessage({ type: 'error', error: `HTTP ${response.status}` })
            return
          }

          port.postMessage({ type: 'open' })

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          const bufferRef = { value: '' }

          await pumpSseStream(port, reader, decoder, bufferRef, signal)

          if (!signal.aborted) {
            port.postMessage({ type: 'close' })
          }
        } catch (error: unknown) {
          if (signal.aborted) return
          const message = error instanceof Error ? error.message : 'SSE 连接失败'
          try {
            port.postMessage({ type: 'error', error: message })
          } catch {
            // port 已断开
          }
        }
      })()
    })

    port.onDisconnect.addListener(() => {
      abortController?.abort()
      abortController = null
    })
  })
}
