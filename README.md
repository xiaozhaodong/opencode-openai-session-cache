# OpenAI Session Cache Plugin for OpenCode

Adds OpenAI prompt caching headers via the OpenCode plugin hook.

## Behavior
- Only active when `provider.api.npm === "@ai-sdk/openai"`
- Requires `provider.options.cacheSessionId === true`
- Adds both `x-session-id` and `session_id`
- Uses `sessionID` with `ses_` replaced by `sess_`
- Does not override user-provided headers

## Install
```
bun add github:xiaozhaodong/opencode-openai-session-cache
```

## Enable Plugin
Add the plugin to your OpenCode config:

```
plugin:
  - opencode-openai-session-cache
```

## Provider Config Example
```
provider:
  openai:
    api:
      npm: "@ai-sdk/openai"
    options:
      cacheSessionId: true
```

## Notes
- Non-OpenAI providers are ignored.
- If you already set `x-session-id` or `session_id`, the plugin preserves them.
