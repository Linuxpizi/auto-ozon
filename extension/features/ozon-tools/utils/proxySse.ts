/**
 * SSE 流式代理 — Content 侧 ProxyEventSource
 * 经 chrome.runtime.connect 与 background 建立长连接，绕过第三方页面 CORS
 */
import { hasExtensionMessaging } from './runtime'

export const PROXY_SSE_PORT_NAME = 'PROXY_SSE'

const CONNECTING = 0
const OPEN = 1
const CLOSED = 2

/** 兼容 EventSource 用法（addEventListener / onerror / close） */
export class ProxyEventSource {
  readonly url: string
  readyState = CONNECTING
  onerror: ((ev: Event) => void) | null = null

  private port: chrome.runtime.Port | null = null
  private listeners = new Map<string, Set<(ev: MessageEvent) => void>>()
  private closed = false

  constructor(url: string) {
    this.url = url
    if (!hasExtensionMessaging()) {
      this.readyState = CLOSED
      throw new Error('非扩展环境，无法使用 SSE 代理')
    }
    this.connect()
  }

  addEventListener(type: string, listener: (ev: MessageEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: (ev: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.readyState = CLOSED
    try {
      this.port?.postMessage({ type: 'close' })
    } catch {
      // ignore
    }
    try {
      this.port?.disconnect()
    } catch {
      // ignore
    }
    this.port = null
  }

  private connect(): void {
    this.port = chrome.runtime.connect({ name: PROXY_SSE_PORT_NAME })
    this.port.postMessage({ type: 'start', url: this.url })

    this.port.onMessage.addListener((msg: { type?: string; eventType?: string; data?: string; error?: string }) => {
      if (msg.type === 'open') {
        this.readyState = OPEN
        return
      }
      if (msg.type === 'event') {
        const eventType = msg.eventType || 'message'
        const ev = new MessageEvent(eventType, { data: msg.data ?? '' })
        this.dispatch(eventType, ev)
        return
      }
      if (msg.type === 'error') {
        this.readyState = CLOSED
        this.onerror?.(new Event('error'))
        return
      }
      if (msg.type === 'close') {
        this.readyState = CLOSED
      }
    })

    this.port.onDisconnect.addListener(() => {
      if (!this.closed) {
        this.readyState = CLOSED
        this.onerror?.(new Event('error'))
      }
    })
  }

  private dispatch(type: string, ev: MessageEvent): void {
    this.listeners.get(type)?.forEach((fn) => fn(ev))
  }
}
