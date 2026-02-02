export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  tenantId: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  title: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface Character {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  tags?: string[];
  category?: string;
  rating?: number;
  ratingCount?: number;
  downloadCount?: number;
  viewCount?: number;
  isPublic: boolean;
  isNsfw?: boolean;
  cardData?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export type PlanType = 'free' | 'pro' | 'team';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

export interface Subscription {
  id?: string;
  tenantId?: string;
  plan: PlanType;
  status: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface SubscriptionConfig {
  publishableKey: string;
  prices: {
    proMonthly: string;
    proYearly: string;
    teamMonthly: string;
  };
}
