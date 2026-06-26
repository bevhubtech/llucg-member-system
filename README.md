# llucg-member-system

## Overview

A Node + React/Vite member portal.

## Build on Render

Render runs the **Build Command** you configure. For this repo use:
```
npm install && cd frontend && npm install && npm run build
```
This installs the root dependencies, then the `frontend` dependencies (including **Vite**) and builds the UI.

The **Start Command** can be:
```
npm run start
```
which launches the backend (`node index.js`).

## Security notes
- All `.env*` files are ignored via `.gitignore` – API keys never get committed.
- Keep your JWT secrets and other credentials in the Render environment variables panel.

## Development
```bash
# install everything
npm run install-all
# start backend
npm run start
# start frontend dev server
cd frontend && npm run dev
```
