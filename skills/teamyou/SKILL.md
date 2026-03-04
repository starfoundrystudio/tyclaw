---
name: "teamyou"
description: "Access the TeamYou API to manage knowledge topics, details, todos, heartbeat actions, and scheduled actions. Use when the user wants to store, retrieve, search, organize, or automate workflows in TeamYou."
metadata:
  {
    "openclaw":
      {
        "homepage": "https://teamyou.ai",
        "os": ["darwin", "linux"],
        "primaryEnv": "TEAMYOU_API_KEY",
        "requires": { "bins": ["bash", "curl", "jq"] },
      },
  }
---

# TeamYou API Skill

TeamYou is an AI-powered knowledge management platform. This skill provides access to topics (knowledge containers), details (atomic facts), semantic search, todo management, and durable routines via heartbeat/scheduled actions.

## Quick Start

**Setup API key** (one-time):

```bash
# Option 1: Environment variable
export TEAMYOU_API_KEY="ty_your_api_key_here"

# Option 2: Config file
echo "ty_your_api_key_here" > ~/.teamyou_key
```

**Common operations:**

```bash
# List all topics
scripts/teamyou.sh topics-list

# Create a topic
scripts/teamyou.sh topics-create "Italian Cooking" "Recipes and techniques from Italy"

# Add details to a topic
scripts/teamyou.sh details-add TOPIC_ID "Pasta should be cooked al dente" "Use San Marzano tomatoes"

# Search topics
scripts/teamyou.sh search-topics "cooking recipes" medium

# Create a todo
scripts/teamyou.sh todos-create "Buy groceries" --priority high --due-date "2026-02-01T00:00:00Z"

# List todos
scripts/teamyou.sh todos-list --status todo --priority high

# Create heartbeat action (runs in recurring heartbeat workflow)
scripts/teamyou.sh heartbeat-actions-create "Daily OpenClaw review" \
  --action-type openclaw_command \
  --config-json '{"agentId":"main","prompt":"Review today\\u0027s high-priority todos"}'

# Create scheduled action (runs even if sprite is not always awake)
scripts/teamyou.sh scheduled-actions-create "Weekday routine" \
  --schedule-type cron \
  --cron-expr "0 9 * * 1-5" \
  --timezone "America/New_York" \
  --action-type check_todos
```

## Core Concepts

**Topics**: Knowledge containers with name, description, and summary. Each topic can have many details.

**Details**: Atomic facts stored in topics. Each detail is automatically embedded for semantic search.

**Search**: Semantic search across topics or details using natural language queries.

**Todos**: Task management with priorities, due dates, status tracking, and archiving.

**Heartbeat**: User-level recurring workflow with configurable frequency and ordered actions.

**Scheduled Actions**: One-time or cron-based routines with independent lifecycle and execution history.

**Precision levels** (for search):

- `high` - More relevant results, fewer matches (threshold: 0.5)
- `medium` - Balanced relevance and coverage (threshold: 0.3)
- `low` - More matches, may include less relevant (threshold: 0.1)

## Best Practices

1. **Search before creating**: Use semantic search to find existing topics before creating duplicates

2. **Atomic details**: Add facts as individual detail items, not large blocks of text

   ```bash
   # Good: Multiple atomic details
   scripts/teamyou.sh details-add TOPIC_ID "Pasta al dente means firm to bite" "Boil for 8-10 minutes"

   # Bad: One large blob
   scripts/teamyou.sh details-add TOPIC_ID "Pasta al dente means firm... [wall of text]"
   ```

3. **Batch details**: Add multiple details at once to reduce API calls (up to 50 at a time)

4. **Meaningful topics**: Group related information under clear, descriptive topic names

5. **Handle rate limits**: The script exits on 429 errors. Implement retry logic with exponential backoff if needed.

## API Reference

For complete API documentation including:

- All endpoints and parameters
- Request/response formats
- Rate limits
- Error handling

See [API_REFERENCE.md](references/API_REFERENCE.md)

## Script Usage

The `scripts/teamyou.sh` helper provides a CLI interface to all TeamYou API operations. It handles authentication and outputs JSON results.

**Requirements**: `jq` for JSON processing

### Topics

```bash
# List all topics
teamyou.sh topics-list

# Create topic
teamyou.sh topics-create "NAME" "DESCRIPTION" [--summary "SUMMARY"]

# Get topic with all details
teamyou.sh topics-get TOPIC_ID
```

> **Note**: Topic updates and deletions must be done through the TeamYou interface.

### Details

```bash
# List details for a topic
teamyou.sh details-list TOPIC_ID

# Add details (batch)
teamyou.sh details-add TOPIC_ID "Detail 1" "Detail 2" "Detail 3"
```

> **Note**: Detail updates and deletions must be done through the TeamYou interface.

### Search

```bash
# Search topics
teamyou.sh search-topics "QUERY" [low|medium|high]

# Search details
teamyou.sh search-details "QUERY" [low|medium|high]
```

### Todos

```bash
# List todos with filters
teamyou.sh todos-list [--status todo|done] [--archived] [--priority high|medium|low|none] [--order-by createdAt|updatedAt|dueDate|priority] [--limit 100]

# Create todo
teamyou.sh todos-create "TITLE" [--description "DESC"] [--priority high|medium|low|none] [--due-date "2026-02-01T00:00:00Z"]

# Get todo
teamyou.sh todos-get TODO_ID

# Update todo
teamyou.sh todos-update TODO_ID [--title "TITLE"] [--description "DESC"] [--status todo|done] [--priority PRIORITY] [--due-date "DATE"] [--archived]

# Delete todo
teamyou.sh todos-delete TODO_ID

# Complete todo (shortcut for marking done)
teamyou.sh todos-complete TODO_ID
```

### Heartbeat

```bash
# Get heartbeat config
teamyou.sh heartbeat-get

# Configure heartbeat
teamyou.sh heartbeat-config --status active --frequency-minutes 30

# Start/stop/trigger heartbeat
teamyou.sh heartbeat-start
teamyou.sh heartbeat-stop
teamyou.sh heartbeat-trigger

# Heartbeat execution history
teamyou.sh heartbeat-history --limit 20 --offset 0
```

### Heartbeat Actions

```bash
# List heartbeat actions
teamyou.sh heartbeat-actions-list

# Create action (supported types: check_todos, openclaw_command, custom_webhook)
teamyou.sh heartbeat-actions-create "OpenClaw morning review" \
  --action-type openclaw_command \
  --config-json '{"agentId":"main","prompt":"Review due-soon todos"}'

# Update action
teamyou.sh heartbeat-actions-update ACTION_ID \
  --priority 10 \
  --enabled

# Delete action
teamyou.sh heartbeat-actions-delete ACTION_ID
```

> **Note**: `execute_routine` is intentionally unavailable via this external skill release.

### Scheduled Actions

```bash
# List scheduled actions
teamyou.sh scheduled-actions-list

# Create cron action
teamyou.sh scheduled-actions-create "Weekday check" \
  --schedule-type cron \
  --cron-expr "0 9 * * 1-5" \
  --timezone "America/New_York" \
  --action-type check_todos

# Create one-time action
teamyou.sh scheduled-actions-create "One-off OpenClaw run" \
  --schedule-type one_time \
  --run-at "2026-03-01T17:00:00Z" \
  --action-type openclaw_command \
  --config-json '{"agentId":"main","prompt":"Prepare end-of-day summary"}'

# Get/update/pause/resume/history/delete
teamyou.sh scheduled-actions-get ACTION_ID
teamyou.sh scheduled-actions-update ACTION_ID --status paused
teamyou.sh scheduled-actions-pause ACTION_ID
teamyou.sh scheduled-actions-resume ACTION_ID
teamyou.sh scheduled-actions-history ACTION_ID --limit 20 --offset 0
teamyou.sh scheduled-actions-delete ACTION_ID
```

## Rate Limits

| Endpoint Type           | Requests/Minute | Requests/Hour |
| ----------------------- | --------------- | ------------- |
| Read (GET)              | 100             | 1000          |
| Write (POST/PUT/DELETE) | 60              | 1000          |
| Search (AI)             | 30              | 1000          |

The API returns rate limit headers:

- `X-RateLimit-Limit`: Maximum requests in window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Seconds until reset

## Direct API Usage

For operations not covered by the script, use curl with Bearer token:

```bash
curl https://app.teamyou.ai/api/external/v1/topics \
  -H "Authorization: Bearer ty_your_api_key" \
  -H "Content-Type: application/json"
```

See [API_REFERENCE.md](references/API_REFERENCE.md) for complete endpoint documentation.

## Common Workflows

### Capturing Information

```bash
# 1. Search for existing topic
scripts/teamyou.sh search-topics "cooking Italian"

# 2. If not found, create topic
TOPIC_ID=$(scripts/teamyou.sh topics-create "Italian Cooking" "Traditional Italian recipes" | jq -r '.topic.id')

# 3. Add details (batch)
scripts/teamyou.sh details-add "$TOPIC_ID" \
  "Pasta al dente: firm to bite" \
  "San Marzano tomatoes for best sauce" \
  "Salt pasta water generously"
```

### Finding Information

```bash
# Search across all details
scripts/teamyou.sh search-details "grandmother's recipe" high

# Search for topics
scripts/teamyou.sh search-topics "Italian food" medium

# Get all details from a topic
scripts/teamyou.sh topics-get TOPIC_ID | jq '.topic.details'
```

### Managing Todos

```bash
# Get today's high-priority todos
scripts/teamyou.sh todos-list --status todo --priority high --order-by dueDate

# Create todo with due date
scripts/teamyou.sh todos-create "Review PR" \
  --description "Check TeamYou API skill PR" \
  --priority high \
  --due-date "2026-01-31T17:00:00Z"

# Complete and archive
scripts/teamyou.sh todos-complete TODO_ID
scripts/teamyou.sh todos-update TODO_ID --archived
```

### Managing Durable Routines

```bash
# Ensure heartbeat exists and is active
scripts/teamyou.sh heartbeat-config --status active --frequency-minutes 30

# Add recurring heartbeat action
scripts/teamyou.sh heartbeat-actions-create "Daily planning run" \
  --action-type openclaw_command \
  --config-json '{"agentId":"main","prompt":"Plan today from due todos and topic priorities"}'

# Add a weekday scheduled routine
scripts/teamyou.sh scheduled-actions-create "Weekday todo check" \
  --schedule-type cron \
  --cron-expr "0 9 * * 1-5" \
  --timezone "America/New_York" \
  --action-type check_todos

# Inspect execution history
scripts/teamyou.sh heartbeat-history --limit 10
scripts/teamyou.sh scheduled-actions-history ACTION_ID --limit 10
```
