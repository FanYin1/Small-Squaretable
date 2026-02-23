export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  tenantId: string;
  role?: 'user' | 'moderator' | 'admin';
  bio?: string;
  followerCount?: number;
  followingCount?: number;
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

export interface ExpressionConfig {
  [emotionLabel: string]: string; // emotion label -> image URL
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
  alternate_greetings?: string[];
  post_history_instructions?: string;
  creation_date?: number;
  modification_date?: number;
  source?: string[];
  group_only_greetings?: string[];
  creator_notes_multilingual?: Record<string, string>;
  assets?: Array<{ type: string; uri: string; name: string }>;
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
  shareToken?: string;
  forkedFromId?: string;
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

export interface ChatSnapshot {
  id: string;
  chatId: string;
  shareToken: string;
  title?: string;
  messages: Message[];
  messageCount: number;
  characterName?: string;
  characterAvatar?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  bio: string;
  followerCount: number;
  followingCount: number;
  characterCount: number;
  createdAt: string;
}

export interface CharacterCollaborator {
  id: string;
  characterId: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  role: 'editor' | 'viewer';
  createdAt: string;
}

export interface CharacterTemplate {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  cardData: CharacterCardData;
  category?: string;
  tags?: string[];
  isPublic: boolean;
  usageCount: number;
  creatorId?: string;
  createdAt: string;
}

export interface CharacterCollection {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder: number;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
}
