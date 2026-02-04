# Comprehensive Requirements: Chatbot Feature
# 1. Overview
The Chatbot feature provides users with a unified interface to interact with any chatflow or agentflow in Flowise. It enables users to have conversations, view conversation history, and share conversations publicly.

# 2. User Stories
Core User Stories
US-1: As a user, I want to select a chatflow/agentflow to start a conversation, so that I can interact with my AI assistants
US-2: As a user, I want to view my conversation history organized by time periods, so that I can easily find and continue previous conversations
US-3: As a user, I want to share my conversations publicly via a shareable link, so that others can view the conversation without logging in
US-4: As a user, I want to upload files during conversations, so that I can provide context to the chatbot
US-5: As a user, I want to switch between different chatflows within the same session, so that I can use different AI assistants for different tasks

# 3. Functional Requirements
## 3.1 Chatflow Selection
FR-1.1: System shall display a dropdown list of all available chatflows and agentflows the user has permission to access
FR-1.2: System shall filter chatflows based on user's chatflows:view and agentflows:view permissions
FR-1.3: System shall allow users to switch between chatflows during a session
FR-1.4: System shall support all chatflow types: CHATFLOW, AGENTFLOW, MULTIAGENT, ASSISTANT
## 3.2 Conversation Management
FR-2.1: System shall create a new conversation when user sends the first message
FR-2.2: System shall generate unique chatId for each conversation
FR-2.3: System shall generate unique sessionId for tracking conversation context
FR-2.4: System shall store all messages with metadata (role, content, timestamp, chatflowId, executionId)
FR-2.5: System shall support message types: user, assistant, system
FR-2.6: System shall preserve conversation context across page refreshes
## 3.3 Chat History
FR-3.1: System shall display conversations grouped by:
Today
Last 7 Days
Previous 30 Days
FR-3.2: System shall show conversation title (auto-generated or user-defined)
FR-3.3: System shall display timestamp for each conversation
FR-3.4: System shall allow users to click on a conversation to load it
FR-3.5: System shall provide "Clear chat history" functionality
FR-3.6: System shall support pagination for large conversation lists
FR-3.7: System shall allow users to delete individual conversations
FR-3.8: System shall allow users to rename conversations
## 3.4 Message Features
FR-4.1: System shall display messages in chronological order
FR-4.2: System shall show user messages aligned to the right
FR-4.3: System shall show assistant messages aligned to the left
FR-4.4: System shall display timestamps for each message
FR-4.5: System shall support markdown rendering in messages
FR-4.6: System shall display source documents when available
FR-4.7: System shall display used tools when available
FR-4.8: System shall display agent reasoning when available
FR-4.9: System shall display file annotations when available
FR-4.10: System shall display artifacts when available
FR-4.11: System shall support follow-up prompts display
FR-4.12: System shall link messages to their corresponding executions
## 3.5 File Upload
FR-5.1: System shall provide file upload button in chat interface
FR-5.2: System shall validate file types based on chatflow configuration
FR-5.3: System shall display file upload progress
FR-5.4: System shall show uploaded files in the message
FR-5.5: System shall store file upload metadata in fileUploads field
## 3.6 Public Sharing
FR-6.1: System shall generate a unique shareable URL for each conversation
FR-6.2: System shall allow users to enable/disable public sharing per conversation
FR-6.3: System shall display conversations in read-only mode when accessed via public link
FR-6.4: System shall not require authentication for public shared conversations
FR-6.5: System shall allow conversation owners to revoke public sharing
FR-6.6: System shall track when a conversation was last shared
FR-6.7: System shall optionally support password protection for shared conversations
FR-6.8: System shall optionally support expiration dates for shared links
## 4. Non-Functional Requirements
### 4.1 Performance
NFR-1.1: Chat messages shall load within 500ms
NFR-1.2: Message sending shall provide immediate UI feedback
NFR-1.3: Conversation history shall support infinite scroll for smooth UX
NFR-1.4: File uploads up to 10MB shall complete within 5 seconds
### 4.2 Scalability
NFR-2.1: System shall support up to 1000 conversations per user
NFR-2.2: System shall support conversations with up to 10,000 messages
NFR-2.3: System shall efficiently query conversation history using database indexes
### 4.3 Usability
NFR-3.1: Interface shall be responsive and work on mobile, tablet, and desktop
NFR-3.2: Chat input shall support keyboard shortcuts (Enter to send, Shift+Enter for new line)
NFR-3.3: Interface shall provide clear loading states
NFR-3.4: Interface shall provide error messages for failed operations
### 4.4 Reliability
NFR-4.1: System shall handle network interruptions gracefully
NFR-4.2: System shall retry failed message sends with exponential backoff
NFR-4.3: System shall preserve unsent messages in local storage
## 5. Data Model Requirements
### 5.1 ChatMessage Entity Extensions
```entity: ChatMessage (extends)
- id: UUID (PK)
- role: MessageType
- chatflowid: UUID (indexed)
- executionId: UUID (optional, with relation to Execution)
- content: text
- sourceDocuments: text (optional)
- usedTools: text (optional)
- fileAnnotations: text (optional)
- agentReasoning: text (optional)
- fileUploads: text (optional)
- artifacts: text (optional)
- action: text (optional)
- chatType: string
- chatId: string (indexed)
- memoryType: string (optional)
- sessionId: string (indexed, optional)
- createdDate: timestamp
- leadEmail: text (optional)
- followUpPrompts: text (optional)
```


### 5.2 New Conversation Entity
```entity: Conversation (new)
- id: UUID (PK)
- title: string
- chatflowId: UUID (FK to ChatFlow)
- chatId: string (indexed, unique)
- workspaceId: UUID
- userId: UUID (FK to User)
- isPublic: boolean (default: false)
- shareToken: string (unique, optional)
- sharePassword: string (hashed, optional)
- shareExpiresAt: timestamp (optional)
- lastMessageAt: timestamp
- messageCount: integer
- createdDate: timestamp
- updatedDate: timestamp
```

## 6. API Requirements
### 6.1 Conversation APIs
POST /api/v1/chatbot/conversations - Create new conversation
GET /api/v1/chatbot/conversations - List user's conversations
GET /api/v1/chatbot/conversations/:id - Get conversation details
PATCH /api/v1/chatbot/conversations/:id - Update conversation (rename, etc.)
DELETE /api/v1/chatbot/conversations/:id - Delete conversation
DELETE /api/v1/chatbot/conversations - Clear all conversations
### 6.2 Message APIs
POST /api/v1/chatbot/conversations/:id/messages - Send message
GET /api/v1/chatbot/conversations/:id/messages - Get conversation messages
GET /api/v1/chatbot/messages/:id - Get specific message details
### 6.3 Sharing APIs
POST /api/v1/chatbot/conversations/:id/share - Enable public sharing
DELETE /api/v1/chatbot/conversations/:id/share - Disable public sharing
GET /api/v1/public/conversations/:shareToken - Get public conversation
POST /api/v1/public/conversations/:shareToken/verify - Verify password (if protected)
### 6.4 File Upload APIs
POST /api/v1/chatbot/conversations/:id/upload - Upload file to conversation

## 7. Security & Permissions
### 7.1 Authentication & Authorization
SEC-1.1: Only authenticated users can create conversations
SEC-1.2: Users can only access conversations in their workspace
SEC-1.3: Chatflow selection respects existing permission system
SEC-1.4: Public shared conversations are read-only
SEC-1.5: Share tokens shall be cryptographically secure (min 32 characters)
### 7.2 Data Privacy
SEC-2.1: Sensitive data in shared conversations shall be redacted based on chatflow settings
SEC-2.2: System shall log all public share enable/disable actions
SEC-2.3: Users shall be warned before making conversations public

## 8. UI/UX Requirements
### 8.1 Layout
Left sidebar: Conversation history (200-300px width, collapsible)
Main area: Active conversation
Top bar: Chatflow selector, share button, settings
### 8.2 Conversation History Panel
Search/filter conversations
Group by time periods
Show conversation preview (first message or title)
Highlight active conversation
"New conversation" button
### 8.3 Chat Interface
Message input with auto-resize
File attachment button
Send button
Typing indicators
Message status indicators (sending, sent, error)
Scroll to bottom button (when not at bottom)
### 8.4 Share Dialog
Toggle public sharing
Display shareable link with copy button
Optional password protection toggle
Optional expiration date picker
Warning about data privacy

## 9. Future Enhancements
### 9.1 Phase 2 Features
FE-1: Export conversations (PDF, Markdown, JSON)
FE-2: Search within conversations
FE-3: Conversation tags/labels
FE-4: Favorite/starred conversations
FE-5: Collaborative conversations (multiple users)
FE-6: Conversation templates
FE-7: Voice input/output integration
FE-8: Message editing and regeneration
FE-9: Conversation branching
FE-10: Analytics dashboard for conversation metrics

### 9.2 Advanced Sharing
FE-11: Share with specific users/teams
FE-12: Embed conversations in external websites
FE-13: Share individual message threads

## 10. Success Metrics
User engagement: Average conversations per user per week
Feature adoption: Percentage of users using chatbot feature
Sharing usage: Percentage of conversations shared publicly
Performance: 95th percentile message send latency < 1s
Reliability: Message delivery success rate > 99.9%