# Charbaman

An orange, Moroccan take on the 1999 PS1 auto-runner *Pepsiman*, built with Expo for iOS and Android.
Charbaman runs through Casablanca, Safi, Marrakech, Fes and Tangier collecting Charba bottles, and every city
ends with a chase from a giant rolling Charba bottle.

## Play it

```bash
npm install
npx expo start        # scan the QR code with Expo Go on your phone
```

Controls: drag left/right to steer (free steering, no lanes), swipe up or tap to jump, swipe down to slide.
On web: arrow keys / WASD, space to jump, P to pause.

## What is in the game

- 5 city stages with their own skyline, colours, taxis and difficulty, unlocked one after another
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

Scores live at `leaderboards/{endless|casablanca|safi|marrakech|fes|tangier}/scores`. Without a `.env`, the game
keeps working and the leaderboard shows scores saved on the phone.

## 3D hero model

The game renders in real 3D with three.js on `expo-gl` (works in Expo Go). The hero comes from
`assets/models/hero.obj`, a low-poly model split into 16 body parts (head, neck, torso, pelvis, upper arms,
forearms, hands, thighs, shins, feet) in a T-pose. Because every part is its own mesh, the run, jump and slide
animations are done by rotating joints in code, PS1 style, with no rigging needed.

To swap in another model split the same way:

```bash
python3 scripts/convert-hero.py path/to/model.obj src/game/three/heroMesh.ts
```

Current placeholder model: "3D Pepsiman" by ChristianDPS on Sketchfab, recoloured. It is a fan model of a
PepsiCo character, so replace it with an original Charbaman model before publishing to the stores.

## Credits

- Taxi: "Hong Kong Taxi" (https://sketchfab.com/3d-models/hong-kong-taxi-b4e5ecc01a6e41e9a383302e728c8535)
  by Goedude (https://sketchfab.com/Goedude), licensed under CC-BY-4.0. Decimated and recoloured per city
  with `scripts/convert-taxi.py`.

## Code map

- `src/game/engine.ts` game rules: physics, collisions, track generation, chase
- `src/game/three/scene.ts` 3D renderer: camera, curved street, skyline, pooled props, giant bottle
- `src/game/three/hero.ts` hero rig built from the model parts, plus procedural animation
- `src/game/three/props.ts` low-poly obstacles, bottles, houses, palms and landmarks
- `src/game/sprites.tsx` 2D bottle icon used in menus and the HUD
- `src/game/cities.ts` stage definitions
- `src/screens/*` title, city select, game, results, leaderboard, how to play
- `src/services/firebase.ts`, `src/services/storage.ts` online and local scores
