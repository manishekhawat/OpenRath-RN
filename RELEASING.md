# Releasing

A release is a tag, an APK signed with the project's own key, and a GitHub release holding both.
GitHub does the building: the `release` workflow runs when a tag like `v1.44.0` is pushed. Doing
it the first time means making a signing key and giving GitHub a copy of it, which is steps 2 and
3 below. After that a release is one `git push`.

**Which way to sign.** Letting GitHub sign is the recommended one, and what the steps below
describe: the build is the same every time, there is nothing to remember on release day, and the
key can only be read by a job running on a `v*` tag. Signing offline, with the key never leaving
your own machine, is stricter and the right choice if the key is shared with anyone or you would
rather GitHub never held it; it costs you a build on your own machine for every release, and the
Android SDK installed there. The last section has those commands. Either way, a build signed with
Android's debug key is never published: anyone holding that key could forge an update.

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
reuses the keystore password).

- Keep the keystore and both passwords offline, and back them up in two separate places, for
  example two encrypted USB sticks kept apart. Not in a synced or shared folder, and not beside
  the source.
- Never commit it. `.gitignore` covers `*.keystore`, `*.jks`, `*.p12`, `*.key` and `signing.json`,
  but the safest place for it is another folder entirely.
- If the key is lost, everyone who installed OpenRath has to uninstall it before they can take an
  update, losing their settings unless they have a backup. If it leaks, say so publicly and move
  to a new key.

## 3. Give GitHub the key (once)

The workflow reads the key from four secrets in an environment called `release`, which only `v*`
tags may use, so a workflow running on a branch cannot read it.

1. On GitHub: **Settings > Environments > New environment**, name it `release`.
2. Under **Deployment branches and tags**, choose *Selected branches and tags* and add the rule
   `v*`. Adding yourself under **Required reviewers** as well means every release waits for you to
   approve it before the key is used.
3. Still in that environment, **Add environment secret** four times:

| Secret | Value |
| --- | --- |
| `RELEASE_KEYSTORE_B64` | the keystore as one line of base64 (see below) |
| `RELEASE_STORE_PASS` | the keystore password |
| `RELEASE_KEY_ALIAS` | `openrath`, or whatever `-alias` you used |
| `RELEASE_KEY_PASS` | the key password |

For the base64 text:

```sh
base64 -w0 openrath-release.keystore > keystore.b64      # Linux
base64 -i openrath-release.keystore -o keystore.b64      # macOS
```

Paste what is in `keystore.b64` into the secret, then delete `keystore.b64`.

## 4. Tag it

```sh
git checkout main && git pull
git tag -a v1.44.0 -m "OpenRath (React Native) 1.44.0"
git push origin v1.44.0
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
APK to the release yourself. You need the Android SDK and a JDK, and step 2 above still applies:
the key is yours to make and keep. Step 3 is the one you skip, and with no secrets to read the
`release` workflow builds nothing and passes with a note, so the tag is still pushed as in step 4.

Build and sign:

```sh
VER=$(node -p "require('./package.json').version")
npx expo prebuild --platform android --no-install
(cd android && ./gradlew assembleRelease)
# the APK Gradle made, signed with the debug key
APK=$(find android/app/build/outputs/apk/release -name '*.apk' | head -1)
TOOLS=$(ls -d $ANDROID_HOME/build-tools/* | sort -V | tail -1)
"$TOOLS/zipalign" -p -f 4 "$APK" "openrath-rn-v$VER.apk"
"$TOOLS/apksigner" sign --ks openrath-release.keystore --ks-key-alias openrath "openrath-rn-v$VER.apk"
"$TOOLS/apksigner" verify --print-certs "openrath-rn-v$VER.apk"
```

Then the files, the notes and the release. The tag has to be pushed before this, because
`--verify-tag` refuses to invent one:

```sh
git archive --format=zip --prefix=openrath-rn/ -o "openrath-rn-v$VER-source.zip" HEAD
sha256sum "openrath-rn-v$VER.apk" "openrath-rn-v$VER-source.zip" > SHA256SUMS
# this version's CHANGELOG section, from its "## X.Y" heading to the next one
awk -v v="$VER" '
  /^## / { if (on) exit; if ($2 == v || $2 == substr(v, 1, length(v) - 2)) on = 1 }
  on' CHANGELOG.md > notes.md
gh release create "v$VER" "openrath-rn-v$VER.apk" "openrath-rn-v$VER-source.zip" SHA256SUMS \
  --title "OpenRath (React Native) $VER" --notes-file notes.md --verify-tag
```

Put the `Signer #1 certificate SHA-256 digest` line `apksigner verify` printed into the release
notes as well, under a "Checking the download" heading, so a reader can tell your signature from
anyone else's. The next section says how they check it.

## Checking a download

Anyone installing a release should check what they got. Download the APK and `SHA256SUMS` from the
same release into one folder:

```sh
sha256sum -c SHA256SUMS --ignore-missing
```

It should say `OK` for the APK. Then check who signed it, with `apksigner` from the Android SDK
build-tools:

```sh
apksigner verify --print-certs openrath-rn-v1.44.0.apk
```

The `Signer #1 certificate SHA-256 digest` line must match the certificate this project signs
with. Every release's notes print that digest. Once the first release is out, paste the digest
here as well, so it can be checked against the repository and not only against the release it came
with. If the two do not match, do not install the APK, and report it as `SECURITY.md` describes.

## Building the same APK yourself

The source zip on each release is the tagged commit. The release job builds it on `ubuntu-24.04`
with Node 22, Temurin JDK 17, the Android SDK that image ships, and `npm ci`, which installs
exactly what `package-lock.json` pins.

Your APK will not be byte-for-byte identical to the published one: Gradle and the React Native
build write timestamps and paths into the archive, and your signature is your own. Compare the
contents instead — unzip both and look at `classes.dex`, `resources.arsc` and the files under
`assets/`. The JavaScript bundle under `assets/` is the one to look at hardest, because that is
where this app's own code ends up.

## Installing it on a stereo

Copy the APK to the unit on a USB stick or download it there, and install it with the file
manager, allowing installs from unknown sources if Android asks. Then press Home, pick
**OpenRath** and **Always**. The stock launcher is never changed or removed: Settings > Apps >
Default apps > Home app puts it back.
