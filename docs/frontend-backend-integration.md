# Frontend-Backend Integration Documentation

## Overview

This document describes the complete frontend-backend integration implementation for the Small-Squaretable project, connecting the Vue 3 frontend with the Hono backend API.

## Architecture

### API Client (`src/client/services/api.ts`)

The API client provides a unified interface for making HTTP requests to the backend with the following features:

#### Core Features

1. **Request/Response Interceptors**
   - Request interceptors: Modify requests before they are sent
   - Response interceptors: Process responses before they reach the application
   - Error interceptors: Handle errors globally (e.g., 401 unauthorized)

2. **Automatic Token Management**
   - Automatically attaches JWT token from localStorage to all requests
   - Includes Authorization header: `Bearer <token>`

3. **Unified Error Handling**
   - Custom `ApiError` class with status code, error code, and message
   - Automatic error interception for common scenarios (401, network errors)

4. **Standard Response Format**
   - Expects backend responses in format: `{ success, data, error, meta }`
   - Automatically extracts `data` field for convenience

#### HTTP Methods

```typescript
api.get<T>(endpoint: string, options?: RequestInit): Promise<T>
api.post<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T>
api.patch<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T>
api.put<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T>
api.delete<T>(endpoint: string, options?: RequestInit): Promise<T>
```

#### Interceptor Management

```typescript
// Add request interceptor
api.addRequestInterceptor((config, url) => {
  // Modify config
  return config;
});

// Add response interceptor
api.addResponseInterceptor((response) => {
  // Process response
  return response;
});

// Add error interceptor
api.addErrorInterceptor((error: ApiError) => {
  // Handle error globally
});
```

#### Default Error Interceptor

The API client includes a default error interceptor that:
- Clears authentication tokens on 401 Unauthorized responses
- Logs warning messages for debugging

## API Services

### Authentication API (`src/client/services/auth.api.ts`)

Handles user authentication operations:

```typescript
authApi.login({ email, password })
  → { user, token, refreshToken }

authApi.register({ email, password, name })
  → { user, token, refreshToken }

authApi.logout()
  → void

authApi.refreshToken({ refreshToken })
  → { token, refreshToken }

authApi.getMe()
  → { user }
```

### Character API (`src/client/services/character.api.ts`)

Manages character CRUD operations:

```typescript
characterApi.getCharacters({ search?, tags?, page?, limit? })
  → { characters }

characterApi.getCharacter(id)
  → { character }

characterApi.createCharacter(data)
  → { character }

characterApi.updateCharacter(id, data)
  → { character }

characterApi.deleteCharacter(id)
  → void
```

### Chat API (`src/client/services/chat.api.ts`)

Handles chat and message operations:

```typescript
chatApi.getChats()
  → { chats }

chatApi.getChat(id)
  → { chat }

chatApi.createChat({ characterId, title? })
  → { chat }

chatApi.deleteChat(id)
  → void

chatApi.getMessages(chatId, { cursor?, limit? })
  → { messages }

chatApi.sendMessage(chatId, { content })
  → { message }
```

### Subscription API (`src/client/services/subscription.api.ts`)

Manages subscription and billing:

```typescript
subscriptionApi.getStatus()
  → { subscription }

subscriptionApi.getConfig()
  → { publishableKey, prices }

subscriptionApi.createCheckout({ priceId, successUrl, cancelUrl })
  → { url }

subscriptionApi.createPortal({ returnUrl })
  → { url }
```

### Usage API (`src/client/services/usage.api.ts`)

Tracks resource usage and quotas:

```typescript
usageApi.getStats()
  → { period, byResource, total }

usageApi.getQuota()
  → { messages, llm_tokens, images, api_calls }
```

### User API (`src/client/services/user.api.ts`)

Manages user profile operations:

```typescript
userApi.getUser(id)
  → { user }

userApi.updateUser(id, { name?, avatar? })
  → { user }
```

## Pinia Stores

### User Store (`src/client/stores/user.ts`)

Manages user authentication state and operations.

#### State

```typescript
{
  user: User | null
  token: string | null
  refreshToken: string | null
  loading: boolean
  error: string | null
}
```

#### Getters

- `isAuthenticated`: Returns true if user is logged in with valid token

#### Actions

```typescript
// Login user
await userStore.login(email, password)

// Register new user
await userStore.register(email, password, name)

// Logout user
await userStore.logout()

// Refresh access token
await userStore.refreshAccessToken()

// Fetch current user profile
await userStore.fetchProfile()

// Initialize store (fetch profile if token exists)
await userStore.initialize()

// Set token manually
userStore.setToken(token, refreshToken?)

// Clear authentication state
userStore.clearAuth()
```

#### Token Management

- Tokens are automatically persisted to localStorage
- On login/register, tokens are saved and user info is stored
- On logout, all tokens and user data are cleared
- Token refresh automatically updates stored tokens

### Chat Store (`src/client/stores/chat.ts`)

Manages chat sessions and messages.

#### State

```typescript
{
  chats: Chat[]
  currentChatId: string | null
  messages: Message[]
  loading: boolean
  sending: boolean
  error: string | null
}
```

#### Getters

- `currentChat`: Returns the currently active chat object

#### Actions

```typescript
// Fetch all chats
await chatStore.fetchChats()

// Fetch messages for a chat
await chatStore.fetchMessages(chatId)

// Send a message in current chat
await chatStore.sendMessage(content)

// Create new chat
const chat = await chatStore.createChat(characterId, title?)

// Delete a chat
await chatStore.deleteChat(chatId)

// Set current active chat (and fetch its messages)
await chatStore.setCurrentChat(chatId)

// Add message to current chat (for optimistic updates)
chatStore.addMessage(message)

// Clear all messages
chatStore.clearMessages()
```

### Character Store (`src/client/stores/character.ts`)

Manages character data and filtering (already implemented).

### Subscription Store (`src/client/stores/subscription.ts`)

Manages subscription status and billing (already implemented).

## Backend API Endpoints

All endpoints are prefixed with `/api/v1`.

### Authentication Routes (`/auth`)

- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/logout` - Logout user (requires auth)
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user (requires auth)

### Character Routes (`/characters`)

- `GET /characters` - Get user's characters (requires auth)
- `GET /characters/marketplace` - Browse public characters
- `GET /characters/search` - Search characters
- `GET /characters/:id` - Get character details (requires auth)
- `POST /characters` - Create character (requires auth)
- `PATCH /characters/:id` - Update character (requires auth)
- `DELETE /characters/:id` - Delete character (requires auth)
- `POST /characters/:id/publish` - Publish to marketplace (requires auth + feature)
- `POST /characters/:id/unpublish` - Unpublish from marketplace (requires auth + feature)
- `POST /characters/:id/fork` - Fork character (requires auth)
- `POST /characters/:id/ratings` - Submit rating (requires auth)
- `GET /characters/:id/ratings` - Get ratings
- `PUT /characters/:id/ratings` - Update rating (requires auth)
- `DELETE /characters/:id/ratings` - Delete rating (requires auth)

### Chat Routes (`/chats`)

- `GET /chats` - Get user's chats (requires auth)
- `GET /chats/:id` - Get chat details (requires auth)
- `POST /chats` - Create chat (requires auth)
- `PATCH /chats/:id` - Update chat (requires auth)
- `DELETE /chats/:id` - Delete chat (requires auth)
- `GET /chats/:id/messages` - Get chat messages (requires auth)
- `POST /chats/:id/messages` - Send message (requires auth + quota)

### Subscription Routes (`/subscriptions`)

- `GET /subscriptions/status` - Get subscription status (requires auth)
- `GET /subscriptions/config` - Get Stripe configuration
- `POST /subscriptions/checkout` - Create checkout session (requires auth)
- `POST /subscriptions/portal` - Create billing portal session (requires auth)
- `POST /subscriptions/webhook` - Stripe webhook handler

### Usage Routes (`/usage`)

- `GET /usage/stats` - Get usage statistics (requires auth)
- `GET /usage/quota` - Get quota information (requires auth)

### User Routes (`/users`)

- `GET /users/:id` - Get user profile (requires auth)
- `PATCH /users/:id` - Update user profile (requires auth)

## Error Handling

### API Error Structure

```typescript
class ApiError extends Error {
  status: number      // HTTP status code
  code: string        // Error code (e.g., 'UNAUTHORIZED')
  message: string     // Human-readable error message
  details?: unknown   // Additional error details
}
```

### Common Error Codes

- `UNAUTHORIZED` (401) - Invalid or expired token
- `FORBIDDEN` (403) - Insufficient permissions
- `NOT_FOUND` (404) - Resource not found
- `VALIDATION_ERROR` (400) - Invalid input data
- `QUOTA_EXCEEDED` (429) - Usage quota exceeded
- `SERVER_ERROR` (500) - Internal server error
- `NETWORK_ERROR` (0) - Network connection failed

### Error Handling in Stores

All store actions follow this pattern:

```typescript
async function action() {
  loading.value = true;
  error.value = null;
  try {
    const response = await api.method();
    // Update state
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.message;
    } else {
      error.value = 'Generic error message';
    }
    throw e; // Re-throw for component handling
  } finally {
    loading.value = false;
  }
}
```

## Testing

### Test Coverage

All new integration code includes comprehensive unit tests:

1. **API Client Tests** (`src/client/services/api.spec.ts`)
   - Request/response handling
   - Token management
   - Error handling
   - Interceptor functionality
   - All HTTP methods

2. **User Store Tests** (`src/client/stores/user.spec.ts`)
   - Login/register flows
   - Logout functionality
   - Token refresh
   - Profile fetching
   - Error handling
   - Initialization

3. **Chat Store Tests** (`src/client/stores/chat.spec.ts`)
   - Chat CRUD operations
   - Message fetching
   - Message sending
   - Current chat management
   - Error handling

### Test Setup

A test setup file (`src/client/test-setup.ts`) provides:
- localStorage mock for Node.js environment
- Automatic cleanup between tests

### Running Tests

```bash
# Run all integration tests
npm test -- src/client/services/api.spec.ts src/client/stores/user.spec.ts src/client/stores/chat.spec.ts --run

# Run specific test file
npm test -- src/client/services/api.spec.ts --run

# Run with coverage
npm run test:coverage
```

## Usage Examples

### Authentication Flow

```typescript
import { useUserStore } from '@client/stores';

const userStore = useUserStore();

// Initialize on app startup
await userStore.initialize();

// Login
try {
  await userStore.login('user@example.com', 'password');
  // Redirect to dashboard
} catch (error) {
  // Show error message
  console.error(userStore.error);
}

// Logout
await userStore.logout();
```

### Chat Flow

```typescript
import { useChatStore } from '@client/stores';

const chatStore = useChatStore();

// Load chats
await chatStore.fetchChats();

// Create new chat
const chat = await chatStore.createChat('character-id', 'Chat Title');

// Set as current chat (automatically loads messages)
await chatStore.setCurrentChat(chat.id);

// Send message
await chatStore.sendMessage('Hello!');

// Delete chat
await chatStore.deleteChat(chat.id);
```

### Character Management

```typescript
import { useCharacterStore } from '@client/stores';

const characterStore = useCharacterStore();

// Load characters
await characterStore.fetchCharacters();

// Search characters
await characterStore.searchCharacters('fantasy');

// Filter by tags
characterStore.setSelectedTags(['anime', 'fantasy']);
await characterStore.fetchCharacters();
```

### Subscription Management

```typescript
import { useSubscriptionStore } from '@client/stores';

const subscriptionStore = useSubscriptionStore();

// Load subscription status
await subscriptionStore.fetchStatus();

// Check plan
if (subscriptionStore.isPro) {
  // Show pro features
}

// Start checkout
await subscriptionStore.startCheckout('price_id');

// Open billing portal
await subscriptionStore.openPortal();
```

## Best Practices

### 1. Error Handling

Always handle errors in components:

```typescript
try {
  await store.action();
} catch (error) {
  if (error instanceof ApiError) {
    // Show user-friendly error message
    ElMessage.error(error.message);
  }
}
```

### 2. Loading States

Use loading states for better UX:

```typescript
<el-button :loading="userStore.loading" @click="handleLogin">
  Login
</el-button>
```

### 3. Token Refresh

The user store handles token refresh automatically. For manual refresh:

```typescript
try {
  await userStore.refreshAccessToken();
} catch (error) {
  // Token refresh failed, redirect to login
  router.push('/login');
}
```

### 4. Optimistic Updates

For better UX, update UI optimistically:

```typescript
// Add message immediately
chatStore.addMessage(optimisticMessage);

try {
  // Send to server
  await chatStore.sendMessage(content);
} catch (error) {
  // Revert on error
  chatStore.messages = chatStore.messages.filter(m => m.id !== optimisticMessage.id);
}
```

### 5. Request Cancellation

For long-running requests, consider using AbortController:

```typescript
const controller = new AbortController();

api.get('/endpoint', { signal: controller.signal });

// Cancel request
controller.abort();
```

## Security Considerations

1. **Token Storage**: Tokens are stored in localStorage. Consider using httpOnly cookies for production.

2. **CSRF Protection**: Implement CSRF tokens for state-changing operations.

3. **XSS Prevention**: Always sanitize user input before rendering.

4. **Token Expiration**: Implement automatic token refresh before expiration.

5. **Secure Communication**: Always use HTTPS in production.

## Future Enhancements

1. **Request Caching**: Implement response caching for frequently accessed data
2. **Retry Logic**: Add automatic retry for failed requests
3. **Request Deduplication**: Prevent duplicate simultaneous requests
4. **Offline Support**: Queue requests when offline and sync when online
5. **WebSocket Integration**: Real-time updates for chat messages
6. **Request Batching**: Batch multiple requests for better performance

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check if token is valid
   - Try refreshing token
   - Re-login if refresh fails

2. **Network Errors**
   - Check backend server is running
   - Verify API base URL configuration
   - Check CORS settings

3. **Type Errors**
   - Ensure backend response matches expected types
   - Update type definitions if API changes

4. **State Not Updating**
   - Check if store action is awaited
   - Verify reactive state is being used
   - Check for errors in console

## Conclusion

The frontend-backend integration provides a robust, type-safe, and maintainable foundation for the Small-Squaretable application. All API operations are centralized, error handling is consistent, and the architecture supports future enhancements.
