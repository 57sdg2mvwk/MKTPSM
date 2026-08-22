---
name: VPS production hosting
description: The production topology for the AMD panel on its cPanel VPS.
---

Serve the Vite frontend as static files from cPanel’s web root and run the API as a persistent Node service bound only to `127.0.0.1`; Apache proxies same-origin `/api` requests to that service.

**Why:** This keeps secure session cookies first-party while preventing the Node API port from being directly exposed to the internet.

**How to apply:** Future releases must build both artifacts, retain the Apache SPA fallback and `/api` proxy rules, force HTTP to redirect to the canonical HTTPS domain before those rules run, and restart the private API service after replacing its production build. Always create a remote web-root backup before changing the published static files. Extract static release archives into a staging directory owned by the cPanel account, then copy them into the web root; root-owned staging prevents cPanel-account extraction. Keep `index.html` non-cacheable while retaining hashed asset caching so rapid releases cannot mix old HTML with new bundles.