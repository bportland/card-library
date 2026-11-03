# Card Library

A private Pokémon card collection tracker, hosted on GitHub Pages. Cards are stored in Firebase Firestore behind Google sign-in. Only the accounts listed in the Firestore security rules can read or change them.

Card images and market prices come from the free [TCGdex](https://tcgdex.dev) API. TCGdex has no prices for stamped cards, so a weekly GitHub Action (`.github/workflows/stamp-prices.yml`) copies those TCGplayer prices from [tcgcsv.com](https://tcgcsv.com) onto the `prices` branch, where the app reads them.

## Files

- `index.html`, `styles.css`, `app.js`: the app
- `firebase-adapter.js`: Firebase setup and data access
- `manifest.webmanifest`, `icon-*.png`: install to a phone home screen
- `tools/stamp_prices.py`: builds the stamped card price file for the weekly GitHub Action

The security rules, and any backup files, are kept out of this repository on purpose. The rules live in the Firebase console.
