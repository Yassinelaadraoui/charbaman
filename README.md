# Charbaman

An orange, Moroccan take on the 1999 PS1 auto-runner *Pepsiman*, built with Expo for iOS and Android.
Charbaman runs through Casablanca, Marrakech, Fes and Tangier collecting Charba bottles, and every city
ends with a chase from a giant rolling Charba bottle.

## Play it

```bash
npm install
npx expo start        # scan the QR code with Expo Go on your phone
```

Controls: drag left/right to steer (free steering, no lanes), swipe up or tap to jump, swipe down to slide.
On web: arrow keys / WASD, space to jump, P to pause.

## What is in the game

- 4 city stages with their own skyline, colours, taxis and difficulty, unlocked one after another
- Endless mode that cycles through the cities and speeds up
- 3 hits of health, 3 lives, checkpoints, an extra life every 25 bottles
- Skateboard power-up (speed) and the tajine-on-the-head gag that flips your controls
- Giant Charba chase at the end of each city (get hit and it rolls closer)
- Obstacles: crates of oranges (jump), market awnings (slide), petit taxis, scooters, donkey carts
- Online leaderboard per mode with Firebase Firestore, with an on-device leaderboard as fallback

## Firebase leaderboard

1. Create a Firebase project, add a **Web app**, and enable **Cloud Firestore**.
2. `cp .env.example .env` and paste the web app config values.
3. Deploy the rules: `npx firebase-tools deploy --only firestore:rules` (rules are in `firebase/firestore.rules`).
4. Restart `npx expo start`.

Scores live at `leaderboards/{endless|casablanca|marrakech|fes|tangier}/scores`. Without a `.env`, the game
keeps working and the leaderboard shows scores saved on the phone.

## Code map

- `src/game/engine.ts` game rules: physics, collisions, track generation, chase
- `src/game/World.tsx` pseudo-3D renderer (road, curves, skyline, sprites)
- `src/game/Hero.tsx`, `src/game/sprites.tsx` the hero, obstacles and scenery, drawn with plain views
- `src/game/cities.ts` stage definitions
- `src/screens/*` title, city select, game, results, leaderboard, how to play
- `src/services/firebase.ts`, `src/services/storage.ts` online and local scores
