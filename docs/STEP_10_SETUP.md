# Step 10 — React → Express → MongoDB

This development-only demo saves synthetic notes to MongoDB and fetches them on page load. It does not yet implement login or patient data. Both development servers bind to localhost; do not deploy this unauthenticated demo publicly.

## What you need to do (Windows / VS Code)
1. Install Node.js 22.12 or newer and MongoDB Community Server locally. Ensure the MongoDB service is running. This local setup needs no paid API or cloud subscription.
2. Clone the repository (or run git pull in your existing copy), then open its folder in VS Code.
3. In the root terminal run:
   ```powershell
   npm ci
   Copy-Item server/.env.example server/.env
   ```
   The default URI uses your local MongoDB database, medimate_demo. Keep .env private.
4. Start the API:
   ```powershell
   npm run dev:server
   ```
5. In a second terminal in the same root folder:
   ```powershell
   npm run dev:client
   ```
6. Open the localhost URL printed by Vite (normally http://127.0.0.1:5173).
7. Save a note such as "Team connection test", then refresh the browser.
8. Restart the API and reload again. The saved note should still appear.
9. Send the team the result or any error text, without sharing your database credentials.

macOS/Linux: use cp server/.env.example server/.env in place of Copy-Item.

## Verification checklist
- GET http://127.0.0.1:3001/api/health returns database: connected.
- Saving valid text returns HTTP 201 and a MongoDB record ID.
- Browser refresh and backend restart retain the saved record.
- Empty/whitespace or over-120-character titles return HTTP 400.
- Stop MongoDB: requests show a clear error rather than a false saved result.
- Restart MongoDB and reload to recover.
- npm run build completes.

The default Vite proxy expects port 3001. If you change PORT, update client/vite.config.js too. The list displays the latest 100 notes.

## Step status
Implementation is prepared. A successful live database persistence check is required before marking Step 10 complete. No MongoDB credentials or server were supplied in the assistant workspace.

## Architecture
Browser React form → same-origin /api proxy → localhost Express API → Mongoose → local MongoDB.
Only title is accepted from the request. Timestamps and record IDs are generated on the server/database side.
