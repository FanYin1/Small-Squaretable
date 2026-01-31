/**
 * Stripe 配置
 *
 * 从环境变量加载 Stripe 相关配置
 */

import 'dotenv/config';
import { z } from 'zod';

const stripeConfigSchema = z.object({
  apiKey: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  webhookSecret: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
  publishableKey: z.string().min(1, 'STRIPE_PUBLISHABLE_KEY is required'),
  prices: z.object({
    proMonthly: z.string().min(1, 'STRIPE_PRICE_PRO_MONTHLY is required'),
    proYearly: z.string().min(1, 'STRIPE_PRICE_PRO_YEARLY is required'),
    teamMonthly: z.string().min(1, 'STRIPE_PRICE_TEAM_MONTHLY is required'),
  }),
});

export type StripeConfig = z.infer<typeof stripeConfigSchema>;

/**
 * 加载并验证 Stripe 配置
 */
export function loadStripeConfig(): StripeConfig {
  const rawConfig = {
    apiKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    prices: {
      proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      proYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
      teamMonthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
    },
  };

  try {
    return stripeConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Stripe configuration validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    throw new Error('Invalid Stripe configuration');
  }
}

// 导出单例配置
export const stripeConfig = loadStripeConfig();
