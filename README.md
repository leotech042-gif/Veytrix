# Veytrix

Veytrix is a forex dashboard foundation built as a TypeScript monorepo. The market-data API is intentionally unconfigured: the interface displays no prices until a licensed provider is selected, configured, and connected.

## Requirements

- Node.js 20.9 or newer
- Corepack and pnpm 12.16 or newer

## Getting started

1. Copy `.env.example` to `apps/web/.env.local` and `apps/api/.env`. Adjust `NEXT_PUBLIC_API_URL` and `WEB_ORIGIN` if your local ports differ. Set social URLs only to official profiles; unconfigured links are hidden.
2. Install dependencies with `corepack pnpm install`.
3. Start both apps with `corepack pnpm dev`.

The dashboard runs at `http://localhost:3000`; the API runs at `http://localhost:4000/api`.

## Current integration status

- `GET /api/health` reports API availability.
- `apps/api/src/app.module.ts` currently binds the Tiingo market-data adapter. It reports `unconfigured` unless `TIINGO_API_KEY` is set in the API environment.
- `GET /api/market-data/instruments`, `/quotes`, and `/history?instrument=...&timeframe=...` use the configured adapter. Provider credentials remain server-side.
- `apps/api/src/market-data/market-data-provider.ts` defines the provider adapter contract. Finnhub and mock adapter implementations also exist, but are not the adapter currently bound in `AppModule`.
- The Charts page embeds TradingView's Advanced Chart widget and uses TradingView's own market data, independent of the configured API quote feed. Supported instruments are mapped to TradingView symbols where possible; confirm that the widget's data and terms meet your intended use.
- If another provider is considered, confirm that its account/license permits the intended display and distribution. Never send provider keys in chat or commit them; use server-only configuration.
- The Markets page is independent of broker login and is the quotes/watchlist surface. It only displays instruments and quote fields returned by a configured provider; the responsive mobile view uses quote cards.
- The Charts page uses TradingView's hosted chart, including its built-in drawing tools, while the dashboard and Markets page continue to use the configured provider's quote data. Chart theme follows the app's resolved light/dark theme.
- Appearance, chart preferences, and favourites are stored in browser local storage. They are not synced to a user account. Broker credentials are never stored there.
- The dashboard is the only route that renders the site footer. Mobile navigation uses a bottom bar with a separate “More” menu.
- X is configured from the supplied handle. Other social links remain hidden until official URLs are supplied.
- Signals are unavailable unless a real analysis provider is configured. No demo signals are returned by the current API binding.
- There is no database, authentication/session system, email-verification or password-reset delivery, broker connection, or order execution. Authentication requires a selected identity strategy, persistent database/session storage, and a transactional email service (or a hosted identity provider). Broker features require a separately selected broker and its public API documentation.

Provider credentials must remain server-side. Do not commit credentials or present sample values as live market data.
