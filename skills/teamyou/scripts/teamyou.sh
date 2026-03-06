#!/bin/bash
# TeamYou API helper script
# Handles authentication and common operations with the TeamYou API

set -e

BASE_URL="${TEAMYOU_API_URL:-https://www.teamyou.com/api/external/v1}"
SUPPORTED_ACTION_TYPES=("check_todos" "openclaw_command" "custom_webhook")

# Get API key from environment or ~/.teamyou_key
get_api_key() {
  if [[ -n "$TEAMYOU_API_KEY" ]]; then
    printf '%s' "$TEAMYOU_API_KEY"
  elif [[ -f "$HOME/.teamyou_key" ]]; then
    tr -d '\n\r' < "$HOME/.teamyou_key"
  else
    echo "Error: No API key found. Set TEAMYOU_API_KEY env var or create ~/.teamyou_key" >&2
    exit 1
  fi
}

require_value() {
  local option_name=$1
  local option_value=$2
  if [[ -z "$option_value" ]]; then
    echo "Error: $option_name requires a value" >&2
    exit 1
  fi
}

validate_action_type() {
  local action_type=$1
  local supported=false

  for current in "${SUPPORTED_ACTION_TYPES[@]}"; do
    if [[ "$current" == "$action_type" ]]; then
      supported=true
      break
    fi
  done

  if [[ "$supported" != true ]]; then
    echo "Error: Unsupported action type '$action_type'. Supported: ${SUPPORTED_ACTION_TYPES[*]}" >&2
    exit 1
  fi
}

validate_config_json() {
  local raw_json=$1

  if ! echo "$raw_json" | jq -e 'if type == "object" then . else error("config must be object") end' >/dev/null 2>&1; then
    echo "Error: --config-json must be valid JSON object" >&2
    exit 1
  fi
}

# Make an authenticated API request
api_request() {
  local method=$1
  local path=$2
  local data=$3

  local api_key
  api_key=$(get_api_key)

  local curl_args=(
    -s -w "\n%{http_code}"
    -X "$method"
    "$BASE_URL$path"
    -H "Authorization: Bearer $api_key"
    -H "Content-Type: application/json"
  )

  if [[ -n "$data" ]]; then
    curl_args+=(-d "$data")
  fi

  local response
  response=$(curl "${curl_args[@]}")

  local http_code
  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" -ge 400 ]]; then
    echo "$body" | jq -r '.error // .' >&2
    exit 1
  fi

  echo "$body"
}

# Topics
topics_list() {
  api_request GET /topics
}

topics_create() {
  local name="" description="" summary=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --summary) summary=$2; shift 2 ;;
      *)
        if [[ -z "$name" ]]; then
          name=$1; shift
        elif [[ -z "$description" ]]; then
          description=$1; shift
        else
          echo "Unknown option: $1" >&2; exit 1
        fi
        ;;
    esac
  done

  local data
  data=$(jq -n \
    --arg name "$name" \
    --arg desc "$description" \
    --arg summary "$summary" \
    '{name: $name, oneSentenceDescription: $desc}
    | if $summary != "" then . + {summary: $summary} else . end')

  api_request POST /topics "$data"
}

topics_get() {
  local topic_id=$1
  api_request GET "/topics/$topic_id"
}

# Details
details_list() {
  local topic_id=$1
  api_request GET "/topics/$topic_id/details"
}

details_add() {
  local topic_id=$1
  shift
  local details=("$@")

  local data
  data=$(jq -n --args '$ARGS.positional | map({detail: .})' "${details[@]}" | jq '{details: .}')

  api_request POST "/topics/$topic_id/details" "$data"
}

# Search
search_topics() {
  local query=$1
  local precision=${2:-medium}

  local data
  data=$(jq -n --arg query "$query" --arg precision "$precision" '{query: $query, precision: $precision}')

  api_request POST /search/topics "$data"
}

search_details() {
  local query=$1
  local precision=${2:-medium}

  local data
  data=$(jq -n --arg query "$query" --arg precision "$precision" '{query: $query, precision: $precision}')

  api_request POST /search/details "$data"
}

# Todos
todos_list() {
  local params=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --status) params="${params}&status=$2"; shift 2 ;;
      --archived) params="${params}&archived=true"; shift ;;
      --priority) params="${params}&priority=$2"; shift 2 ;;
      --order-by) params="${params}&orderBy=$2"; shift 2 ;;
      --limit) params="${params}&limit=$2"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  params="${params#&}"
  if [[ -n "$params" ]]; then
    params="?$params"
  fi

  api_request GET "/todos$params"
}

todos_create() {
  local title=$1
  shift

  local description="" priority="" due_date=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --description) description=$2; shift 2 ;;
      --priority) priority=$2; shift 2 ;;
      --due-date) due_date=$2; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  local data
  data=$(jq -n \
    --arg title "$title" \
    --arg desc "$description" \
    --arg priority "$priority" \
    --arg due "$due_date" \
    '{title: $title}
    | if $desc != "" then . + {description: $desc} else . end
    | if $priority != "" then . + {priority: $priority} else . end
    | if $due != "" then . + {dueDate: $due} else . end')

  api_request POST /todos "$data"
}

todos_get() {
  local todo_id=$1
  api_request GET "/todos/$todo_id"
}

todos_update() {
  local todo_id=$1
  shift

  local title="" description="" status="" priority="" due_date="" archived=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --title) title=$2; shift 2 ;;
      --description) description=$2; shift 2 ;;
      --status) status=$2; shift 2 ;;
      --priority) priority=$2; shift 2 ;;
      --due-date) due_date=$2; shift 2 ;;
      --archived) archived="true"; shift ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  local data
  data=$(jq -n \
    --arg title "$title" \
    --arg desc "$description" \
    --arg status "$status" \
    --arg priority "$priority" \
    --arg due "$due_date" \
    --arg archived "$archived" \
    '{}
    | if $title != "" then . + {title: $title} else . end
    | if $desc != "" then . + {description: $desc} else . end
    | if $status != "" then . + {status: $status} else . end
    | if $priority != "" then . + {priority: $priority} else . end
    | if $due != "" then . + {dueDate: $due} else . end
    | if $archived == "true" then . + {isArchived: true} else . end')

  api_request PUT "/todos/$todo_id" "$data"
}

todos_delete() {
  local todo_id=$1
  api_request DELETE "/todos/$todo_id"
}

todos_complete() {
  local todo_id=$1
  api_request POST "/todos/$todo_id/complete"
}

# Heartbeat
heartbeat_get() {
  api_request GET /heartbeat
}

heartbeat_config() {
  local status=""
  local frequency_minutes=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --status) status=$2; shift 2 ;;
      --frequency-minutes) frequency_minutes=$2; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  if [[ -z "$status" && -z "$frequency_minutes" ]]; then
    echo "Error: Provide at least one of --status or --frequency-minutes" >&2
    exit 1
  fi

  local data
  data=$(jq -n \
    --arg status "$status" \
    --arg frequency "$frequency_minutes" \
    '{}
    | if $status != "" then . + {status: $status} else . end
    | if $frequency != "" then . + {frequencyMinutes: ($frequency | tonumber)} else . end')

  api_request POST /heartbeat "$data"
}

heartbeat_delete() {
  api_request DELETE /heartbeat
}

heartbeat_start() {
  api_request POST /heartbeat/start
}

heartbeat_stop() {
  api_request POST /heartbeat/stop
}

heartbeat_trigger() {
  api_request POST /heartbeat/trigger
}

heartbeat_history() {
  local params=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --limit) params="${params}&limit=$2"; shift 2 ;;
      --offset) params="${params}&offset=$2"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  params="${params#&}"
  if [[ -n "$params" ]]; then
    params="?$params"
  fi

  api_request GET "/heartbeat/history$params"
}

heartbeat_actions_list() {
  api_request GET /heartbeat/actions
}

heartbeat_actions_create() {
  local name=""
  local heartbeat_id=""
  local action_type=""
  local description=""
  local priority=""
  local is_enabled=""
  local config_json=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --heartbeat-id) heartbeat_id=$2; shift 2 ;;
      --action-type) action_type=$2; shift 2 ;;
      --description) description=$2; shift 2 ;;
      --priority) priority=$2; shift 2 ;;
      --disabled) is_enabled="false"; shift ;;
      --config-json) config_json=$2; shift 2 ;;
      *)
        if [[ -z "$name" ]]; then
          name=$1
          shift
        else
          echo "Unknown option: $1" >&2
          exit 1
        fi
        ;;
    esac
  done

  require_value "name" "$name"
  require_value "--action-type" "$action_type"
  validate_action_type "$action_type"

  local data
  data=$(jq -n --arg name "$name" --arg actionType "$action_type" '{name: $name, actionType: $actionType}')

  if [[ -n "$heartbeat_id" ]]; then
    data=$(echo "$data" | jq --arg heartbeatId "$heartbeat_id" '. + {heartbeatId: $heartbeatId}')
  fi

  if [[ -n "$description" ]]; then
    data=$(echo "$data" | jq --arg description "$description" '. + {description: $description}')
  fi

  if [[ -n "$priority" ]]; then
    data=$(echo "$data" | jq --arg priority "$priority" '. + {priority: ($priority | tonumber)}')
  fi

  if [[ -n "$is_enabled" ]]; then
    data=$(echo "$data" | jq '. + {isEnabled: false}')
  fi

  if [[ -n "$config_json" ]]; then
    validate_config_json "$config_json"
    data=$(echo "$data" | jq --argjson config "$config_json" '. + {config: $config}')
  fi

  api_request POST /heartbeat/actions "$data"
}

heartbeat_actions_update() {
  local action_id=$1
  shift

  local name=""
  local action_type=""
  local description=""
  local priority=""
  local enabled_flag=""
  local config_json=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --name) name=$2; shift 2 ;;
      --action-type) action_type=$2; shift 2 ;;
      --description) description=$2; shift 2 ;;
      --priority) priority=$2; shift 2 ;;
      --enabled) enabled_flag="true"; shift ;;
      --disabled) enabled_flag="false"; shift ;;
      --config-json) config_json=$2; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  if [[ -n "$action_type" ]]; then
    validate_action_type "$action_type"
  fi

  local data='{}'

  if [[ -n "$name" ]]; then
    data=$(echo "$data" | jq --arg name "$name" '. + {name: $name}')
  fi

  if [[ -n "$action_type" ]]; then
    data=$(echo "$data" | jq --arg actionType "$action_type" '. + {actionType: $actionType}')
  fi

  if [[ -n "$description" ]]; then
    data=$(echo "$data" | jq --arg description "$description" '. + {description: $description}')
  fi

  if [[ -n "$priority" ]]; then
    data=$(echo "$data" | jq --arg priority "$priority" '. + {priority: ($priority | tonumber)}')
  fi

  if [[ -n "$enabled_flag" ]]; then
    data=$(echo "$data" | jq --arg enabled "$enabled_flag" '. + {isEnabled: ($enabled == "true")}')
  fi

  if [[ -n "$config_json" ]]; then
    validate_config_json "$config_json"
    data=$(echo "$data" | jq --argjson config "$config_json" '. + {config: $config}')
  fi

  if [[ "$data" == '{}' ]]; then
    echo "Error: No update fields provided" >&2
    exit 1
  fi

  api_request PATCH "/heartbeat/actions/$action_id" "$data"
}

heartbeat_actions_delete() {
  local action_id=$1
  api_request DELETE "/heartbeat/actions/$action_id"
}

# Scheduled actions
scheduled_actions_list() {
  api_request GET /scheduled-actions
}

scheduled_actions_get() {
  local action_id=$1
  api_request GET "/scheduled-actions/$action_id"
}

scheduled_actions_create() {
  local name=""
  local status=""
  local schedule_type=""
  local run_at=""
  local cron_expr=""
  local timezone=""
  local action_type=""
  local config_json=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --status) status=$2; shift 2 ;;
      --schedule-type) schedule_type=$2; shift 2 ;;
      --run-at) run_at=$2; shift 2 ;;
      --cron-expr) cron_expr=$2; shift 2 ;;
      --timezone) timezone=$2; shift 2 ;;
      --action-type) action_type=$2; shift 2 ;;
      --config-json) config_json=$2; shift 2 ;;
      *)
        if [[ -z "$name" ]]; then
          name=$1
          shift
        else
          echo "Unknown option: $1" >&2
          exit 1
        fi
        ;;
    esac
  done

  require_value "name" "$name"
  require_value "--schedule-type" "$schedule_type"
  require_value "--action-type" "$action_type"
  validate_action_type "$action_type"

  if [[ "$schedule_type" == "one_time" ]]; then
    require_value "--run-at" "$run_at"
  elif [[ "$schedule_type" == "cron" ]]; then
    require_value "--cron-expr" "$cron_expr"
    require_value "--timezone" "$timezone"
  else
    echo "Error: --schedule-type must be one_time or cron" >&2
    exit 1
  fi

  local data
  data=$(jq -n \
    --arg name "$name" \
    --arg scheduleType "$schedule_type" \
    --arg actionType "$action_type" \
    '{name: $name, scheduleType: $scheduleType, actionType: $actionType}')

  if [[ -n "$status" ]]; then
    data=$(echo "$data" | jq --arg status "$status" '. + {status: $status}')
  fi

  if [[ -n "$run_at" ]]; then
    data=$(echo "$data" | jq --arg runAt "$run_at" '. + {runAt: $runAt}')
  fi

  if [[ -n "$cron_expr" ]]; then
    data=$(echo "$data" | jq --arg cronExpr "$cron_expr" '. + {cronExpr: $cronExpr}')
  fi

  if [[ -n "$timezone" ]]; then
    data=$(echo "$data" | jq --arg timezone "$timezone" '. + {timezone: $timezone}')
  fi

  if [[ -n "$config_json" ]]; then
    validate_config_json "$config_json"
    data=$(echo "$data" | jq --argjson actionConfig "$config_json" '. + {actionConfig: $actionConfig}')
  fi

  api_request POST /scheduled-actions "$data"
}

scheduled_actions_update() {
  local action_id=$1
  shift

  local name=""
  local status=""
  local schedule_type=""
  local run_at=""
  local cron_expr=""
  local timezone=""
  local action_type=""
  local config_json=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --name) name=$2; shift 2 ;;
      --status) status=$2; shift 2 ;;
      --schedule-type) schedule_type=$2; shift 2 ;;
      --run-at) run_at=$2; shift 2 ;;
      --cron-expr) cron_expr=$2; shift 2 ;;
      --timezone) timezone=$2; shift 2 ;;
      --action-type) action_type=$2; shift 2 ;;
      --config-json) config_json=$2; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  if [[ -n "$action_type" ]]; then
    validate_action_type "$action_type"
  fi

  local data='{}'

  if [[ -n "$name" ]]; then
    data=$(echo "$data" | jq --arg name "$name" '. + {name: $name}')
  fi

  if [[ -n "$status" ]]; then
    data=$(echo "$data" | jq --arg status "$status" '. + {status: $status}')
  fi

  if [[ -n "$schedule_type" ]]; then
    data=$(echo "$data" | jq --arg scheduleType "$schedule_type" '. + {scheduleType: $scheduleType}')
  fi

  if [[ -n "$run_at" ]]; then
    data=$(echo "$data" | jq --arg runAt "$run_at" '. + {runAt: $runAt}')
  fi

  if [[ -n "$cron_expr" ]]; then
    data=$(echo "$data" | jq --arg cronExpr "$cron_expr" '. + {cronExpr: $cronExpr}')
  fi

  if [[ -n "$timezone" ]]; then
    data=$(echo "$data" | jq --arg timezone "$timezone" '. + {timezone: $timezone}')
  fi

  if [[ -n "$action_type" ]]; then
    data=$(echo "$data" | jq --arg actionType "$action_type" '. + {actionType: $actionType}')
  fi

  if [[ -n "$config_json" ]]; then
    validate_config_json "$config_json"
    data=$(echo "$data" | jq --argjson actionConfig "$config_json" '. + {actionConfig: $actionConfig}')
  fi

  if [[ "$data" == '{}' ]]; then
    echo "Error: No update fields provided" >&2
    exit 1
  fi

  api_request PATCH "/scheduled-actions/$action_id" "$data"
}

scheduled_actions_delete() {
  local action_id=$1
  api_request DELETE "/scheduled-actions/$action_id"
}

scheduled_actions_pause() {
  local action_id=$1
  api_request POST "/scheduled-actions/$action_id/pause"
}

scheduled_actions_resume() {
  local action_id=$1
  api_request POST "/scheduled-actions/$action_id/resume"
}

scheduled_actions_history() {
  local action_id=$1
  shift

  local params=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --limit) params="${params}&limit=$2"; shift 2 ;;
      --offset) params="${params}&offset=$2"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  params="${params#&}"
  if [[ -n "$params" ]]; then
    params="?$params"
  fi

  api_request GET "/scheduled-actions/$action_id/history$params"
}

# Help text
show_help() {
  cat <<'EOF'
TeamYou API helper

Usage: teamyou.sh <command> [arguments]

Topics:
  topics-list
  topics-create <name> <description> [--summary <text>]
  topics-get <topic_id>

Details:
  details-list <topic_id>
  details-add <topic_id> <detail1> [detail2] [detail3] ...

Search:
  search-topics <query> [precision]        # precision: low|medium|high (default: medium)
  search-details <query> [precision]

Todos:
  todos-list [--status todo|done] [--archived] [--priority high|medium|low|none] [--order-by createdAt|updatedAt|dueDate|priority] [--limit N]
  todos-create <title> [--description <text>] [--priority high|medium|low|none] [--due-date <ISO8601>]
  todos-get <todo_id>
  todos-update <todo_id> [--title <text>] [--description <text>] [--status todo|done] [--priority PRIORITY] [--due-date <ISO8601>] [--archived]
  todos-delete <todo_id>
  todos-complete <todo_id>

Heartbeat:
  heartbeat-get
  heartbeat-config [--status disabled|active|paused|error] [--frequency-minutes N]
  heartbeat-delete
  heartbeat-start
  heartbeat-stop
  heartbeat-trigger
  heartbeat-history [--limit N] [--offset N]
  heartbeat-actions-list
  heartbeat-actions-create <name> --action-type check_todos|openclaw_command|custom_webhook [--heartbeat-id ID] [--description TEXT] [--priority N] [--disabled] [--config-json '{...}']
  heartbeat-actions-update <action_id> [--name TEXT] [--action-type TYPE] [--description TEXT] [--priority N] [--enabled|--disabled] [--config-json '{...}']
  heartbeat-actions-delete <action_id>

Scheduled Actions:
  scheduled-actions-list
  scheduled-actions-create <name> --schedule-type one_time|cron --action-type check_todos|openclaw_command|custom_webhook [--status active|paused|disabled] [--run-at ISO8601] [--cron-expr 'M H DOM MON DOW'] [--timezone IANA] [--config-json '{...}']
  scheduled-actions-get <action_id>
  scheduled-actions-update <action_id> [--name TEXT] [--status active|paused|disabled] [--schedule-type one_time|cron] [--run-at ISO8601] [--cron-expr 'M H DOM MON DOW'] [--timezone IANA] [--action-type TYPE] [--config-json '{...}']
  scheduled-actions-delete <action_id>
  scheduled-actions-pause <action_id>
  scheduled-actions-resume <action_id>
  scheduled-actions-history <action_id> [--limit N] [--offset N]

Environment:
  TEAMYOU_API_KEY  - API key (or create ~/.teamyou_key)
  TEAMYOU_API_URL  - API base URL (default: https://www.teamyou.com/api/external/v1)

Examples:
  teamyou.sh topics-list
  teamyou.sh heartbeat-config --status active --frequency-minutes 30
  teamyou.sh heartbeat-actions-create "Morning OpenClaw" --action-type openclaw_command --config-json '{"agentId":"main","prompt":"Review high-priority todos"}'
  teamyou.sh scheduled-actions-create "Weekday check" --schedule-type cron --cron-expr "0 9 * * 1-5" --timezone "America/New_York" --action-type check_todos
EOF
}

# Main
if [[ $# -eq 0 ]] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  show_help
  exit 0
fi

command=$1
shift

case $command in
  topics-list) topics_list "$@" ;;
  topics-create) topics_create "$@" ;;
  topics-get) topics_get "$@" ;;
  details-list) details_list "$@" ;;
  details-add) details_add "$@" ;;
  search-topics) search_topics "$@" ;;
  search-details) search_details "$@" ;;
  todos-list) todos_list "$@" ;;
  todos-create) todos_create "$@" ;;
  todos-get) todos_get "$@" ;;
  todos-update) todos_update "$@" ;;
  todos-delete) todos_delete "$@" ;;
  todos-complete) todos_complete "$@" ;;
  heartbeat-get) heartbeat_get "$@" ;;
  heartbeat-config) heartbeat_config "$@" ;;
  heartbeat-delete) heartbeat_delete "$@" ;;
  heartbeat-start) heartbeat_start "$@" ;;
  heartbeat-stop) heartbeat_stop "$@" ;;
  heartbeat-trigger) heartbeat_trigger "$@" ;;
  heartbeat-history) heartbeat_history "$@" ;;
  heartbeat-actions-list) heartbeat_actions_list "$@" ;;
  heartbeat-actions-create) heartbeat_actions_create "$@" ;;
  heartbeat-actions-update) heartbeat_actions_update "$@" ;;
  heartbeat-actions-delete) heartbeat_actions_delete "$@" ;;
  scheduled-actions-list) scheduled_actions_list "$@" ;;
  scheduled-actions-create) scheduled_actions_create "$@" ;;
  scheduled-actions-get) scheduled_actions_get "$@" ;;
  scheduled-actions-update) scheduled_actions_update "$@" ;;
  scheduled-actions-delete) scheduled_actions_delete "$@" ;;
  scheduled-actions-pause) scheduled_actions_pause "$@" ;;
  scheduled-actions-resume) scheduled_actions_resume "$@" ;;
  scheduled-actions-history) scheduled_actions_history "$@" ;;
  *)
    echo "Unknown command: $command" >&2
    echo "Run 'teamyou.sh --help' for usage" >&2
    exit 1
    ;;
esac
