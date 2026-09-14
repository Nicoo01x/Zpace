# Security

Zpace runs coding agents with access to your files and your shell, so a bug here can matter more than usual. Thank you for looking.

## Reporting

Please report vulnerabilities privately through [GitHub's advisory form](https://github.com/Nicoo01x/Zpace/security/advisories/new) — not in a public issue, not in a pull request. Include what you found, how to reproduce it, and what an attacker could do with it.

You will get an answer within a few days. Once there is a fix, it ships in a release and the advisory is published with credit to you (unless you prefer not to be named).

## Scope

- The desktop app (`src`, `src-tauri`) and its updater.
- The plugin runtime: a plugin must not be able to do more than its manifest's `permissions` say.
- The plugin registry ([zpace-plugins](https://github.com/Nicoo01x/zpace-plugins)): the index, the install path, the sandbox of plugin panes.

Out of scope: the coding agents themselves (Claude Code, Codex, Gemini CLI, OpenCode) — report those to their vendors.

## Supported versions

The latest release. Older versions are not patched; the app offers the update at launch.
