# Releasing

A release is a tag, an APK signed with the project's own key, and a GitHub release holding both.

## Before the tag

1. `npm test`, `npm run typecheck` and `npm run lint` pass, and CI is green on `main`.
2. `package.json` and `app.json` carry the new version, and `app.json`'s `versionCode` has gone up.
3. [CHANGELOG.md](CHANGELOG.md) has a section for it.
4. `npm run shots` if any screen changed, so the screenshots match what ships.

## The key

Releases are signed with a key kept **outside this repository**, on a machine that is not CI. Make
it once:

```sh
keytool -genkeypair -v -keystore openrath-release.keystore -alias openrath \
  -keyalg RSA -keysize 4096 -validity 10000
```

Keep the keystore and both passwords somewhere you will still have them in ten years. An Android
app can only be updated by a build signed with the same key: lose it and every installed copy has
to be uninstalled before it can take an update.

To let GitHub build the release, put four secrets in the repository's **release** environment
(Settings > Environments > release), which only `v*` tags may use:

| Secret | What it holds |
| --- | --- |
| `RELEASE_KEYSTORE_B64` | the keystore file, `base64 -w0 openrath-release.keystore` |
| `RELEASE_STORE_PASS` | the keystore password |
| `RELEASE_KEY_ALIAS` | the key's alias (`openrath` above) |
| `RELEASE_KEY_PASS` | the key's password |

## Making the release

```sh
git tag -a v1.43.0 -m "OpenRath (React Native) 1.43.0"
git push origin v1.43.0
```

The `release` workflow checks the tag against `package.json`, builds the APK, signs it with the key
from those secrets, and creates the GitHub release with the APK, a source zip and `SHA256SUMS`.

Without the secrets the workflow builds nothing and says so. The release is then made by hand:
build with `npx expo prebuild --platform android --no-install && (cd android && ./gradlew
assembleRelease)`, sign the APK offline with `apksigner`, and attach it to the release yourself. A
build signed with Android's debug key is never published.
