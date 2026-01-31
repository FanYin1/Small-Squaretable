export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
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
  rating?: number;
  ratingCount?: number;
  isPublic: boolean;
  createdAt: string;
}
