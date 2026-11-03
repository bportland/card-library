# Card Library

A private Pokémon card collection tracker, hosted on GitHub Pages. Cards are stored in Firebase Firestore behind Google sign-in. Only the accounts listed in the Firestore security rules can read or change them.

## Files

- `index.html`, `styles.css`, `app.js`: the app
- `firebase-adapter.js`: Firebase setup and data access
- `manifest.webmanifest`, `icon-*.png`, `icon.svg`: install to a phone home screen
- `tools/stamp_prices.py` and `.github/workflows/stamp-prices.yml`: a weekly GitHub Action that builds the stamped card price file on the `prices` branch

The security rules, and any backup files, are kept out of this repository on purpose. The rules live in the Firebase console.

## Sources and attributions

- **[TCGdex](https://tcgdex.dev)**: card search, set lists, card details, card images and market prices, through its free API (`api.tcgdex.net`) and image host (`assets.tcgdex.net`). The prices TCGdex reports come from [TCGplayer](https://www.tcgplayer.com).
- **[TCGplayer](https://www.tcgplayer.com)**: the source of the market prices shown in the app, for regular, patterned and stamped cards.
- **[TCGCSV](https://tcgcsv.com)**: a daily copy of TCGplayer's price data. TCGdex has no prices for stamped cards, so the weekly GitHub Action downloads those from TCGCSV (eight small files a week) and saves them on the `prices` branch for the app to read.
- **[Limitless TCG](https://limitlesstcg.com)**: card images for the basic energy sets (Mega Evolution Energy and Scarlet & Violet Energy), which TCGdex has no images for.
- **[Firebase](https://firebase.google.com)** (Google): sign-in and the shared card database.
- **[GitHub Pages](https://pages.github.com)** and **[GitHub Actions](https://github.com/features/actions)**: hosting and the weekly price job.
- **[Google Fonts](https://fonts.google.com)**: the [Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible), [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) and [DM Mono](https://fonts.google.com/specimen/DM+Mono) typefaces, under the SIL Open Font License.

Each of these services has its own terms of use, which apply to the data and images they provide.

## Built with Claude

This project is being built with the help of [Claude](https://claude.ai), an AI assistant made by [Anthropic](https://www.anthropic.com). Much of the code, design and documentation was written by Claude under my direction, and I review and test the changes.

## License

The code in this repository is licensed under the [GNU General Public License v3.0](LICENSE). The license covers only the code written for this project. It does not cover Pokémon names, card images, artwork, logos, prices or other data from the sources above, which remain the property of their owners and are subject to their own terms. The fonts are licensed separately under the SIL Open Font License.

## Legal notice

This is an unofficial fan project, made for personal, non-commercial use. It is not produced, endorsed, supported or affiliated with Nintendo, Creatures Inc., GAME FREAK inc., The Pokémon Company, The Pokémon Company International, TCGplayer, or any of the other services listed above.

Pokémon, the Pokémon Trading Card Game, and all related names, characters, card images, artwork and logos are trademarks and copyrights of Nintendo, Creatures Inc., GAME FREAK inc. and The Pokémon Company. All other trademarks, data and images belong to their respective owners. All rights remain with them, and no claim is made to any of them. Card images and prices are shown only to help identify and keep track of cards in a personal collection.

If you are a rights holder and would like something removed, please open an issue in this repository.
