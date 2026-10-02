# Handoff — changes made in this chat

Updated: 2026-10-02 (Asia/Bangkok). Rewritten from scratch after implementation and verification, at the user's explicit request. This document covers changes from this chat only; use AGENTS.md for general repository rules.

## Git state and publication

- Work belongs on `main`, as explicitly requested by the user.
- Authentication commit `91ee7d8` was fast-forwarded and pushed to `main`.
- `codex/private-google-auth` was deleted from GitHub and the local checkout.
- `54214ba` adds private Live2D import and animation discovery.
- `2cfe4f0` adds large-texture adaptation, pose expressions, and renames the visible Outfit tab to **Models**.
- No explicit Vercel CLI production deployment was performed for these model changes. Production deployment/alias readiness was not verified in this chat.
- `supabase/.temp/` remains unrelated local untracked state; do not include it in commits.

## Copyright-related Live2D cleanup

- Purchased Live2D assets are no longer distributed with the repository. Model files remain excluded from version control; the tracked Cubism Core runtime is retained.
- Source removal and migration notes are in commits `3e32a80` and `13bb019`, and README.md explains how existing clones should move to the cleaned history without restoring removed assets.
- The user explicitly authorized removing old GitHub build files as well as history because redistribution was prohibited.
- Final read-only audit found zero `.moc3`, `.model3.json`, `.exp3.json`, and `.motion3.json` asset paths in reachable local Git history, zero attached assets across the GitHub releases returned by the API, and zero Actions artifacts.
- This audit does not establish that downloaded clones, external forks, or GitHub cached/unreachable objects have been erased. Never merge old history back into the cleaned repository.
- Both real model ZIPs supplied for testing stayed outside the repository. No model binaries, textures, previews, or ZIP archives were committed or uploaded to a model server.

## Private Google authentication

- Added Supabase Auth Google OAuth, a styled Google login screen, PKCE callback at `/auth/callback`, cookie session refresh in `proxy.ts`, and POST `/auth/signout` from Settings.
- `app/page.tsx` is the server-side access gate; the existing companion UI moved to `app/companion.tsx`.
- Confirmed, non-anonymous accounts are restricted server-side to:
  - `suphloeksangko@gmail.com`
  - `duckchan690@gmail.com`
- Every protected API checks the verified identity independently of Proxy. Client identity claims/user metadata are not trusted. Same-origin checks protect cookie-authenticated mutations; verified bearer tokens support other Vivian clients.
- Both approved accounts retain the existing shared cloud memory/relationship identity (`default`).
- Required public Auth configuration: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or anon key fallback). Configure Supabase's Google provider and allowed callback URLs as documented in README.md. Privileged provider/service-role keys remain server-side.
- Google/Supabase dashboard configuration and a live Google login were not verified here; local Auth fixtures were used for automated checks.
- Main files: `lib/auth/{config,policy,server,fetch}.ts`, `proxy.ts`, `app/login/`, `app/auth/`, and protected API routes.

## Character → Models / Expression / Pose

- Renamed the visible **Outfit** tab to **Models**, and the selector label to **Model**. The internal tab key remains `outfit`; this is an implementation detail, not an unfinished rename.
- Import either a complete ZIP or a folder from Character → Models. Nested archives and multiple model manifests are supported. Select a model, restore it on the next page load, or remove its entire package from browser storage.
- Limits: 512 MB uncompressed and 3,000 files. Check expanded ZIP limits, invalid/escaping/external paths, duplicate files, valid Cubism manifests, and missing referenced assets before saving.
- Packages are stored only in IndexedDB (`vivian-local-models`, `packages`), with the selected model ID in localStorage (`vivian-local-model`). Models do not upload to Supabase, GitHub, Vivian's backend, or another user/device. Changing origin/profile or clearing site data requires re-import.
- Expressions and motion groups/indices come from the imported manifest. Nearby `.exp3.json` and `.motion3.json` files omitted by the artist are also discovered. Nested folders belonging to another model are excluded; declared names/groups are preserved.
- Undeclared motion groups use their folder, recognized Idle names (including Chinese/Japanese idle names), or `Imported`.
- Pose also shows clearly named pose expressions such as sitting, lifting a skirt, and holding a bouquet. These remain in Expression too. Recognition is name-based, not an inference from opaque parameter IDs. A `.pose3.json` itself is not a list of playable motions.
- Pose reset stops manual motions and resets expression state; idle motions can resume. Manual action completion is guarded against cancelled/superseded model loads.
- Common emotion names can be matched to Vivian's mood. Miss's authored reaction mapping is retained. Opaque names are selectable manually.
- Preview uses a supplied preview/icon/thumbnail/portrait/cover image or a model-named image, excluding texture atlases. If no suitable image exists, capture the rendered framebuffer and crop the avatar; extracting Cubism directly into a render texture produced a tiny preview and was corrected.
- Runtime files resolve to private Blob URLs, revoked on model switch/unmount. Backend character identity remains `Miss`; imported avatar selection does not change cloud identity.
- Main files: `lib/local-models.ts`, `app/companion.tsx`, `app/globals.css`.

## Large atlas handling

- `lib/model-textures.ts` inspects PNG dimensions from the header before decoding, plans rendering dimensions against the actual WebGL `MAX_TEXTURE_SIZE`, and applies an RGBA atlas budget: 512 MiB desktop / 128 MiB mobile.
- **Auto** is the default. Oversized atlases are resized sequentially into temporary browser-only render copies. ImageBitmap/canvas resources are released, interrupted loads are aborted, and mipmaps are disabled before rendering.
- Original imported blobs/ZIPs remain unchanged. The UI shows rendered vs original dimensions when adaptation occurs.
- Two 16,384 × 16,384 atlases render at 8,192 × 8,192 under the desktop budget or 4,096 × 4,096 under the mobile budget, if GPU limits permit. These are atlas dimensions, not screen resolution.
- **Original textures** skips the memory budget but still rejects dimensions exceeding the GPU limit. The choice resets to Auto on a fresh page load. Native 16K decoding/upload is much more demanding; full native 16K Princess rendering was not tested.
- Mobile budget calculations and responsive layout were checked; actual iPhone/iPad Safari and Android large-atlas decoding/memory behavior remain unverified. A resizing failure should show an error while text chat stays usable.

## Real model verification

### Miss__4_.zip

- Two 4,096px texture atlases; about 25.9 MB expanded.
- Its manifest omits expressions despite containing 15 `.exp3.json` files. Discovery now exposes and plays all 15, including names containing `#`, Unicode, and trailing spaces.
- No motion files or separate preview image were present. Preview is generated from the rendered model; the Pose tab shows the absence of motions.
- Verified private import, reload restoration, selected expression playback, generated preview, and Original quality at 4K.

### Princess Live 2D Vtuber Model.zip

- About 122.2 MB expanded, including two 16,384 × 16,384 atlases.
- Model manifest: `marrymei.model3.json`; detected 17 expressions and 3 undeclared motion files (`wink`, `待机`, `蝴蝶`).
- Supplied `marrymei.png` is used as the preview. Artist Art images are outside the model folder and are not confused with its textures/preview.
- Sitting (`坐姿`), skirt-lift (`提裙子`), and bouquet (`捧花`) expressions also appear in Pose.
- Verified import/restoration and desktop Auto rendering at 8,192px, with original files still 16,384px. Device reported a 16,384px GPU texture limit.
- Verified blush (`脸红`), sitting pose, wink motion, and reset controls. Full native 16K mode was not executed.

An official Cubism Haru sample was also used locally outside Git to verify ZIP/folder imports, multiple manifests, supplied/generated previews, expressions, motion playback/reset, missing-file rejection, and responsive UI. These test assets are not part of the app.

## Verification and next checks

Passed during this chat:

- `npx tsc --noEmit`
- `git diff --check`
- `npm run build`
- `npm run test:models` — 11 tests covering package discovery, path/reference rejection, Blob URL lifecycle, IndexedDB storage, pose expressions, atlas budgets/GPU limits, and header-only PNG inspection.
- `npm run test:auth` — allowlist/origin policy tests.
- `npm run test:auth:integration` — protected pages/APIs, forged identity rejection, bearer access, PKCE flows, session refresh, logout, missing configuration, and cross-site mutation rejection.
- Focused ESLint checks on the new model/texture helpers and texture tests.

Follow up only where needed: verify live Google provider configuration and production deployment; test real large-atlas behavior on physical Safari/Android devices; use actual motion/expression names from each imported package. Do not bundle either purchased model to make these tests work.

## 2026-10-02 — Tsundere personality and GitHub cleanup

- The user requested removal of the two yandere branches, handling the open PR, and making Vivian strongly tsundere overall.
- Deleted remote branches `feature/yandere-personality` and `fix/vivian-yandere-agency`. Their historical PRs #1 and #3 were already merged; no history was merged back into main.
- Reviewed and closed PR #2 (`Desktop Pet: package Vivian as local Windows app`). It conflicts with main, has failing desktop checks, and its older implementation replaces the authenticated home page/Proxy and removes independent chat API authorization. Its history must not be merged into the cleaned repository. Kept `feature/desktop-pet-local` for separate desktop work.
- Replaced the primary chat personality and relationship initiative instructions with strong tsundere behavior: proud, teasing, flustered by affection, caring through actions. All personality variants retain the same core. Old memory/summary text must not restore the retired personality. Distress takes priority over teasing.
- Updated local greeting fallbacks, personality descriptions, and Live2D mood expression matching. `normalizeMood` maps older stored `yandere` values to `tsundere` on both server and browser reads while retaining shared relationship scores and memory; no destructive database migration is needed.
- Added `npm run test:companion` for old-state compatibility, early relationship flustered reactions, distress precedence, idle scores, and mood decay. Updated README.md.
- Passed: production build, TypeScript, diff whitespace checks, and four companion regression tests. Authentication policy (3 tests) and integration (6 tests) also passed, including page/API access guards and cross-site mutation rejection.
- No explicit CLI production deployment requested or performed for this change; follow the continuation rule to deploy only on request. Do not claim the production alias contains this commit without verifying a deployment.
- Preserve unrelated untracked `supabase/.temp/`.
