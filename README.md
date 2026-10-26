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

The hero is a rigged, skinned model (`src/game/three/heroRigged.ts`). The run, jump, slide and skateboard poses
are written in code in `src/game/three/hero.ts`, which rotates the skeleton's bones every frame, so any rigged
model works without animation clips. To swap in another rigged GLB (ideally a Biped or Mixamo skeleton, under
about 10k triangles):

```bash
python3 scripts/convert-rigged-hero.py path/to/hero.glb src/game/three/heroRigged.ts --credit "..."
```

Then check the bone names in `BONE_OF` in `hero.ts` match the new skeleton.

## Animated props

The old man, pigeons and gulls are baked as a few poses of one mesh with one texture, and the game blends
between them (morph targets). Pose the skinned model at a few times with `skin-to-static.py`, then bake the
first pose and pass the rest with `--frames`:

```bash
for i in 0 1 2 3 4 5 6 7; do python3 scripts/skin-to-static.py walk.glb /tmp/walk$i.glb 0 $(python3 -c "print(0.36 + $i * 0.18)"); done
python3 scripts/bake-model.py /tmp/walk0.glb src/game/three/models/oldMan.ts OLD_MAN --tris 1500 --atlas 512 \
  --quality 90 --lift 1.25 --lock-xz --frames /tmp/walk{1,2,3,4,5,6,7}.glb
```

`--lock-xz` keeps a walk on the spot; the game moves the walker instead, at the clip's own speed so the feet
don't slide (`OLD_MAN_CYCLE` in `props.ts`).

## Credits

- Taxi: "Hong Kong Taxi" (https://sketchfab.com/3d-models/hong-kong-taxi-b4e5ecc01a6e41e9a383302e728c8535)
  by Goedude (https://sketchfab.com/Goedude), licensed under CC-BY-4.0. Decimated and recoloured per city
  with `scripts/convert-taxi.py`.

The other models were simplified and their textures baked into small atlases with `scripts/bake-model.py`
(files in `src/game/three/models/`). All are licensed under CC-BY-4.0 and come from Sketchfab:

- "Hassan II Mosque: Casablanca Architectural", "Casablanca Derby House: Wydad & Raja Culture",
  "Moroccan Popular House - Casablanca Style", "Old Moroccan Neighborhood House - Detailed Asset" and
  "morocco house high quality" by abdlilah ben (https://sketchfab.com/m152027350)
- "Hassan Tower - Rabat, Morocco" by Ysn.Aitaddi (https://sketchfab.com/Ysn.Aitaddi), used as the Marrakech skyline tower
- "Moroccan City Gate (Bab)", "Moroccan Mixed Facade" and "Moroccan Boy" (Stylized Tier I) by Mrigua Mohamed (https://sketchfab.com/mrigua)
- "Moroccan culture" by medbunz (https://sketchfab.com/medbunz), city walls
- "dacia lodgy 2024 moroccan" by abdelghani.0 (https://sketchfab.com/abdelghani.0), repainted as a grand taxi
- "Moroccan National Police Car Low Poly Game Ready" by FF 3DMODEL (https://sketchfab.com/threedjaj)
- "Stylized Palm Tree" by KrazzyElf (https://sketchfab.com/KrazzyElf)
- "Maple tree" by atrodler (https://sketchfab.com/atrodler)
- "Zoonomaly - Lampost Bulb" by Haggy the model ripper (https://sketchfab.com/ashrafmanir). The uploader's name suggests it was
  ripped from the game Zoonomaly, so replace it before a store release.
- "A Moroccan style table" by A9908244 (https://sketchfab.com/A9908244)
- "Low Poly Apple box" by Pixxellab (https://sketchfab.com/Pixxellab), recoloured
- "A bottle juice" by Spacesea (https://sketchfab.com/-Spacesea-), used as the Charba bottle

- "Traditional Moroccan Terracotta Tagine" by laabidate (https://sketchfab.com/laabidate)
- "Majmar - Stylized Prop Tier I" by Mrigua Mohamed (https://sketchfab.com/mrigua)
- "fruit market stall" by Isa_van_den_Bosch (https://sketchfab.com/Isa_van_den_Bosch)
- "Realistic Animated Donkey 3D Model" by WildMesh 3D (https://sketchfab.com/WildMesh_3D), posed with
  `scripts/skin-to-static.py`
- "Chicken" by MAXDESIGN-3D (https://sketchfab.com/MAXDESIGN)
- "Bus Stop" by evtushenko (https://sketchfab.com/evtushenko)
- "Landmine sign" by AbouAli (https://sketchfab.com/abouali), the danger signs before the chase
- "Indian Old man walking" by anandmohan662 (https://sketchfab.com/anandmohan662)
- "Pigeon" by LostBoyz2078 (https://sketchfab.com/LostModels2025), licensed **CC-BY-NC-4.0**, and "Seagull" by kenchoo
  (https://sketchfab.com/kenchoo), licensed **CC-BY-NC-SA-4.0**. These two are non-commercial only, so replace them
  before selling the game or showing ads.

Hero: "Spiderman Multiverse(Textured)(Rigged)" by CAPTAAINR (https://sketchfab.com/CAPTAAINR), CC-BY-4.0,
converted with `scripts/convert-rigged-hero.py` (repainted orange and silver, emblem removed) and animated in code
(`src/game/three/hero.ts`). It is still a Spider-Man fan model, so replace it with an original character before a
store release.

Sound effects and particle sprites: Kenney (https://kenney.nl) Impact Sounds, Interface Sounds, RPG Audio and
Particle Pack, CC0. Converted to m4a in `assets/sounds/` and to `src/game/three/particleTextures.ts`.

The 200 dirham note is "200Dhs Moroccan money" by lordmehemedz (https://sketchfab.com/lordmehemedz), under the
Sketchfab Standard license (allowed inside a game, not for redistribution as a model).

## Code map

- `src/game/engine.ts` game rules: physics, collisions, track generation, chase
- `src/game/three/scene.ts` 3D renderer: camera, curved street, skyline, pooled props, giant bottle
- `src/game/three/hero.ts` hero rig built from the model parts, plus procedural animation
- `src/game/three/props.ts` low-poly obstacles, bottles, houses, palms and landmarks
- `src/game/sprites.tsx` 2D bottle icon used in menus and the HUD
- `src/game/cities.ts` stage definitions
- `src/screens/*` title, city select, game, results, leaderboard, how to play
- `src/services/firebase.ts`, `src/services/storage.ts` online and local scores
