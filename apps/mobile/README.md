# Veytrix Mobile

Android-first React Native app built with Expo SDK 58, with iOS support.

## Run locally

1. From the repository root, run `pnpm install`.
2. Copy `.env.example` to `.env` in this folder.
3. Set `EXPO_PUBLIC_API_URL`:
   - Android emulator: `http://10.0.2.2:4000/api`
   - Physical Android phone: use your computer's LAN IP, for example `http://192.168.1.10:4000/api`.
4. Start the API and configure its market-data provider.
5. Run `pnpm mobile` from the repository root, then open the project with Expo Go or a development build.

The terminal intentionally shows empty states when the API/provider has no real quotes or candles. It does not generate sample prices. Buy and sell are disabled until authenticated broker execution is implemented.
