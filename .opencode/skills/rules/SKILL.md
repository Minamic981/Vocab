---
name: rules
description: Vocab app project rules — PC vs mobile separation, code quality standards, shared code locations, and file structure.
---

# My WordBook — Vocab App Rules

## PC vs Mobile Separation

When the user says **"on PC"**, target **only** the desktop codebase:
- `frontend/src/web/main.jsx` — PC entry point
- `frontend/src/web/App.jsx` — main PC app
- `frontend/src/web/nav/` — PC navbar components
- `frontend/src/web/components/` — PC components

When the user says **"on mobile"**, target **only** the mobile codebase:
- `frontend/src/mobile/mobile.jsx` — mobile entry point
- `frontend/src/mobile/mobileApp.jsx` — main mobile app
- `frontend/src/mobile/nav/` — mobile navbar components
- `frontend/src/mobile/compMobile/` — mobile-specific components

If the user says **"both"** or doesn't specify platform, apply changes to **both** PC and mobile.

**Never** apply a PC change to mobile or vice versa unless explicitly asked.

## Code Quality

- All code must be **optimized**, **clean**, **modular**, and **properly linked**
- No unused imports, variables, or dead code
- Use `useCallback` for functions passed as props
- Use `useMemo` for expensive derived computations
- Prefer prop drilling over context for this project (context was reverted)

## Shared Code

Reusable functions and components go in:
- `frontend/src/common/` — shared utilities (e.g., `utils.jsx`)
- `frontend/src/web/components/` — shared PC components
- `frontend/src/mobile/compMobile/` — shared mobile components

**Never duplicate** logic across PC and mobile when it can be shared.

## File Structure

```
frontend/src/
├── common/                        # Shared utils
│   └── utils.jsx
├── web/                           # PC (web) codebase
│   ├── index.html                 # PC entry HTML
│   ├── main.jsx                   # PC entry point
│   ├── App.jsx                    # PC main app
│   ├── nav/                       # PC navbar tabs
│   │   ├── Library.jsx
│   │   ├── BatchImport.jsx
│   │   ├── Practice.jsx
│   │   └── MultipleMeanings.jsx
│   └── components/                # PC components
│       ├── FloatingNav.jsx
│       └── ExportButton.jsx
├── mobile/                        # Mobile codebase
│   ├── mobile.html                # Mobile entry HTML
│   ├── mobile.jsx                 # Mobile entry point
│   ├── mobileApp.jsx              # Mobile main app
│   ├── nav/                       # Mobile navbar tabs
│   │   ├── Library.jsx
│   │   ├── BatchImport.jsx
│   │   ├── Practice.jsx
│   │   └── MultipleMeanings.jsx
│   └── compMobile/                # Mobile-specific components
│       ├── ExportButton.jsx
│       └── MobileBottomNav.jsx
```
