# Timing Fighter MVP

一個 2D 橫向、單人對 AI、低指令門檻的格鬥遊戲 MVP。核心重點是近身攻防猜拳、破綻懲罰、招架、揮空懲罰與 Counter，而不是複雜指令或長連段。

## Controls

- Move: `A/D` or `Left/Right`
- Light attack: `J`
- Heavy attack: `K`
- Block: hold `L`
- Parry / special: `I`
- Throw: `I + K`
- Toggle hitbox display: `H`
- Restart fight: `R`
- Skip tutorial / return from result: `Enter`

On the character select screen, press `1` / `2` or click a card to choose a fighter.

On touch devices, the game shows a landscape control layout with movement, four core buttons, and an extra throw button for mobile reliability.

## Scripts

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

When running inside this Codex desktop workspace, make sure the bundled Node.js path is first on `PATH` if your system Node is older.

## iPhone Offline Play

This project is set up as a Progressive Web App.

1. Deploy the site with the included GitHub Pages workflow.
2. Open the GitHub Pages URL in iPhone Safari.
3. Tap Share, then Add to Home Screen.
4. Launch the installed icon once while online so the service worker can cache the game.
5. After that first successful launch, the installed app can start offline from the Home Screen.

The offline cache includes the built Vite app shell, fighter sprite sheets, character portraits, sound effects, manifest, and iOS app icons.

## GitHub Pages

The workflow at `.github/workflows/deploy-pages.yml` builds and deploys `dist` whenever `main` is pushed. In the repository settings, set Pages to use GitHub Actions as the source.

## MVP Decisions

- Tech stack: Phaser 3 + TypeScript + Vite.
- First delivery: static website folder via `pnpm build`.
- Characters: two selectable fighters, a flat-top tactical soldier and an original female fighter named `女格鬥家`.
- Combat animation: every original action frame now has two additional in-between images. The male fighter plays 42 key poses + 84 transitions (126 frames), while the female fighter plays 40 key poses + 80 transitions (120 frames). All standing and walking images share a fixed body-height baseline, so motion never changes character scale. The six mobile-optimized sheets stay below common GPU texture limits.
- App icon: a cyan-vs-red colliding-fists emblem is supplied at 1024px master, 512px, 192px, Apple Touch 180px, and a separately padded Android maskable 512px size.
- Seamless arena: three repeating parallax tile layers use edge-safe textures and integer tile offsets so the infinite background loop has no visible seam.
- Campaign setup: choose 1, 3, 5, or 8 enemies and 75%-200% base enemy strength before selecting a fighter. Later enemies gain health, damage, faster reactions, and fewer AI mistakes.
- Shop: each victory before the final enemy awards coins. Spend them on max-health, punch-damage, or kick-damage upgrades; products and prices are centralized in `src/game/campaign.ts` for easy customization.
- Throw identity: the male soldier uses an original military grappling takedown; `女格鬥家` uses an original Kimura-style armlock finish. Throw attacker and throw victim are separate frames so any character pair can be composited at runtime.
- Combat presentation: optional visible active hitboxes during strikes/throws, optional hurtboxes while active, and impact sparks at the resolved hit position.
- Match: selected player fighter versus the other fighter as AI rival, single-round match.
- Round target: 30-45 seconds.
- Health/damage baseline: 100 HP, light 6, heavy 16, throw 14, heavy Counter 22.
- AI: simple readable state machine with delayed reactions and intentional mistakes.
- Assets: AI-generated low-resolution fighter sprite sheets with chroma-key removal; Kenney CC0 impact sounds.

## Audio Credits

Sound effects are selected from Kenney's **Impact Sounds** pack.

- Source: https://www.kenney.nl/assets/impact-sounds
- License: Creative Commons CC0
- Local license copy: `public/assets/audio/LICENSE-Kenney-Impact-Sounds.txt`
