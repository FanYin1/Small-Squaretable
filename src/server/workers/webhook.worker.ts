/**
 * Webhook 投递 Worker
 *
 * 后台轮询 pending/retrying 投递记录，执行 HTTP 请求
 * 支持 HMAC-SHA256 签名和指数退避重试
 */

import { createHmac } from 'crypto';
import type { WebhookRepository } from '../../db/repositories/webhook.repository';
import type { WebhookDelivery } from '../../db/schema/webhooks';
import { logger } from '../services/logger.service';

const workerLogger = logger.child({ module: 'webhook-worker' });

/** 重试延迟 (毫秒): 30s, 2m, 15m, 1h, 6h */
const RETRY_DELAYS = [30_000, 120_000, 900_000, 3_600_000, 21_600_000];

const DELIVERY_TIMEOUT = 10_000;

export class WebhookWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(private repo: WebhookRepository) {}

  start(intervalMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), intervalMs);
    workerLogger.info('Webhook worker started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      workerLogger.info('Webhook worker stopped');
    }
  }

  private async poll(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const deliveries = await this.repo.findPendingDeliveries(10);
      for (const delivery of deliveries) {
        await this.deliver(delivery);
      }
    } catch (error) {
      workerLogger.error('Poll error', error as Error);
    } finally {
      this.processing = false;
    }
  }

  async deliver(delivery: WebhookDelivery & { endpoint: { url: string; secret: string } }): Promise<void> {
    const body = JSON.stringify(delivery.payload);
    const signature = this.sign(delivery.endpoint.secret, body);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT);

      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': delivery.id,
          'X-Webhook-Event': delivery.event,
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': new Date().toISOString(),
          'User-Agent': 'SmallSquaretable-Webhook/1.0',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseText = await response.text().catch(() => '');
      const newAttempts = delivery.attempts + 1;

      if (response.ok) {
        await this.repo.updateDelivery(delivery.id, {
          status: 'success',
          httpStatus: response.status,
          response: responseText.slice(0, 1000),
          attempts: newAttempts,
          completedAt: new Date(),
        });
      } else {
        await this.handleFailure(delivery, newAttempts, response.status, responseText);
      }
    } catch (error) {
      const newAttempts = delivery.attempts + 1;
      const errMsg = error instanceof Error ? error.message : String(error);
      await this.handleFailure(delivery, newAttempts, null, errMsg);
    }
  }

  private async handleFailure(
    delivery: WebhookDelivery,
    attempts: number,
    httpStatus: number | null,
    response: string,
  ): Promise<void> {
    if (attempts >= delivery.maxAttempts) {
      await this.repo.updateDelivery(delivery.id, {
        status: 'failed',
        httpStatus,
        response: response.slice(0, 1000),
        attempts,
        completedAt: new Date(),
      });
    } else {
      const delay = this.getRetryDelay(attempts - 1);
      await this.repo.updateDelivery(delivery.id, {
        status: 'retrying',
        httpStatus,
        response: response.slice(0, 1000),
        attempts,
        nextRetryAt: new Date(Date.now() + delay),
      });
    }
  }

  sign(secret: string, payload: string): string {
    const hmac = createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${hmac}`;
  }

  getRetryDelay(attempt: number): number {
    return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
  }
}
