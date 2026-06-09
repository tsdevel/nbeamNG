# NbeamNG Test UI

Quick-and-dirty step-by-step UI for testing all 10 backend slices via the REST API.

## Setup

```bash
cd ui-test
npm install
```

## Run

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

Make sure the backend is running on http://localhost:3000 (or update the **Base URL** in the UI config bar).

## How to Use

1. **Set auth** in the top config bar (API Key, Customer ID, Base URL).
2. **Select a slice** from the left sidebar (1–10).
3. **Click Execute** on each step in order. Steps unlock as prerequisites are satisfied.
4. **Watch the Response Panel** for JSON responses and the **Execution Log** for status.
5. **Captured State** on the left shows IDs extracted from responses (green = set).

### Special Steps

- **Upload PDF** (Slice 1): Select a PDF file before clicking Execute.
- **Submit Review** (Slice 6): Edit the correction text in the textarea.
- **Regenerate** (Slice 6): Edit comma-separated section names.
- **Confirm Impact** (Slice 7): Automatically uses suggested sections from the prior Get Impact step.
- **Distill Expertise** (Slice 10): Edit lesson titles, content, and categories before executing.

## Proxy

The Vite dev server proxies all API routes (`/projects`, `/artifacts`, `/tasks`, etc.) to `http://localhost:3000`. If the backend runs on a different port or host, set the **Base URL** in the UI (e.g., `http://localhost:3000`) and disable the proxy in `vite.config.ts`.
