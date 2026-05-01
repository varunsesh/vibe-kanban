# VibeKanban

VibeKanban is a desktop Kanban board app built with Electron and React. It supports Google sign-in (Firebase auth), local username login, project management, drag-and-drop tasks, and customizable columns.

## Stack (Brief)

- Electron for desktop packaging and runtime
- React + TypeScript for UI and app logic
- Vite for fast development/build tooling
- MUI + Lucide for UI components and icons
- IndexedDB for local data persistence
- Firebase Auth for Google SSO

## Development

### Prerequisites

- Node.js 18+
- npm

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run dev
```

This starts the Vite-powered Electron development flow (renderer + Electron process).

## Build

### Production build + desktop installers

```bash
npm run build
```

This runs:

1. TypeScript compile (`tsc`)
2. Renderer and Electron bundle builds (`vite build`)
3. Installer packaging (`electron-builder`)

Build artifacts are written to:

- `dist/` (renderer assets)
- `dist-electron/` (Electron main/preload bundles)
- `release/<version>/` (platform installers/packages)

## Other Useful Scripts

```bash
npm run lint
npm run preview
```

- `lint`: Runs ESLint on TypeScript/TSX files.
- `preview`: Serves the built web assets for preview.
