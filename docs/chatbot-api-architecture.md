# Chatbot Conversation API Documentation

## Overview
This document describes the backend API architecture for the Chatbot Conversation feature in Flowise.

## Architecture Components

### 1. Database Entities

#### Conversation Entity
- **Location**: `/packages/server/src/database/entities/Conversation.ts`
- **Purpose**: Stores conversation metadata and sharing information
- **Fields**:
  - `id` (UUID): Primary key
  - `title` (text): Conversation title
  - `chatflowId` (UUID, indexed): Reference to ChatFlow
  - `chatId` (varchar, unique, indexed): Unique conversation identifier
  - `workspaceId` (text, indexed): Workspace association
  - `userId` (UUID, indexed, optional): User who owns the conversation
  - `isPublic` (boolean): Public sharing status
  - `shareToken` (varchar, unique, indexed, optional): Shareable link token
  - `sharePassword` (text, optional): Hashed password for protected shares
  - `shareExpiresAt` (timestamp, optional): Share link expiration
  - `lastMessageAt` (timestamp, indexed, optional): Last message timestamp
  - `messageCount` (int): Total messages in conversation
  - `createdDate` (timestamp): Creation timestamp
  - `updatedDate` (timestamp): Last update timestamp

#### ChatMessage Entity Updates
- **Location**: `/packages/server/src/database/entities/ChatMessage.ts`
- **Changes**: Added indexes to `chatId` and `sessionId` fields for efficient querying
- **Relationship**: Each message belongs to a conversation via `chatId`

### 2. Service Layer

#### Conversation Service
- **Location**: `/packages/server/src/services/conversations/index.ts`
- **Purpose**: Business logic for conversation management
- **Key Functions**:
  - `createConversation()`: Create new conversation
  - `getConversationById()`: Retrieve conversation by ID
  - `getConversationByChatId()`: Retrieve conversation by chatId
  - `getConversationByShareToken()`: Retrieve public shared conversation
  - `getAllConversations()`: List conversations with pagination
  - `getConversationsGroupedByTime()`: Group conversations by time periods
  - `updateConversationTitle()`: Rename conversation
  - `updateConversationMetadata()`: Update message count and last message time
  - `enablePublicSharing()`: Generate share link with optional password/expiration
  - `disablePublicSharing()`: Revoke public access
  - `verifySharePassword()`: Validate password for protected shares
  - `deleteConversation()`: Delete conversation and messages
  - `deleteAllConversations()`: Clear all conversations for user/workspace

### 3. Controller Layer

#### Conversation Controller
- **Location**: `/packages/server/src/controllers/conversations/index.ts`
- **Purpose**: Handle HTTP requests and responses
- **Key Functions**:
  - `createConversation()`: POST /api/v1/conversations
  - `getAllConversations()`: GET /api/v1/conversations
  - `getConversationsGrouped()`: GET /api/v1/conversations/grouped
  - `getConversationById()`: GET /api/v1/conversations/:id
  - `updateConversation()`: PATCH /api/v1/conversations/:id
  - `deleteConversation()`: DELETE /api/v1/conversations/:id
  - `deleteAllConversations()`: DELETE /api/v1/conversations
  - `getConversationMessages()`: GET /api/v1/conversations/:id/messages
  - `enableSharing()`: POST /api/v1/conversations/:id/share
  - `disableSharing()`: DELETE /api/v1/conversations/:id/share
  - `getPublicConversation()`: GET /api/v1/public-conversations/:shareToken
  - `getPublicConversationMessages()`: GET /api/v1/public-conversations/:shareToken/messages
  - `verifyPublicConversationPassword()`: POST /api/v1/public-conversations/:shareToken/verify

### 4. Routes

#### Authenticated Routes
- **Location**: `/packages/server/src/routes/conversations/index.ts`
- **Base Path**: `/api/v1/conversations`
- **Authentication**: Required (uses workspace context)

#### Public Routes
- **Location**: `/packages/server/src/routes/public-conversations/index.ts`
- **Base Path**: `/api/v1/public-conversations`
- **Authentication**: Not required (read-only access)

## API Endpoints

### Authenticated Endpoints

#### Create Conversation
```http
POST /api/v1/conversations
Content-Type: application/json
Authorization: Bearer <token>

{
  "chatflowId": "uuid",
  "title": "My Conversation" // optional
}

Response: 201 Created
{
  "id": "uuid",
  "title": "My Conversation",
  "chatflowId": "uuid",
  "chatId": "generated_chat_id",
  "workspaceId": "uuid",
  "userId": "uuid",
  "isPublic": false,
  "messageCount": 0,
  "createdDate": "2024-01-01T00:00:00Z",
  "updatedDate": "2024-01-01T00:00:00Z"
}
```

#### List Conversations
```http
GET /api/v1/conversations?page=1&pageSize=50&sortOrder=DESC&chatflowId=uuid
Authorization: Bearer <token>

Response: 200 OK
{
  "conversations": [...],
  "total": 100,
  "page": 1,
  "pageSize": 50,
  "totalPages": 2
}
```

#### Get Grouped Conversations
```http
GET /api/v1/conversations/grouped
Authorization: Bearer <token>

Response: 200 OK
{
  "today": [...],
  "last7Days": [...],
  "previous30Days": [...]
}
```

#### Get Conversation
```http
GET /api/v1/conversations/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "uuid",
  "title": "My Conversation",
  "chatflowId": "uuid",
  "chatId": "chat_id",
  "workspaceId": "uuid",
  "chatflow": { ... }
}
```

#### Update Conversation
```http
PATCH /api/v1/conversations/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Updated Title"
}

Response: 200 OK
{
  "id": "uuid",
  "title": "Updated Title",
  ...
}
```

#### Delete Conversation
```http
DELETE /api/v1/conversations/:id
Authorization: Bearer <token>

Response: 204 No Content
```

#### Delete All Conversations
```http
DELETE /api/v1/conversations
Authorization: Bearer <token>

Response: 204 No Content
```

#### Get Conversation Messages
```http
GET /api/v1/conversations/:id/messages?page=1&pageSize=50&sortOrder=ASC
Authorization: Bearer <token>

Response: 200 OK
[
  {
    "id": "uuid",
    "role": "userMessage",
    "content": "Hello",
    "chatflowid": "uuid",
    "chatId": "chat_id",
    "createdDate": "2024-01-01T00:00:00Z",
    ...
  }
]
```

#### Enable Public Sharing
```http
POST /api/v1/conversations/:id/share
Content-Type: application/json
Authorization: Bearer <token>

{
  "password": "optional_password",
  "expiresAt": "2024-12-31T23:59:59Z" // optional
}

Response: 200 OK
{
  "shareToken": "random_token_64_chars",
  "shareUrl": "https://flowise.example.com/shared/random_token_64_chars"
}
```

#### Disable Public Sharing
```http
DELETE /api/v1/conversations/:id/share
Authorization: Bearer <token>

Response: 204 No Content
```

### Public Endpoints (No Authentication)

#### Get Public Conversation
```http
GET /api/v1/public-conversations/:shareToken

Response: 200 OK
{
  "id": "uuid",
  "title": "Shared Conversation",
  "chatflowId": "uuid",
  "chatId": "chat_id",
  "messageCount": 10,
  "lastMessageAt": "2024-01-01T00:00:00Z",
  "hasPassword": false,
  "chatflow": {
    "name": "My Chatflow",
    "type": "CHATFLOW"
  }
}
```

#### Get Public Conversation Messages
```http
GET /api/v1/public-conversations/:shareToken/messages?page=1&pageSize=50

Response: 200 OK
[
  {
    "id": "uuid",
    "role": "userMessage",
    "content": "Hello",
    ...
  }
]
```

#### Verify Share Password
```http
POST /api/v1/public-conversations/:shareToken/verify
Content-Type: application/json

{
  "password": "user_provided_password"
}

Response: 200 OK
{
  "valid": true
}

Response: 401 Unauthorized (if invalid)
{
  "message": "Invalid password"
}
```

## Security Features

### Password Protection
- Passwords are hashed using PBKDF2 with SHA-512
- Salt is randomly generated for each password
- Format: `salt:hash` stored in database

### Share Token Generation
- Uses cryptographically secure random bytes
- 32 bytes = 64 hex characters
- Unique index prevents collisions

### Access Control
- Workspace isolation for authenticated endpoints
- User can only access conversations in their workspace
- Public endpoints validate share token and expiration

### Data Privacy
- Public endpoints return limited conversation data
- Sensitive fields (userId, workspaceId) not exposed
- Messages returned without modification tracking

## Database Indexes

### Conversation Table
- `id` (primary key)
- `chatflowId` (for filtering by chatflow)
- `chatId` (unique, for message lookup)
- `workspaceId` (for workspace isolation)
- `userId` (for user-specific queries)
- `shareToken` (unique, for public access)
- `lastMessageAt` (for time-based sorting/grouping)

### ChatMessage Table
- `id` (primary key)
- `chatflowid` (existing)
- `chatId` (NEW - for conversation lookup)
- `sessionId` (NEW - for session tracking)

## Integration Points

### Chat Message Creation
When a new message is created, the service should:
1. Check if conversation exists for the `chatId`
2. If not, create a new conversation automatically
3. Call `conversationsService.updateConversationMetadata(chatId)` to update counts

### Chatflow Selection
- The chatflow selector should filter based on user permissions
- Use existing permission checks: `chatflows:view`, `agentflows:view`
- Support all chatflow types: CHATFLOW, AGENTFLOW, MULTIAGENT, ASSISTANT

### File Uploads
- File uploads remain in ChatMessage entity
- Conversation tracks total message count including file uploads

## Performance Considerations

### Pagination
- Default page size: 50 conversations
- Maximum recommended: 100 conversations per request
- Use cursor-based pagination for very large datasets (future enhancement)

### Caching Strategy
- Consider caching conversation list for active users
- Invalidate cache on conversation create/update/delete
- Cache public conversations with share token key

### Query Optimization
- All frequently queried fields have indexes
- Use `findAndCount` for pagination with total count
- Limit message retrieval with pagination

## Future Enhancements

### Phase 2
1. **Conversation Search**: Full-text search across messages
2. **Tags/Labels**: Categorize conversations
3. **Favorites**: Star important conversations
4. **Export**: Download conversations in multiple formats
5. **Analytics**: Track conversation metrics
6. **Real-time Updates**: WebSocket support for live updates
7. **Collaborative Access**: Share with specific users/teams
8. **Message Threading**: Branch conversations

### Performance
1. **Cursor-based Pagination**: For infinite scroll
2. **Message Caching**: Redis cache for recent messages
3. **Read Replicas**: Separate read/write databases
4. **CDN**: Cache public conversation data

## Error Handling

All endpoints return standard HTTP status codes:
- `200 OK`: Success
- `201 Created`: Resource created
- `204 No Content`: Success with no response body
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error response format:
```json
{
  "message": "Error description",
  "statusCode": 400
}
```

## Testing Recommendations

### Unit Tests
- Service layer functions with mocked repositories
- Password hashing and verification
- Share token generation uniqueness

### Integration Tests
- Full CRUD operations
- Public sharing workflow
- Password-protected shares
- Message retrieval with pagination

### E2E Tests
- Create conversation → Add messages → Share → Access publicly
- Delete conversation cascade (messages deleted)
- Expired share link rejection
- Workspace isolation verification

## Migration Guide

### Database Migration
Run the following migration to create the Conversation table:
```sql
CREATE TABLE conversation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    chatflowId UUID NOT NULL,
    chatId VARCHAR UNIQUE NOT NULL,
    workspaceId TEXT NOT NULL,
    userId UUID,
    isPublic BOOLEAN DEFAULT FALSE,
    shareToken VARCHAR UNIQUE,
    sharePassword TEXT,
    shareExpiresAt TIMESTAMP,
    lastMessageAt TIMESTAMP,
    messageCount INTEGER DEFAULT 0,
    createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversation_chatflowId ON conversation(chatflowId);
CREATE INDEX idx_conversation_chatId ON conversation(chatId);
CREATE INDEX idx_conversation_workspaceId ON conversation(workspaceId);
CREATE INDEX idx_conversation_userId ON conversation(userId);
CREATE INDEX idx_conversation_shareToken ON conversation(shareToken);
CREATE INDEX idx_conversation_lastMessageAt ON conversation(lastMessageAt);

-- Add indexes to ChatMessage
CREATE INDEX idx_chatmessage_chatId ON chat_message(chatId);
CREATE INDEX idx_chatmessage_sessionId ON chat_message(sessionId);
```

### Backward Compatibility
- Existing chat messages continue to work
- Conversations created automatically when messages are sent
- No breaking changes to existing APIs
