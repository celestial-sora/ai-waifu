# Sorasocute Linux Desktop Pet handoff

## Scope

- Branch: `feature/desktop-pet-local`.
- Focus on Linux Desktop UI. Keep the Live2D model and shared Vivian chat/provider behavior.
- Linux package name is Sorasocute. Keep the existing Vivian app-data path so previously saved Desktop API keys remain available. Angela is a release/version label, not the product name.
- For UI preview use the packaged production runtime with `npm run desktop:preview:linux`; avoid `next dev` because its development indicator obscures the Pet UI.

## Current UI direction

- Floating transparent Pet. Hover reveals its side menu.
- Three dots above Vivian expand the microphone, camera, and image attachment controls on hover with motion; click pins/unpins the controls. A narrow drag strip sits above the dots.
- Composer contains only a text field and send button. Chat history has a separate menu entry.
- Speech popup uses the frameless rise animation and animated thinking dots from `main`.
- Settings are split into Memory, API keys, and Preferences pages. Esc moves back one settings level and then closes settings.
- If Supabase credentials are not set, Desktop stores memories and recent messages in a permission-restricted `memory.json` in the Vivian app-data directory. Memories can be added, edited, deleted, and used as chat context. With Supabase configured, the shared cloud memory remains active.
- Linux provides a tray Show/Hide/Quit menu. GNOME Shell may require AppIndicator support for a top-bar tray icon; the taskbar remains a fallback.

## Build and preview

```bash
npx tsc --noEmit
git diff --check
npm run desktop:preview:linux
npm run desktop:dist:linux
```

The AppImage is `dist/sorasocute.AppImage`.

## Verify before handoff

- Inspect hover expansion, pinned/unpinned state, text-only composer, settings Esc navigation, and local memory CRUD in the packaged app.
- Verify the AppImage name/icon and tray icon in a GNOME session with AppIndicator support.
- Keep API keys and `memory.json` out of the repository. Commit intentional source changes only.
