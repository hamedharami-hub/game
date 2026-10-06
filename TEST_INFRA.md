# E2E Test Infra: Dream Caravan (کاروان رؤیاها)

## Test Philosophy
- Opaque-box, requirement-driven derived from `ORIGINAL_REQUEST.md` (R1, R2, R3, R4).
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.
- Zero reliance on implementation internals.
- Verification channels: Node test runner (`npm test`), art integrity (`npm run verify-art`), standalone build (`npm run build`), and browser validation.

## Feature Inventory
| # | Feature | Source | Tier 1 (Isolated) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---------|--------|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| 1 | Hand-holding Traversal | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 2 | Free Soaring & Gliding | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 3 | Companion Affection & Menu | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 4 | Atmospheric Fidelity & Particles | ORIGINAL_REQUEST §R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 5 | Web Audio Synthesis & Chimes | ORIGINAL_REQUEST §R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 6 | Zero-Stress Stability & Saves | ORIGINAL_REQUEST §R4 | ≥5 cases | ≥5 cases | ✓ | ✓ |

## Test Architecture
- **Unit & Audio Tests**: Node native runner `npm test` (`src/state.test.ts`, `src/ambience.test.ts`, `src/audio.test.ts`).
- **Art Asset Verification**: `npm run verify-art` (immutable reference faces and atlases).
- **Standalone Distribution**: `npm run build` producing offline `dist/play.html`.
- **Browser Playwright E2E**: Desktop (1440x900) and Mobile (390x844).

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Romantic Meadow Stroll | Hand-holding, footsteps, chimes, companion dialog | Medium |
| 2 | Flight Soaring Tour | Takeoff ('F'), camera tracking, gliding over pond, soft landing | High |
| 3 | Evening Garden Resting | Idle linger reaction, sitting/embrace, night stars, ambient sounds | Medium |
| 4 | Flower Bloom & Chime Melody | Planting, tending, bloom audio chimes, harvest motes | Medium |
| 5 | Legacy Save & Offline Journey | Save v1 load, offline growth, traversal state persistence | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature (isolated happy-path)
- Tier 2: ≥5 per feature (boundaries: zero movement, max bounds, quick toggles, empty saves)
- Tier 3: Pairwise combinations (e.g. flight + hand-holding, night + flight, companion menu + movement)
- Tier 4: ≥5 realistic complete gameplay loops
- Acceptance: 100% pass across all test suites, exit code 0.
