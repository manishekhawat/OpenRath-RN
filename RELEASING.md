# Releasing

A release is a tag, an APK signed with the project's own key, and a GitHub release holding both.
GitHub does the building: the `release` workflow runs when a tag like `v1.43.0` is pushed. Doing
it the first time means making a signing key and giving GitHub a copy of it, which is steps 2 and
3 below. After that a release is one `git push`.

## 1. Check the version is ready

```sh
npm ci
npm test && npm run typecheck && npm run lint
```

- `package.json` and `app.json` carry the version you are about to tag, and `app.json`'s
  `versionCode` has gone up since the last release. Android refuses to install an update whose
  `versionCode` is not higher.
- [CHANGELOG.md](CHANGELOG.md) has a `## <version>` section. The workflow uses it for the release
  notes.
- `npm run shots` if any screen changed, so the screenshots match what ships.
- CI is green on `main`.

## 2. Make the signing key (once, ever)

Do this on your own machine, not in CI. An Android app can only be updated by a build signed with
the same key: lose it and everyone who installed OpenRath has to uninstall it before they can take
an update.

```sh
keytool -genkeypair -v -keystore openrath-release.keystore -alias openrath \
  -keyalg RSA -keysize 4096 -validity 10000
```

It asks for a keystore password, your name and organisation, then a key password (pressing Enter
reuses the keystore password). Keep the file and both passwords somewhere you will still have them
in ten years, and keep them out of this repository — `.gitignore` already ignores `*.jks`, `*.p12`
and `*.key`, but a `.keystore` file is best kept in another folder entirely.

## 3. Give GitHub the key (once)

The workflow reads the key from four secrets in an environment called `release`, which only `v*`
tags may use, so a workflow running on a branch cannot read it.

1. On GitHub: **Settings > Environments > New environment**, name it `release`.
2. Under **Deployment branches and tags**, choose *Selected branches and tags* and add the rule
   `v*`.
3. Still in that environment, **Add environment secret** four times:

| Secret | Value |
| --- | --- |
| `RELEASE_KEYSTORE_B64` | the keystore as one line of base64: `base64 -w0 openrath-release.keystore` (macOS: `base64 -i openrath-release.keystore`) |
| `RELEASE_STORE_PASS` | the keystore password |
| `RELEASE_KEY_ALIAS` | `openrath`, or whatever `-alias` you used |
| `RELEASE_KEY_PASS` | the key password |

## 4. Tag it

```sh
git checkout main && git pull
git tag -a v1.43.0 -m "OpenRath (React Native) 1.43.0"
git push origin v1.43.0
```

The tag must be `v` plus the exact version in `package.json`; the workflow stops if it is not.

## 5. What GitHub then does

Watch it under **Actions > release**. It:

1. checks the tag against `package.json`;
2. runs the tests, the type check and the linter;
3. `npx expo prebuild --platform android --no-install`, then `./gradlew assembleRelease`;
4. replaces the debug signature Gradle puts on a release build with your key, using `zipalign` and
   `apksigner`;
5. writes `SHA256SUMS` and takes the release notes from CHANGELOG.md;
6. creates the GitHub release with the APK, a source zip and the checksums, and prints the signing
   certificate's SHA-256 in the notes so anyone can check what they downloaded.

Without the four secrets the workflow builds nothing and says so in its log. That is deliberate: a
release signed with Android's debug key could be forged by anyone, so it is never published.

## Doing it by hand instead

If you would rather not put the key on GitHub, build and sign on your own machine and upload the
APK to the release yourself. You need the Android SDK and a JDK.

```sh
npx expo prebuild --platform android --no-install
(cd android && ./gradlew assembleRelease)
# the APK Gradle made, signed with the debug key
APK=$(find android/app/build/outputs/apk/release -name '*.apk' | head -1)
TOOLS=$ANDROID_HOME/build-tools/35.0.0
"$TOOLS/zipalign" -p -f 4 "$APK" openrath-rn-v1.43.0.apk
"$TOOLS/apksigner" sign --ks openrath-release.keystore --ks-key-alias openrath openrath-rn-v1.43.0.apk
"$TOOLS/apksigner" verify --print-certs openrath-rn-v1.43.0.apk
sha256sum openrath-rn-v1.43.0.apk > SHA256SUMS
gh release create v1.43.0 openrath-rn-v1.43.0.apk SHA256SUMS \
  --title "OpenRath (React Native) 1.43.0" --notes-file notes.md --verify-tag
```

## Installing it on a stereo

Copy the APK to the unit on a USB stick or download it there, and install it with the file
manager, allowing installs from unknown sources if Android asks. Then press Home, pick
**OpenRath** and **Always**. The stock launcher is never changed or removed: Settings > Apps >
Default apps > Home app puts it back.
