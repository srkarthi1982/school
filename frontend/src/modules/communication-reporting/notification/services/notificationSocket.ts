import type { NotificationDto } from './notificationApi'

export type NotificationEvent =
  | { type: 'connection.ready'; user_id: number; unread_count: number }
  | { type: 'notification.new'; notification: NotificationDto }
  | { type: 'notification.read'; id: number }
  | { type: 'notification.all_read'; count: number }
  | { type: 'notification.all_read_by_module'; source_module: string; count: number }
  | { type: 'error'; message: string }

type Listener = (event: NotificationEvent) => void

const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000]

export class NotificationSocket {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private reconnectAttempts = 0
  private intentionalClose = false
  private reconnectTimer: number | null = null
  private currentToken: string | null = null

  get listenerCount(): number {
    return this.listeners.size
  }

  connect(token: string): void {
    this.currentToken = token
    this.intentionalClose = false
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }
    this.openSocket()
  }

  disconnect(): void {
    this.intentionalClose = true
    this.currentToken = null
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.reconnectAttempts = 0
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  send(event: { type: 'read'; id: number } | { type: 'mark_all_read' } | { type: 'mark_all_read_by_module'; source_module: string }): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event))
    }
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private openSocket(): void {
    if (!this.currentToken) return
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/api/v1/notification/ws?token=${encodeURIComponent(this.currentToken)}`
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.reconnectAttempts = 0
    }
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as NotificationEvent
        this.listeners.forEach((fn) => {
          try { fn(parsed) } catch (err) { console.error('[notificationSocket] listener error', err) }
        })
      } catch (err) {
      }
    }
    ws.onerror = (err) => {
      console.error('[notificationSocket] WebSocket error:', err)
    }
    ws.onclose = (ev) => {
      this.ws = null
      if (this.intentionalClose) return
      if (ev.code === 1008) {
        return
      }
      //disable reconnect
      //this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || !this.currentToken) return
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)]
    this.reconnectAttempts += 1
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }
}

export const notificationSocket = new NotificationSocket()
