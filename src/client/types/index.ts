export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  tenantId: string;
  role?: 'user' | 'moderator' | 'admin';
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
  unreadCount?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'file' | 'audio';
  url: string;
  name?: string;
  size?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  duration?: number; // audio duration in seconds
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: MessageAttachment[];
  characterId?: string;
  characterName?: string;
  parentMessageId?: number;
  createdAt: string;
}

export interface CharacterCardData {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  creator_notes?: string;
  creator?: string;
  character_version?: string;
  tags?: string[];
  character_book?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
  spec?: string;
  spec_version?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
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
  creatorId?: string;
  cardData?: CharacterCardData;
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
