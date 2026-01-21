# Changelog

## 0.1.1

- Preserve original `headers` container type (Headers/array/object) to avoid affecting downstream request serialization.
- Improve OpenCode provider compatibility by supporting `provider.info.api.npm` shape.

## 0.1.2

- Add optional debug logging gated by `OPENCODE_SESSION_CACHE_DEBUG=1`.

## 0.1.3

- Write debug logs to `OPENCODE_SESSION_CACHE_DEBUG.log` when `OPENCODE_SESSION_CACHE_DEBUG=1`.

## 0.1.4

- Prefer writing debug logs to the OpenCode worktree; fall back to `/tmp/OPENCODE_SESSION_CACHE_DEBUG.log`.
- Allow overriding debug log path via `OPENCODE_SESSION_CACHE_DEBUG_FILE`.

## 0.1.5

- Allow enabling debug logs via provider option `sessionCacheDebug: true` (no env var required).
- Add stage logs for `chat.params` (enter/skip reasons) when debug enabled.

## 0.1.0

- Initial release: OpenCode plugin that injects `x-session-id` and `session_id` for OpenAI prompt caching.
