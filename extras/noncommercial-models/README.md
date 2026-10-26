# Models kept out of the game

These baked models are not shipped: they are not in `src/`, so the bundler never sees them.

| File | Model | Why it is out |
| --- | --- | --- |
| `cat.ts` | "Cat Walk" by LostBoyz2078 | CC-BY-NC-4.0: no commercial use |
| `pigeon.ts` | "Pigeon" by LostBoyz2078 | CC-BY-NC-4.0: no commercial use |
| `seagull.ts` | "Seagull" by kenchoo | CC-BY-NC-SA-4.0: no commercial use |
| `lamppost.ts` | "Zoonomaly - Lampost Bulb" by Haggy the model ripper | ripped from a commercial game |

The game uses its own cats, pigeons, gulls and lamps built from simple shapes in `src/game/three/props.ts`.
If you get a commercial licence for one of these models, move its file back to `src/game/three/models/` and
use it from `props.ts` the way the old man is used (`model(...)` plus `animate(...)`).
