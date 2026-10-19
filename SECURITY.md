# Security

## Reporting a problem

Please report security problems privately to the maintainer through GitHub, rather than in a public issue. Include the version (Settings > About and licences), the unit or phone you saw it on, and steps to reproduce. You can expect a reply within a week.

## What the app does to stay safe

- **The map** runs in a WebView that is given the app's own page (`assets/map/map.html`, built into `src/map/mapHtml.ts`) under the made-up address `https://openrath.local`. `originWhitelist` holds that origin alone, every other address is handed to the system browser instead of loaded, multiple windows are off, and the WebView's own geolocation is off: the car's position reaches the page only through the bridge. The bridge answers a fixed list of calls and nothing else: `speak`, `navigate`, `navigateOffline`, `setNavMode`, `parkHere`, `call`, `saveService`, `destination`, `savedPlace`, `bigQr`, `routeRain` and `voice`. Since 1.43 a tapped phone number on the map asks the driver before it dials.
- **Theme packs** are unpacked flat: an entry with a path separator or `..` in it is skipped, and a file over 8 MB is skipped, so a crafted .zip cannot write outside the theme's own folder.
- **Backups** leave out the valet PIN, the hotspot password and the key-action token, and a restore never brings them back. A restore takes only `custom/` entries whose name is a plain picture name, and a doctored value is refused rather than stored, leaving the setting as it was. It asks first, naming the file and its date.
- **The valet PIN** locks entry for a minute after five wrong tries.
- **Network:** everything the app fetches itself is https. The usage report refuses any address that is not https, and there is a test for it.
- **Crash notes and the errors the app carried on from** stay in the app's own storage, with web addresses and position-like numbers stripped out, and are shown in Settings > Help > Diagnostics. They are never sent anywhere.
- **Android's own cloud backup is off** for this app (`allowBackup: false`), so its data is not copied to a Google account.
- There is no server, account, analytics or remote configuration.

## What this edition does not do

Several of the Android version's riskier surfaces are not in this port at all, because they need native code that has not been written: no accessibility service, no notification listener, no Bluetooth (so no OBD-II, no tyre sensors, no LED strip), no in-app updater that installs an APK, and no fleet-managed settings. [PORTING.md](PORTING.md) lists them.

## Release signing

Signing keys are never in the repository. A build made without them is signed with a throwaway debug key and must not be published as a release. Public releases are signed with a key kept outside the repository, with checksums published beside each build.
