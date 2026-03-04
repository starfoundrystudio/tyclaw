# TeamYou API Reference

Complete REST API documentation for TeamYou.

## Table of Contents

- [Authentication](#authentication)
- [Base URL](#base-url)
- [Topics API](#topics-api)
- [Details API](#details-api)
- [Search API](#search-api)
- [Todos API](#todos-api)
- [Heartbeat API](#heartbeat-api)
- [Scheduled Actions API](#scheduled-actions-api)
- [Rate Limits](#rate-limits)
- [Error Responses](#error-responses)

## Authentication

All API requests require an API key in the Authorization header:

```http
Authorization: Bearer ty_<your-api-key>
```

Users generate API keys at: `https://teamyou.com/settings`

## Base URL

```
https://teamyou.com/api/external/v1
```

## Topics API

### List Topics

```http
GET /topics
```

Returns all topics for the authenticated user, sorted by most recently updated.

**Response:**

```json
{
  "topics": [
    {
      "id": "abc123",
      "name": "Italian Cooking",
      "oneSentenceDescription": "Recipes and techniques from Italy",
      "summary": "A collection of traditional Italian recipes...",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

### Create Topic

```http
POST /topics
Content-Type: application/json

{
  "name": "Italian Cooking",
  "oneSentenceDescription": "Recipes and techniques from Italy",
  "summary": "Optional longer summary"
}
```

**Response (201 Created):**

```json
{
  "topic": {
    "id": "abc123",
    "name": "Italian Cooking",
    "oneSentenceDescription": "Recipes and techniques from Italy",
    "summary": "",
    "createdAt": "2025-01-20T00:00:00Z",
    "updatedAt": "2025-01-20T00:00:00Z"
  }
}
```

### Get Topic with Details

```http
GET /topics/{topicId}
```

Returns a single topic with all its details.

**Response:**

```json
{
  "topic": {
    "id": "abc123",
    "name": "Italian Cooking",
    "oneSentenceDescription": "Recipes and techniques from Italy",
    "summary": "...",
    "details": [
      {
        "id": "detail1",
        "detail": "Pasta should be cooked al dente",
        "createdAt": "2025-01-15T00:00:00Z"
      }
    ]
  }
}
```

### Update Topic

> **Disabled**: Topic updates are not available via the external API. Please use the TeamYou interface.

### Delete Topic

> **Disabled**: Topic deletion is not available via the external API. Please use the TeamYou interface.

## Details API

### List Details

```http
GET /topics/{topicId}/details
```

Returns all details for a specific topic.

### Add Details (Batch)

```http
POST /topics/{topicId}/details
Content-Type: application/json

{
  "details": [
    {
      "detail": "Pasta should be cooked al dente"
    },
    {
      "detail": "Fresh tomatoes make the best sauce"
    }
  ]
}
```

Adds up to 50 details at once. Each detail automatically gets an embedding for semantic search.

**Response (201 Created):**

```json
{
  "details": [
    {
      "id": "detail1",
      "detail": "Pasta should be cooked al dente",
      "createdAt": "2025-01-15T00:00:00Z"
    },
    {
      "id": "detail2",
      "detail": "Fresh tomatoes make the best sauce",
      "createdAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

### Update Detail

> **Disabled**: Detail updates are not available via the external API. Please use the TeamYou interface.

### Delete Detail

> **Disabled**: Detail deletion is not available via the external API. Please use the TeamYou interface.

## Search API

### Search Topics (Semantic)

```http
POST /search/topics
Content-Type: application/json

{
  "query": "cooking recipes Italian",
  "precision": "medium"
}
```

**Precision levels:**

- `high` - More relevant results, fewer matches (threshold: 0.5)
- `medium` - Balanced relevance and coverage (threshold: 0.3)
- `low` - More matches, may include less relevant results (threshold: 0.1)

**Response:**

```json
{
  "results": [
    {
      "id": "abc123",
      "name": "Italian Cooking",
      "oneSentenceDescription": "...",
      "summary": "...",
      "similarity": 0.85,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

### Search Details (Semantic)

```http
POST /search/details
Content-Type: application/json

{
  "query": "grandmother's pasta recipe",
  "precision": "medium"
}
```

**Response:**

```json
{
  "results": [
    {
      "id": "detail1",
      "topicId": "abc123",
      "topicName": "Italian Cooking",
      "detail": "Grandma's pasta sauce recipe uses fresh tomatoes...",
      "similarity": 0.78,
      "createdAt": "2025-01-10T00:00:00Z",
      "updatedAt": "2025-01-10T00:00:00Z"
    }
  ]
}
```

## Todos API

### List Todos

```http
GET /todos?status=todo&archived=false&priority=high&orderBy=dueDate&limit=50
```

**Query Parameters:**

- `status`: `todo` | `done`
- `archived`: `true` | `false`
- `priority`: `high` | `medium` | `low` | `none`
- `orderBy`: `createdAt` | `updatedAt` | `dueDate` | `priority`
- `orderDirection`: `asc` | `desc`
- `limit`: 1-100 (default: 100)

**Response:**

```json
{
  "todos": [
    {
      "id": "todo1",
      "title": "Buy groceries",
      "description": "Milk, eggs, bread",
      "status": "todo",
      "priority": "high",
      "dueDate": "2025-02-01T00:00:00Z",
      "isArchived": false,
      "createdAt": "2025-01-20T00:00:00Z"
    }
  ]
}
```

### Create Todo

```http
POST /todos
Content-Type: application/json

{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "priority": "high",
  "dueDate": "2025-02-01T00:00:00Z"
}
```

### Get Todo

```http
GET /todos/{todoId}
```

### Update Todo

```http
PUT /todos/{todoId}
Content-Type: application/json

{
  "title": "Updated title",
  "status": "done",
  "priority": "medium",
  "dueDate": null,
  "isArchived": false
}
```

### Delete Todo

```http
DELETE /todos/{todoId}
```

### Complete Todo

```http
POST /todos/{todoId}/complete
```

Convenience endpoint to mark a todo as done.

## Heartbeat API

The heartbeat system powers recurring user routines. Heartbeat actions support only:

- `check_todos`
- `openclaw_command`
- `custom_webhook`

`execute_routine` is intentionally unavailable via external API.

### Get Heartbeat Config

```http
GET /heartbeat
```

### Create/Update Heartbeat Config

```http
POST /heartbeat
Content-Type: application/json

{
  "status": "active",
  "frequencyMinutes": 30
}
```

### Disable Heartbeat

```http
DELETE /heartbeat
```

### Start, Stop, Trigger

```http
POST /heartbeat/start
POST /heartbeat/stop
POST /heartbeat/trigger
```

### Heartbeat History

```http
GET /heartbeat/history?limit=20&offset=0
```

### List Heartbeat Actions

```http
GET /heartbeat/actions
```

### Create Heartbeat Action

```http
POST /heartbeat/actions
Content-Type: application/json

{
  "name": "Morning OpenClaw review",
  "actionType": "openclaw_command",
  "priority": 10,
  "config": {
    "agentId": "main",
    "prompt": "Review due-soon and overdue todos"
  }
}
```

If no heartbeat exists, the API auto-provisions a disabled heartbeat before creating the action.

### Update Heartbeat Action

```http
PATCH /heartbeat/actions/{actionId}
Content-Type: application/json

{
  "priority": 20,
  "isEnabled": true
}
```

### Delete Heartbeat Action

```http
DELETE /heartbeat/actions/{actionId}
```

## Scheduled Actions API

Scheduled actions are one-time or cron-based routines with independent lifecycle and history.

### List Scheduled Actions

```http
GET /scheduled-actions
```

### Create Scheduled Action (cron)

```http
POST /scheduled-actions
Content-Type: application/json

{
  "name": "Weekday todo check",
  "scheduleType": "cron",
  "cronExpr": "0 9 * * 1-5",
  "timezone": "America/New_York",
  "actionType": "check_todos",
  "status": "active",
  "actionConfig": {
    "notifyOnOverdue": true,
    "notifyOnDueSoon": true,
    "dueSoonHours": 24,
    "deliveryChannel": "in_app"
  }
}
```

### Create Scheduled Action (one_time)

```http
POST /scheduled-actions
Content-Type: application/json

{
  "name": "One-time OpenClaw summary",
  "scheduleType": "one_time",
  "runAt": "2026-03-01T17:00:00Z",
  "actionType": "openclaw_command",
  "actionConfig": {
    "agentId": "main",
    "prompt": "Summarize today's priority items"
  }
}
```

### Get Scheduled Action

```http
GET /scheduled-actions/{actionId}
```

### Update Scheduled Action

```http
PATCH /scheduled-actions/{actionId}
Content-Type: application/json

{
  "status": "paused"
}
```

### Delete Scheduled Action

```http
DELETE /scheduled-actions/{actionId}
```

### Pause / Resume Scheduled Action

```http
POST /scheduled-actions/{actionId}/pause
POST /scheduled-actions/{actionId}/resume
```

### Scheduled Action History

```http
GET /scheduled-actions/{actionId}/history?limit=20&offset=0
```

## Rate Limits

| Endpoint Type           | Requests/Minute | Requests/Hour |
| ----------------------- | --------------- | ------------- |
| Read (GET)              | 100             | 1000          |
| Write (POST/PUT/DELETE) | 60              | 1000          |
| Search (AI)             | 30              | 1000          |

Rate limit headers are included in all responses:

- `X-RateLimit-Limit`: Maximum requests in window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Seconds until reset

## Error Responses

```json
{
  "error": "Error message",
  "details": {
    "field": ["validation error"]
  }
}
```

**Status Codes:**

- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing API key)
- `404` - Not Found
- `409` - Conflict (e.g., scheduled action limit reached)
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error
