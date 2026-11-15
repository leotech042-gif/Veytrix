# Veytrix Mobile

Android-first React Native app built with Expo, with iOS and browser preview support.

## Browser preview

1. From the repository root, run `pnpm install`.
2. Start the API with `pnpm --filter @veytrix/api dev`.
3. In another terminal, run `pnpm mobile:web`.
4. Open the local URL printed by Expo (usually `http://localhost:8081`).

The API CORS configuration includes the local Expo web origin.

## Android and iOS

1. From the repository root, run `pnpm install`.
2. Copy `.env.example` to `.env` in this folder.
3. Set `EXPO_PUBLIC_API_URL` for your device:
   - Android emulator: `http://10.0.2.2:4000/api`
   - Physical phone: use your computer's LAN IP.
   - iOS simulator: `http://localhost:4000/api`
4. Start the API and configure the market-data and Finnhub fundamentals providers.
5. Run `pnpm mobile` and open the project in Expo Go or an emulator.

## App screens

- Terminal: selected instrument, historical candles, bid/ask/spread, latest signals and upcoming events.
- Markets: instruments and quotes returned by the configured market-data provider.
- Analysis: technical signals returned by the existing Veytrix signal engine.
- Fundamentals: economic calendar, release categories (jobs/NFP, inflation/CPI, rates, GDP and central-bank events), actual/forecast/previous values, release surprise, volatility, event analysis, affected pairs, event-based currency bias and the latest Finnhub market headlines.
- Signal Room: returned setups and directional bias.

The API supplies economic releases and general market headlines through Finnhub. News is displayed as provider headlines and summaries; the current provider does not return a reliable per-headline market-impact score. Currency bias shown here is calculated from returned event releases, not a standalone currency-strength index.

The app does not generate sample prices, fabricate events, or invent signals. Missing provider data is shown as an honest empty state. Order execution remains disabled until secure broker authentication and execution are implemented.
