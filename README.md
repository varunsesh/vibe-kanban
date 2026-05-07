# VibeKanban

VibeKanban is a desktop Kanban board app built with Electron and React. It supports Google sign-in (Firebase auth), local username login, project management, drag-and-drop tasks, and customizable columns.

## Key Features

- **Role-Based Access Control (RBAC):**
    - **Global Roles:** Admin and User roles manage overall application access.
    - **Project Roles:** Project Manager and Member roles define permissions within individual projects.
    - **Ownership:** Projects have owners who have full administrative control.
- **Project Management:**
    - Create and manage multiple projects.
    - Add/remove project members and assign roles.
    - Project-scoped visibility: users only see projects they own or are members of.
- **Advanced Task Management:**
    - Drag-and-drop tasks across customizable columns.
    - Task ownership: project members can only delete tasks they created (unless they are a PM or Admin).
    - Task comments and priority levels.
- **Google Sheets Synchronization:**
    - Bi-directional sync for tasks, project configuration, and membership.
    - Connect projects to existing spreadsheets or create new ones automatically.
- **Offline First:** Local data persistence using IndexedDB ensures the app remains functional without an internet connection.

## Stack

- **Frontend:** React + TypeScript, MUI + Lucide for UI and icons.
- **Desktop:** Electron for cross-platform desktop packaging.
- **State Management:** Zustand for global and project-specific state.
- **Persistence:** IndexedDB (Local) + Google Sheets (Cloud Sync).
- **Authentication:** Firebase Auth (Google SSO) + Local Username fallback.
- **Tooling:** Vite for development and build orchestration.

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

## Project Structure

- `electron/`: Main process and preload scripts.
- `src/components/`: Reusable UI components (Sidebar, Column, TaskModal, etc.).
- `src/store/`: Zustand stores for application, user, and project state.
- `src/services/`: Integration services (Google Sheets, Sync Service).
- `src/db/`: IndexedDB schema and database utility.
- `src/auth/`: Firebase authentication configuration.

## Other Useful Scripts

```bash
npm run lint
npm run preview
```

- `lint`: Runs ESLint on TypeScript/TSX files.
- `preview`: Serves the built web assets for preview.
