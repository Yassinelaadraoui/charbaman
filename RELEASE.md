# Releasing Charbaman

The game, its store configuration and its store listing are ready. These steps need your accounts, your
devices or your decisions, so only you can do them. Do them in order; each takes minutes, except the store
reviews.

## 1. Fill in your contact address (5 minutes)

The stores require a way for players to reach you about their data.

- `src/config.ts`: set `CONTACT_EMAIL` (it appears in Settings › About › Privacy).
- `store/privacy-policy.html`: replace the three `[developer contact email]` placeholders.
- Host the privacy policy somewhere public. The quickest is GitHub Pages: repository Settings › Pages › deploy
  from the `main` branch; the page is then at `https://<you>.github.io/charbaman/store/privacy-policy.html`.

## 2. Accounts

- Expo account (free): https://expo.dev/signup
- Apple Developer Program ($99 a year): https://developer.apple.com/programs/
- Google Play Console ($25 once): https://play.google.com/console/signup

Google Play note: new personal developer accounts must run a **closed test with at least 12 testers for 14
days** before they can publish to production. Start that as soon as you have a build (step 5).

## 3. Link the project to EAS

```bash
npx eas-cli@latest login
npx eas-cli@latest init        # adds your projectId and owner to app.json; commit that change
```

The bundle identifier and package name are `com.yassine.charbaman` (in `app.json`). They can never change after
the first upload, so change them now if you want a different one.

## 4. Online leaderboard (optional)

Without it the game keeps scores on the phone only, and both privacy questionnaires become "no data collected".
To turn it on:

1. Create a Firebase project, add a Web app, enable Cloud Firestore (README › Firebase leaderboard).
2. Deploy the rules: `npx firebase-tools deploy --only firestore:rules`.
3. Give the builds the config. Local `.env` files are not uploaded to EAS, so add each value from `.env.example`
   as an EAS environment variable (plain text, it is a public web config):
   `npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_FIREBASE_API_KEY --value ...`
   (repeat for each variable, and for `preview` too).

## 5. Test builds on real phones

So far the game has been tested in the web build and by the headless bot (`npm test`), not on a phone.

```bash
npx eas-cli@latest build --profile preview --platform android   # an APK you can install directly
npx eas-cli@latest build --profile preview --platform ios       # needs your iPhone registered: eas device:create
```

Check on at least one older Android phone and one iPhone:

- [ ] Music starts on the title screen; sound, music and vibration switches work and are remembered
- [ ] A whole city plays smoothly; try Settings › Graphics › Fast on the older phone
- [ ] Locking the phone or getting a call pauses the run; the back button pauses it on Android
- [ ] The HUD clears the notch and the home bar
- [ ] French and Arabic read correctly (Settings › Language)
- [ ] Posting a score works (if Firebase is on)
- [ ] No warnings flood the logs (`npx expo start`, then open the build); the earlier expo-gl warnings are silenced

## 6. Production builds and submission

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios       # uploads to App Store Connect / TestFlight
npx eas-cli@latest submit --platform android   # uploads to the Play internal track (see eas.json)
```

Version numbers are managed by EAS (`appVersionSource: remote`, `autoIncrement`), so each production build gets a
new build number automatically. Raise `version` in `app.json` for each public update.

## 7. Store pages

Everything to paste is in `store/listing.md`: names, subtitles, descriptions and keywords in English, French and
Arabic (all within the limits), plus the answers for the age rating, App Privacy and Data safety forms.
Screenshots are in `store/screenshots/`, the Play feature graphic is `store/feature-graphic.png`.

App Review notes: "No login required. Tap Play the Cities, then Casablanca."

## 8. Things worth a second look before launch

- **Names and brands.** "Charba" and the hero are original, and the game is inspired by the 1999 game Pepsiman
  without using its name or art. If "Charba" is, or becomes, a real drink brand in Morocco, check with them.
- **The 200 dirham note** is a stylised 3D model of real currency; banknote images are usually fine in games, but
  you can swap it for a generic coin pile if you prefer to avoid the question.
- **The danger signs** before each chase use a real landmine-warning design (skull and "خطر ألغام"). Given the real
  minefields in the south of Morocco, you may want a lighter sign (for example "Attention: bouteille géante !").
- **Non-commercial models** (cat, pigeon, seagull) and the ripped lamppost are no longer in the game; they are
  parked in `extras/noncommercial-models/` in case you get a commercial licence later.
- **Expo Router.** The project template recommends Expo Router; this game uses a simple screen switch in
  `App.tsx`, which is all a game of this size needs. There is no need to migrate before launch.
