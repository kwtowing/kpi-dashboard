# KW Towing Dynamic

A KPI dashboard for operational and financial reporting — daily, weekly, monthly, and annual —
built with Next.js, deployed on Vercel. Data comes in through manual entry, CSV import, or
connected APIs (see `src/lib/connectors/README.md`).

You don't need to write any code to get this live. Follow the steps below in order.

## 1. Push this code to GitHub

1. Go to [github.com/new](https://github.com/new) and create a new repository (any name, e.g. `kpi-dashboard`). Leave it empty — don't add a README there.
2. On your computer, open a terminal in this folder and run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```
   (Replace the URL with the one GitHub shows you after creating the repo.)

## 2. Import it into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and choose "Import Git Repository."
2. Select the repository you just pushed. Leave all settings at their defaults — Vercel
   detects Next.js automatically.
3. Click **Deploy**. It will fail once, and that's expected — you haven't added a database yet.

## 3. Add a database

1. In your new Vercel project, go to the **Storage** tab.
2. Click **Create Database** and choose **Postgres** (Vercel's Postgres is powered by Neon —
   either the "Postgres" or "Neon" option works).
3. Once created, connect it to your project — Vercel automatically adds a `DATABASE_URL`
   environment variable for you.
4. Go to the **Deployments** tab and redeploy (click the "..." menu on the latest deployment →
   **Redeploy**).

## 4. Finish setup

1. Open your live site (Vercel gives you a `.vercel.app` URL).
2. You'll see a "One step left" screen — click **Set up database**. This creates the tables
   the app needs. You only do this once.
3. You're live. Use **Add entry** for manual data, **Import CSV** for spreadsheets, and check
   **Data sources** to see everything that's feeding the dashboard.

## Local development (optional)

If you want to run it on your own computer before deploying:
```
npm install
cp .env.example .env.local   # then edit .env.local with a real Postgres connection string
npm run dev
```
Visit `http://localhost:3000` and click **Set up database** the first time.

## Adding a live API connector later

Manual entry and CSV import work out of the box. To pull data automatically from an
accounting tool, CRM, or other API, see `src/lib/connectors/README.md` — or just ask
Claude Code: *"add a connector for [tool name] that syncs into the transactions table."*
It follows the same pattern already set up here, so it plugs straight in.
