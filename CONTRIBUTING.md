# Contributing to Zpace

Thanks for wanting to help. Zpace is one person's project with a lot of surface, so the rules below keep it something one person can still review.

## Before you start

- **Bugs**: open an issue with the template. A screenshot or a short clip is worth a page of text.
- **Features**: open an issue first and say what problem it solves. Many ideas fit the [plugin API](https://github.com/Nicoo01x/zpace-plugins) and can ship without touching the app — that is the fastest route.
- **Security**: never in a public issue — see [SECURITY.md](SECURITY.md).

## Working on the code

```
npm install
npm run dev            # the web side on 127.0.0.1:1420
npm run tauri dev      # the desktop app against it
npm run lint           # eslint + tsc, must be clean
node scripts/i18n-check.mjs   # every dictionary complete
```

Rust lives in `src-tauri`; `cargo check` there. The conventions that matter — design tokens, the motion system, i18n, stores, how plugins hook in — are in [CLAUDE.md](CLAUDE.md). It is written for an AI pair, but it is the style guide for humans too.

## Pull requests

- One change per pull request, on a branch from `main`, with a title that reads like a commit subject.
- Fill in the template. `main` is protected: the checks must pass on Windows, macOS and Linux, and the owner reviews every pull request before it merges (squash merge, so your branch history does not matter).
- Every user-facing string goes through `t()` and into all nine dictionaries. Anything that opens must animate. No literal colours, no personal data, no absolute paths.
- Keep the file's formatting: there is no Prettier; long one-line JSX props are normal here. Do not reflow files you did not otherwise change.

## What will not be merged

- Accounts, telemetry, cloud services, anything that sends data off the machine without the user asking.
- A second way to do something the app already does.
- Dependencies for things a few lines of code can do.
