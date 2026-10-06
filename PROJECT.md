# Project: Dream Caravan (کاروان رؤیاها) Upgrade

## Architecture
Dream Caravan is an offline-capable, zero-dependency runtime 2.5D web game built with TypeScript, Three.js, and Vite.
- **Rendering & Presentation (`src/main.ts`, `src/world.ts`, `src/garden.ts`, `src/particles.ts`)**: Three.js isometric 2.5D scene graph with billboarding 8-directional character sprites, PCF soft shadows, procedural ribbons, and particle systems.
- **Atmosphere & Ambience (`src/ambience.ts`)**: Deterministic 18-minute active session cycle transitioning across morning, day, evening, and night with solar orbit and atmospheric fog.
- **Audio Synthesizer Engine (`src/audio.ts`)**: Pure Web Audio API procedural synthesis generating felt piano arpeggios, crystal chimes, pentatonic harmonies, and ambient wind, rain, and water flows.
- **Gameplay & Companions (`src/main.ts`, `src/directions.ts`)**: Player movement, camera controls, companion AI (Angel & Gourastakh), hand-holding traversal, free soaring flight state machine, and emotional affection menus.
- **State & Persistence (`src/state.ts`)**: Deterministic state machine with Local Save v1 persistence, backward compatibility, and zero-stress mechanics (no penalties, rot, or timers).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Procedural Web Audio Synth | Felt piano & crystal chimes using Web Audio API | M1 | ORIGINAL_REQUEST §R3 |
| 2 | Ambient Water Soundscape | Flowing water murmur near pond & stream | M1 | ORIGINAL_REQUEST §R3 |
| 3 | Interactive Chime Triggers | Audio hooks for hand-holding, flight, blooms, and hugs | M1 | ORIGINAL_REQUEST §R3 |
| 4 | Ambient Dust & Starry Night Dome | Floating light dust motes and starry night sky dome | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Procedural Particle & Ribbon Pools | Pre-allocated buffer geometries for light ribbons, stars, and footprints | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Diffused Ground Shadow Projection | Ground-pinned circular shadow with altitude scaling | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Hand-holding Traversal | Side-by-side sync walking, luminous connector beam, glowing footsteps | M3 | ORIGINAL_REQUEST §R1 |
| 8 | Free Synchronized Soaring | 'F' key & HUD flight button, altitude lift, camera tracking, weightless landing | M3 | ORIGINAL_REQUEST §R1 |
| 9 | Emotional Companion AI & Menu | Idle linger reactions (4-5s), expanded intimacy menu with non-blocking execution | M3 | ORIGINAL_REQUEST §R1 |
| 10 | Zero-Stress & Responsive Stability | Local Save v1 integrity, mobile 390px action bar compliance (`box.y < 40`) | M3 | ORIGINAL_REQUEST §R4 |
| 11 | Acceptance & Verification Suite | Passing `npm test`, `npm run verify-art`, `npm run build`, and Playwright E2E | M4 | ORIGINAL_REQUEST Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Audio Harmony Engine | Procedural Web Audio synth (`src/audio.ts`, piano, chimes, water, tests) | none | DONE |
| M2 | Visual Fidelity & Particle Systems | Ambient light motes, night stars, ribbon/particle pools (`src/particles.ts`) | none | IN_PROGRESS |
| M3 | Couple Interactions & Soaring | Hand-holding traversal, flight 'F', camera tracking, companion menu & AI | M1, M2 | PLANNED |
| M4 | Final Acceptance & Verification | Full verification (`npm test`, `npm run verify-art`, `npm run build`, E2E) | M3 | PLANNED |

## Interface Contracts
### `src/audio.ts` ↔ `src/main.ts`
```typescript
export interface AudioEngine {
  enable(context?: AudioContext): void;
  updateAmbience(windFactor: number, rainFactor: number, waterDistance: number): void;
  playHandholdChime(): void;
  playFlightTakeoff(): void;
  playFlightLanding(): void;
  playBloomChime(): void;
  playEmbraceHarmony(): void;
}
```

### `src/particles.ts` ↔ `src/main.ts`
```typescript
export interface VisualFXSystem {
  update(dt: number, now: number): void;
  updateRibbonTrails(angelPos: T.Vector3, gorPos: T.Vector3, flying: boolean): void;
  spawnFootstepGlow(position: T.Vector3): void;
  setHandHoldConnection(angelHand: T.Vector3, gorHand: T.Vector3, active: boolean): void;
  setNightIntensity(nightFactor: number): void;
}
```

## Code Layout
- `src/audio.ts`: Procedural Web Audio synthesis (felt piano, crystal chimes, water noise generator).
- `src/audio.test.ts`: Unit tests validating audio note frequencies, scale tables, and synthesizer lifecycle.
- `src/particles.ts`: Pre-allocated Three.js particle buffers, celestial star dome, ribbons, and glowing footprints.
- `src/main.ts`: Integration of traversal modes, flight state machine, companion affection menu, and loop dispatch.
- `src/style.css`: Flight button HUD and companion modal responsive layout.
- `src/state.ts`: Preserved Local Save v1 engine.
- `public/art/reference/*`: IMMUTABLE reference face files verified by SHA-256 in `scripts/verify-art.mjs`.
