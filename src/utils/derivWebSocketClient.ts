/**
 * Official Deriv WebSocket API Client for Real-Time Ticks & OHLC Candles
 * Endpoint: wss://ws.derivws.com/websockets/v3?app_id=1089
 */

export interface DerivTick {
  symbol: string;
  price: number;
  time: number; // epoch seconds or ms
  bid?: number;
  ask?: number;
}

export interface DerivCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

type TickCallback = (tick: DerivTick) => void;
type CandleCallback = (candles: DerivCandle[]) => void;

class DerivWebSocketClient {
  private ws: WebSocket | null = null;
  private url = 'wss://ws.derivws.com/websockets/v3?app_id=1089';
  private isConnected = false;
  private reconnectTimer: any = null;
  private tickSubscribers: Map<string, Set<TickCallback>> = new Map();
  private candleSubscribers: Map<string, Set<CandleCallback>> = new Map();
  private activeSubscriptions: Set<string> = new Set();
  private reqIdCounter = 1;

  constructor() {
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        // Resubscribe active symbols
        for (const sym of this.activeSubscriptions) {
          this.sendSubscription(sym);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch {
          // ignore parse error
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.scheduleReconnect();
      };
    } catch {
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  public mapToDerivSymbol(symbol: string): string {
    const clean = (symbol || '').toUpperCase().trim();
    if (clean.includes('R_') || clean.includes('1HZ') || clean.includes('BOOM') || clean.includes('CRASH')) {
      return clean;
    }
    if (clean.startsWith('FRX') || clean.startsWith('CRY')) {
      return clean;
    }
    if (clean === 'EUR/USD' || clean.includes('EUR/USD')) return 'frxEURUSD';
    if (clean === 'GBP/USD' || clean.includes('GBP/USD')) return 'frxGBPUSD';
    if (clean === 'USD/JPY' || clean.includes('USD/JPY')) return 'frxUSDJPY';
    if (clean === 'AUD/USD' || clean.includes('AUD/USD')) return 'frxAUDUSD';
    if (clean === 'GBP/JPY' || clean.includes('GBP/JPY')) return 'frxGBPJPY';
    
    // Default synthetic fallback
    return 'R_100';
  }

  public subscribeTicks(symbol: string, callback: TickCallback): () => void {
    const derivSym = this.mapToDerivSymbol(symbol);
    if (!this.tickSubscribers.has(derivSym)) {
      this.tickSubscribers.set(derivSym, new Set());
    }
    this.tickSubscribers.get(derivSym)!.add(callback);
    this.activeSubscriptions.add(derivSym);

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription(derivSym);
    }

    return () => {
      const set = this.tickSubscribers.get(derivSym);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.tickSubscribers.delete(derivSym);
          this.activeSubscriptions.delete(derivSym);
          this.sendUnsubscription(derivSym);
        }
      }
    };
  }

  private sendSubscription(derivSym: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      // Exact subscribe request specified by user
      this.ws.send(
        JSON.stringify({
          ticks_history: derivSym,
          adjust_start_time: 1,
          count: 100,
          end: 'latest',
          start: 1,
          style: 'ticks',
          subscribe: 1,
          req_id: this.reqIdCounter++,
        })
      );
    } catch {
      // ignore send error
    }
  }

  private sendUnsubscription(derivSym: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(
        JSON.stringify({
          forget_all: 'ticks',
          req_id: this.reqIdCounter++,
        })
      );
    } catch {
      // ignore
    }
  }

  private handleMessage(data: any) {
    if (!data) return;

    // Handle single tick update or history tick
    if ((data.msg_type === 'tick' || data.msg_type === 'history') && data.tick) {
      const t = data.tick;
      const derivSym = t.symbol;
      const price = Number(t.quote);
      const time = Number(t.epoch) * 1000 || Date.now();

      if (!Number.isNaN(price)) {
        // Broadcast to matching subscribers
        for (const [sym, subs] of this.tickSubscribers.entries()) {
          if (!derivSym || sym === derivSym || derivSym.includes(sym) || sym.includes(derivSym)) {
            const tickObj: DerivTick = { symbol: sym, price, time };
            for (const cb of subs) {
              try {
                cb(tickObj);
              } catch {
                // ignore
              }
            }
          }
        }
      }
    }
  }
}

export const derivClient = new DerivWebSocketClient();
