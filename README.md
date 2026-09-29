# To do

A local-first task and calendar app with quick entry, day/week/month views, tags, repeating tasks, trash, and backups. The web app can be installed as a PWA.

New users see English by default. Existing language preferences are preserved; Chinese is available in Settings.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Without cloud sync, tasks live in this browser's IndexedDB. Clearing site data removes local tasks, so export backups from Settings periodically.

## Check and build

```sh
node tests/run.mjs
node node_modules/typescript/bin/tsc -b --force
npm run build
```

The production build is written to `dist/`.

## Optional cloud sync

1. Create your own Supabase project and account.
2. Run [`supabase/schema.sql`](supabase/schema.sql) only on a **new** project. It is not a migration for an existing database.
3. Copy `.env.example` to `.env.local` and enter the project URL and **anon/public** key.
4. Restart the development server and sign in with your project account.

Sync uses the newer `updatedAt` version when both sides have an item. Attachments remain on the device where they were added. Never put a Supabase service role key in frontend configuration. `.env.local` is ignored by Git.

## Optional AI organization

AI is off by default. Enter your own model provider API key in Settings to organize longer text or voice input. Without it, local rules are used. The key stays in this browser's local settings; it is not included in this repository or its build. When AI is enabled, text is sent to the model provider and may incur charges. Avoid entering a personal key on a shared device.

Voice recognition uses the browser's Web Speech API and depends on browser support.

## Windows desktop shell

`src-tauri/` contains a Tauri 2 desktop shell. This public copy builds and embeds the local web app; run `npm run tauri:dev` for development or `npm run tauri:build` for an installer. Change the example application identifier before distributing your own desktop edition. A different identifier creates a separate app whose local data does not migrate automatically.

## Project layout

- `src/lib/`: dates, storage, sync, and task actions.
- `src/components/`: interface and calendar views.
- `src/store/`: interface and settings state.
- `tests/`: logic regression tests.
- `supabase/schema.sql`: schema for a new sync project.

## Privacy

Do not commit personal keys, `.env.local`, local data, or build output. Enter an AI key in the app's Settings on your own device. The public project contains no preset personal AI key.
