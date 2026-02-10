import { api } from './api';
import { nanoid } from 'nanoid';

interface AnalyticsEvent {
  eventType: string;
  properties?: Record<string, unknown>;
  timestamp?: number;
}

const SESSION_KEY = 'analytics_session_id';
const BATCH_SIZE = 20;
const FLUSH_INTERVAL = 10_000;

class AnalyticsSDK {
  private queue: AnalyticsEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;

  constructor() {
    this.sessionId = sessionStorage.getItem(SESSION_KEY) || nanoid();
    sessionStorage.setItem(SESSION_KEY, this.sessionId);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL);
    window.addEventListener('beforeunload', () => this.flush());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  track(eventType: string, properties?: Record<string, unknown>): void {
    this.queue.push({ eventType, properties, timestamp: Date.now() });
    if (this.queue.length >= BATCH_SIZE) {
      this.flush();
    }
  }

  trackPageView(path?: string): void {
    this.track('page.view', {
      path: path || window.location.pathname,
      title: document.title,
    });
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, BATCH_SIZE);
    try {
      await api.post('/analytics/events', {
        events,
        context: {
          sessionId: this.sessionId,
          platform: 'web',
          deviceType: this.getDeviceType(),
          browser: navigator.userAgent,
          referrer: document.referrer || undefined,
        },
      });
    } catch {
      if (this.queue.length < 200) {
        this.queue.unshift(...events);
      }
    }
  }

  private getDeviceType(): string {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }
}

export const analytics = new AnalyticsSDK();
