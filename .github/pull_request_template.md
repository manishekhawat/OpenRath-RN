## What changed

<!-- One change per pull request. Say what it does and why. -->

## Tried on

<!-- The unit or phone, and its Android version. Say so if it wasn't tried on a device. -->

## Checklist

- [ ] `npm test`, `npm run typecheck` and `npm run lint` pass
- [ ] Tried on a real unit or phone (named above)
- [ ] A new feature has a switch in `src/logic/features.ts` and its code checks `Features.on(prefs, id)`
- [ ] A new feature has a line in `CHANGELOG.md`
- [ ] New user-facing text goes through `t()` or `f()` and has its Hindi
- [ ] Logic that needs no screen lives in `src/logic` with a test
- [ ] Generated files (`src/map/mapHtml.ts`, `src/data/hi.json`) were regenerated, not hand-edited
