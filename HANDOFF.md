# HANDOFF — Vivian Desktop Pet

> Scope: **Vivian Desktop Pet only**
>
> Branch: `feature/desktop-pet-local`
>
> Do **not** use this file as source of truth for the full Vivian Web App or `main`.

## 1. Goal

Build Vivian as a local Windows desktop pet while reusing the existing Vivian web/core systems.

Target behavior:

- Electron desktop shell.
- Next.js local runtime.
- Route: `/desktop`.
- Transparent, frameless, always-on-top window.
- Live2D Vivian rendered in the desktop window.
- Draggable UI with minimize / close.
- Reuse existing Chat, Memory, STT, TTS, Vision, provider fallback, and Live2D code.
- Installed app must not require system Node.js, npm, npx, or a production Vercel route.
- Windows installer target: `vivian-socute.exe`.

## 2. Current branch

```
feature/desktop-pet-local
```

Current architecture:

```
Electron
   │
   ├── desktop/electron.cjs
   │
   ├── desktop/preload.cjs
   │
   └── desktop/server.cjs
   │
   ▼
127.0.0.1:<private local port>
   │
   ▼
Next.js standalone runtime
   │
   ├── /desktop
   ├── /api/chat
   ├── /api/stt
   ├── /api/tts
   ├── /api/memory
   └── existing Vivian providers / tools
```

Web and Desktop share the same companion implementation.

```
app/
├── CompanionApp.tsx
├── page.tsx
└── desktop/
    └── page.tsx
```

- `/` uses `<CompanionApp />`
- `/desktop` uses `<CompanionApp desktopMode />`
- Do not fork the Vivian core into a separate Desktop copy.

## 3. Desktop presentation layer

Desktop differences remain behind `desktopMode` and Desktop-specific CSS / Electron code.

Desktop mode currently includes:

- Transparent shell.
- Background scene hidden.
- Vivian header hidden.
- Live2D on transparent window.
- Hover/focus desktop controls.
- Compact speech bubble.
- Compact side tools.
- Draggable region.
- Minimize.
- Close.

Desktop-specific styles are in `app/globals.css`.

## 4. Electron security model

Files:

- `desktop/electron.cjs`
- `desktop/preload.cjs`
- `desktop/server.cjs`

Renderer security:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Arbitrary new windows denied.
- Navigation outside the local Vivian origin denied.
- Camera / microphone permission is restricted to the local Vivian origin.
- Native features must go through explicit preload IPC.
- Do not expose `fs`, `child_process`, `require`, `process`, or `shell` directly to renderer code.

Current preload bridge exposes only explicit Desktop actions such as:

- `close()`
- `minimize()`
- `toggleAlwaysOnTop()`

### Local API protection

Packaged Desktop runtime creates a fresh random token for each launch.

- Environment variable: `VIVIAN_DESKTOP_TOKEN`
- Next proxy checks the token only when Desktop runtime enables it.
- Electron injects `X-Vivian-Desktop-Token` only for trusted local `/api/*` requests from the main Vivian renderer.
- Production web behavior remains unchanged when `VIVIAN_DESKTOP_TOKEN` is not present.

The local Next server must remain bound to:

```
127.0.0.1
```

Never expose it on `0.0.0.0`.

## 5. Development launcher

Development command:

```bash
npm run desktop:dev
```

Development flow:

```
desktop/run.mjs
   │
   ├── starts Next.js on 127.0.0.1:3210
   ├── waits for /desktop
   └── launches Electron
```

This development launcher may use npx/Electron tooling.

The installed application must not.

## 6. Production build

Desktop production build uses Webpack intentionally:

```bash
npm run desktop:build
```

which runs:

```bash
next build --webpack
```

Reason:

- `next.config.ts` enables `output: "standalone"` outside Vercel.
- Vercel builds intentionally do not use standalone output.
- Desktop standalone packaging is isolated from the normal Vercel production pipeline.

Current config:

```ts
output: process.env.VERCEL ? undefined : "standalone"
```

Vercel previews have been verified to remain functional after this separation.

## 7. Packaged local Next runtime

`desktop/server.cjs`:

1. Finds a free loopback port beginning near 3210.
2. Loads optional user-local config from:
   ```
   %APPDATA%/Vivian/.env
   ```
   via Electron `app.getPath("userData")`.
3. Launches bundled Next standalone server with Electron's executable using:
   ```
   ELECTRON_RUN_AS_NODE=1
   ```
4. Waits until `/desktop` responds.
5. Opens the Electron window.
6. Stops the child server when Electron exits.

Do not bake API keys or private credentials into:

- app.asar
- resources
- JS bundles
- installer
- Git
- GitHub Actions artifacts

## 8. Next standalone packaging

Direct `extraResources` copying was not reliable enough for the standalone dependency tree.

Current packaging uses:

```
desktop/after-pack.cjs
```

through:

```yaml
afterPack: ./desktop/after-pack.cjs
```

The hook copies:

- `.next/standalone`
- `.next/static`
- `public`

into:

```
resources/standalone
```

and verifies that the packaged runtime contains:

```
resources/standalone/server.js
resources/standalone/node_modules/next/package.json
resources/standalone/.next/static/...
resources/standalone/public/live2d/live2dcubismcore.min.js
```

This is the current packaging path being validated by Windows CI.

## 9. electron-builder / NSIS

Config:

```
electron-builder.yml
```

Desktop shell manifest:

```
desktop/package.json
desktop/package-lock.json
```

The Electron shell package is intentionally isolated and has no normal runtime dependencies.

Important config:

```yaml
appId: dev.celestialsora.vivian
productName: Vivian
artifactName: vivian-socute.${ext}
electronVersion: 44.4.1
asar: true
```

Windows target:

- NSIS
- x64
- per-user install
- selectable install directory
- Desktop shortcut
- Start Menu shortcut

Expected artifact:

```
dist/vivian-socute.exe
```

### App icon status

A custom Windows icon is **not currently enabled**.

Existing repository icons are below Electron Builder's required 256×256 Windows icon size:

- `public/favicon.ico` max size: 48×48
- `public/favicon.png`: 192×192
- `public/apple-touch-icon.png`: 180×180

The installer currently falls back to the default Electron icon.

Do not re-enable `win.icon` until a proper 256×256+ source icon is available.

## 10. Dependency security fixes

Production dependency audit previously detected a critical advisory through:

```
pixi-live2d-display@0.4.0
  -> gh-pages@4
```

Downgrading Live2D to `0.3.1` was rejected because it risks breaking the existing Pixi 6 / Cubism integration.

Current root overrides:

```json
{
  "overrides": {
    "gh-pages": "6.3.0",
    "qs": "6.16.0"
  }
}
```

Windows CI verifies exact installed versions and runs:

```bash
npm audit --omit=dev --audit-level=critical
```

This audit gate has passed in recent Windows validation runs.

Do not remove these overrides without checking upstream compatibility and rerunning the audit.

## 11. Windows CI

Workflow:

```
.github/workflows/desktop-windows.yml
```

Current validation sequence:

1. Checkout.
2. Node 24 setup.
3. `npm ci`.
4. Production dependency audit.
5. Verify patched `gh-pages` and `qs` versions.
6. Syntax-check Desktop Node entrypoints.
7. `npm run desktop:build`.
8. Reject `.env*` / `.pem` files from standalone output.
9. Smoke-test raw standalone runtime.
10. Build NSIS installer.
11. Verify Electron shell does not contain unexpected root `node_modules`.
12. Launch packaged `dist/win-unpacked/Vivian.exe --smoke-test`.
13. Verify packaged runtime files.
14. Upload `vivian-socute.exe`.

Concurrency is enabled so superseded branch builds are cancelled.

## 12. Smoke tests

### Standalone smoke test

File:

```
desktop/smoke-standalone.mjs
```

It verifies:

- standalone server starts.
- `/desktop` returns successfully.
- Desktop Pet shell renders.
- unauthenticated Desktop API request is blocked.
- request with correct Desktop token passes proxy authorization.

### Packaged Electron smoke mode

`desktop/electron.cjs` supports:

```
--smoke-test
```

CI launches the actual unpacked executable:

```
dist/win-unpacked/Vivian.exe --smoke-test
```

Smoke mode:

- starts the packaged standalone server.
- opens the Electron renderer without showing the normal window.
- waits for `did-finish-load`.
- verifies:
  - `.desktop-pet-shell`
  - `canvas.live2d-canvas`
- exits 0 on success.
- writes optional diagnostics through `VIVIAN_SMOKE_LOG`.

## 13. Current CI state at handoff

At the time this HANDOFF was written:

- Latest branch tip:
  ```
  7b8e0ccc811ea94e968d804b33ceff4f57f32e49
  ```
- Latest commit message:
  ```
  ci(desktop): verify afterPack standalone dependency tree
  ```
- Windows workflow:
  ```
  Vivian Desktop Windows — run #60
  ```
- Run #60 is currently **in progress**.
- It specifically validates the latest `afterPack` standalone dependency copy.
- Do not claim the current branch tip is fully packaged/release-ready until run #60 finishes successfully.

A previous Windows run already demonstrated that NSIS can produce and upload a `vivian-socute.exe` artifact, but later packaging hardening changed the runtime-copy path. Therefore only the latest branch-tip run should be used as the final release gate.

## 14. Known completed items

Completed on this branch:

- Separate Desktop branch.
- Shared `CompanionApp`.
- `/desktop` route.
- Transparent frameless Electron shell.
- Always-on-top.
- Drag region.
- Minimize / close.
- Local development launcher.
- Camera / microphone permission handling.
- Reuse existing AI routes.
- Reuse Memory.
- Reuse STT / TTS.
- Reuse Vision.
- Reuse Live2D.
- Standalone Next production mode.
- Packaged local server lifecycle.
- Random per-launch Desktop API token.
- Localhost-only server binding.
- Security audit gate.
- Secret-file rejection in packaged runtime.
- NSIS configuration.
- Packaged Electron smoke mode.
- Draft PR validation lane.

## 15. Not completed / not release-ready yet

Do not mark these complete until explicitly verified:

- Latest afterPack-based Windows build is green.
- Latest packaged `Vivian.exe --smoke-test` is green.
- Actual installed app tested interactively on a Windows machine.
- Microphone tested in installed build.
- Camera tested in installed build.
- TTS playback tested in installed build.
- STT tested in installed build.
- Live2D visual rendering inspected in installed build.
- Installer install/uninstall manually tested.
- Code signing.
- Final Vivian Windows icon.

The current installer is expected to be unsigned unless signing credentials are added deliberately.

## 16. Desktop behavior TODO after packaging is stable

Still planned:

- Click-through mode.
- Safe click-through recovery path.
- Interaction lock/unlock.
- Drag Vivian directly.
- Snap to screen edge.
- Persist window position / size / display.
- Start with Windows.
- Tray icon.
- Show / hide pet.
- Always-on-top toggle.
- Multi-monitor handling.
- Pet scale slider.
- Opacity slider.
- Global keyboard shortcut.
- Idle / sleep mode.
- Wake on voice.
- Minimize to tray.
- Configurable interaction region.

### Click-through warning

Potential API:

```js
win.setIgnoreMouseEvents(true, { forward: true })
```

Never enable permanent click-through without a recovery route such as:

- tray menu
- global shortcut
- keyboard shortcut
- dedicated interaction zone

## 17. Merge rule

Do **not** merge `feature/desktop-pet-local` into `main` yet.

Draft PR:

```
#2 Desktop Pet: package Vivian as local Windows app
```

Keep it draft until all release gates pass.

Minimum merge gates:

1. Latest Windows CI is green.
2. NSIS installer produced from current branch tip.
3. Packaged Electron smoke test is green.
4. Standalone runtime contains full dependency tree.
5. Live2D assets are bundled.
6. No secrets are bundled.
7. Installed app launches without Node/npm/npx.
8. Installed microphone/camera are verified manually.
9. Clean Electron quit also terminates local Next child process.

## 18. Immediate next action

Continue from the latest Windows CI run.

If run #60 fails:

1. Read the failing step/log.
2. Fix the exact packaging/runtime issue.
3. Do not weaken the security/audit gates just to make CI green.
4. Rerun until:
   - standalone smoke passes,
   - NSIS build passes,
   - packaged Electron smoke passes,
   - runtime asset verification passes,
   - artifact upload passes.

If run #60 succeeds:

1. Download the newest `vivian-socute-windows-x64` artifact.
2. Test `vivian-socute.exe` on real Windows.
3. Verify install / launch / uninstall.
4. Verify Live2D, mic, camera, STT, TTS.
5. Only then consider Desktop packaging stable.

## 19. Source of truth

For Desktop Pet work, start here:

- Branch: `feature/desktop-pet-local`
- Shared UI: `app/CompanionApp.tsx`
- Desktop route: `app/desktop/page.tsx`
- Electron main: `desktop/electron.cjs`
- Preload: `desktop/preload.cjs`
- Local packaged server: `desktop/server.cjs`
- Standalone smoke: `desktop/smoke-standalone.mjs`
- Packaging hook: `desktop/after-pack.cjs`
- Dev launcher: `desktop/run.mjs`
- Builder config: `electron-builder.yml`
- Windows CI: `.github/workflows/desktop-windows.yml`
- Installer target: `vivian-socute.exe`

Do not duplicate core Vivian systems for Desktop. Reuse the existing application logic and keep Desktop-specific behavior isolated.
