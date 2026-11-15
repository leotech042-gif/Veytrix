# Veytrix Mobile

Android-first React Native app built with Expo, with iOS support.

## Run locally

1. From the repository root, run `pnpm install`.
2. Copy `.env.example` to `.env` in this folder.
3. Set `EXPO_PUBLIC_API_URL`:
   - Android emulator: `http://10.0.2.2:4000/api`
   - Physical phone: use your computer's LAN IP, for example `http://192.168.1.10:4000/api`.
4. Start the API and configure the market-data and Finnhub fundamentals providers.
5. Run `pnpm mobile` from the repository root.

## App screens

- Terminal: live quote, real historical candles, bid/ask/spread, latest signals and upcoming events.
- Markets: instruments and quotes discovered from the configured market-data provider.
- Analysis: directional signals returned by the existing Veytrix signal engine.
- Fundamentals: economic calendar, actual/forecast/previous values, impact, currency bias and affected pairs.
- Signal Room: returned setups and directional bias.
- Settings: device theme selection, market-provider status, and workspace preferences.

The app uses the existing API routes. It does not generate sample prices, fabricate events, or invent signals. Missing provider data is shown as an honest empty state. Order execution remains disabled until secure broker authentication and execution are implemented.
