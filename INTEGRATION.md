# `@octetproof/react-native` — Integration Prerequisites

What a React Native app needs to provide for the SDK to start cleanly. Most of
these live in the host app by platform mandate and cannot be shipped on your
behalf.

If you use Expo, the bundled config plugin does all of it — skip to
**Expo** below.

---

## Requirements

| | |
|---|---|
| React Native | 0.71 or later. Both architectures are supported. |
| iOS | **16.0** or later. A physical device is required for attestation. |
| Android | **API 30** (Android 11) or later. |
| Android ABI | **`arm64-v8a` only** — see below. |

### Supported ABIs

The Android SDK ships `arm64-v8a` only. There is no `x86_64` build, so **the
standard Android emulator will not work** — develop against a physical arm64
device. iOS simulators are likewise unsuitable for attestation, which needs real
hardware.

---

## iOS

### 1. Deployment target

Set it to **16.0** before installing. React Native's default is lower, and
CocoaPods fails with a message that never names the version:

```
[!] CocoaPods could not find compatible versions for pod "OctetReactNative":
    Specs satisfying the dependency were found, but they required a higher
    minimum deployment target.
```

In `ios/Podfile`, replace `platform :ios, min_ios_version_supported` with:

```ruby
platform :ios, '16.0'
```

### 2. `Info.plist` keys

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>This app uses your location to verify and prove your location
to services that request it.</string>

<key>NSMotionUsageDescription</key>
<string>This app uses motion data to detect when you're stationary or
moving, which improves the confidence of location proofs.</string>
```

**`NSMotionUsageDescription` is not optional.** The SDK touches motion data
during `Octet.start`, and iOS terminates an app that does so without the key.

If you need proofs while the app is backgrounded, add:

```xml
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>This app uses background location to continue generating
location proofs while you're not actively using it.</string>

<key>UIBackgroundModes</key>
<array><string>location</string></array>
```

These strings are reference copy — Apple's reviewers read them and prefer a
specific explanation to boilerplate, so rewrite them in your product's voice.

### 3. Install

```bash
cd ios && pod install
```

The native framework is downloaded and checksum-verified during `pod install`,
so the first run needs network access. A checksum mismatch fails the install
rather than linking an unverified binary.

---

## Android

### 1. `minSdkVersion`

Set it to **30** in `android/build.gradle`. Lower fails the manifest merge:

```
uses-sdk:minSdkVersion 24 cannot be smaller than version 30 declared in library
```

### 2. Octet's Maven repository

This must go in **your app**. A library cannot supply repositories for its own
dependencies, so declaring it inside this package has no effect on your build.
Missing it is the most common Android setup failure:

```
Could not find com.octetproof:sdk:<version>
```

Put it wherever your app declares repositories. For the default React Native
template, `android/build.gradle`:

```groovy
allprojects {
  repositories {
    maven { url 'https://raw.githubusercontent.com/octetproof/octet-sdk-android/mvn-repo' }
  }
}
```

If your app uses `dependencyResolutionManagement` in `android/settings.gradle`,
add it there instead. Gradle warns if you declare both — project repositories
win and the settings ones are ignored.

### 3. Runtime permissions

The SDK's manifest declares what it needs, but Android 6+ requires you to
request the dangerous ones at runtime:

| Permission | When |
|---|---|
| `ACCESS_FINE_LOCATION` | Before `Octet.start`. The SDK refuses to start without it. |
| `ACTIVITY_RECOGNITION` | Before `Octet.start`. Motion features degrade gracefully if denied. |
| `ACCESS_BACKGROUND_LOCATION` | Only if you need background proofs, and only after fine location is granted. |

### 4. Signing-certificate digest (attestation onboarding)

For Play Integrity attestation, Octet matches your build against the **SHA-256 of
your signing certificate's DER** — the bytes Android reports in `signatureDigests`,
handed to your Octet contact with your package name during onboarding. It is **not**
the public-key/SPKI hash and **not** a base64 `SHA256:` line.

Two ways to produce it; they must agree:

```bash
# A. keytool — the colon-hex under "Certificate fingerprints":
keytool -list -v -keystore your-release.keystore -alias your_alias
#   Certificate fingerprints:
#     SHA256: AB:CD:12:…            <- this is signatureDigests

# B. Export the cert and hash the DER (unambiguous):
keytool -exportcert -keystore your-release.keystore -alias your_alias \
  | openssl dgst -sha256 -c        # must equal A
```

The public-key/SPKI hash (what cert-pinning tools print) and a base64 `SHA256:`
fingerprint are the two common wrong values — neither matches `signatureDigests`. A
wrong digest fails attestation-matched operations closed, silently, and on device
only, so confirm it before your first device run.

---

## Expo

Add the config plugin to `app.json` and run `npx expo prebuild`:

```json
{ "expo": { "plugins": ["@octetproof/react-native"] } }
```

It writes the `Info.plist` keys, the iOS deployment target, the Maven repository
and `minSdkVersion` — everything in the two sections above.

For background proofs:

```json
{ "expo": { "plugins": [["@octetproof/react-native", { "backgroundLocation": true }]] } }
```

The plugin never replaces a value you have already set. To supply your own
permission copy, use `locationWhenInUsePermission`, `motionPermission` or
`locationAlwaysPermission`.

---

### The one thing the type system cannot catch

`result` is a string in all three cases, so it is **always truthy**:

```ts
if (verdict.result) { grantAccess(); }   // compiles — and fires on NO
```

TypeScript protects `verdict.proof`, because that genuinely differs between the
union's branches. It cannot protect this: testing a non-empty string for
truthiness is legal TypeScript, and every `result` value is a non-empty string.
So this is the one remaining way a `NO` silently becomes a permit.

Always compare explicitly:

```ts
if (verdict.result === 'YES') { grantAccess(); }
```

If you lint, `@typescript-eslint/strict-boolean-expressions` catches the mistake
for you:

```json
{ "rules": { "@typescript-eslint/strict-boolean-expressions": "error" } }
```

And `result` has **three** values, not two. `'NO'` means Octet established the fact
and it is false; `'INDETERMINATE'` means it could not establish the fact at all — no
fix, insufficient precision, permission denied, spoofing/tampering signals, or the
SDK isn't running (inspect `verdict.reason`). Fail **closed** on the action for
anything that isn't `'YES'`, but keep the two non-pass cases distinct in your UX and
telemetry: mapping `INDETERMINATE → NO` denies legitimate users, and
`INDETERMINATE → YES` admits unproven ones.

## Proof handling

`proof_bytes_b64` is the only field with cryptographic weight — base64 of the
serialized proof, opaque on device and interpreted only by a verifier. Hand it
over verbatim; do not parse or re-encode it.

**It is non-enumerable.** `verdict.proof.proof_bytes_b64` reads normally, but the
field does not appear in `JSON.stringify`, `console.log`, `Object.keys` or a
spread. On iOS and Android the proof is a `Data` / `ByteArray` that prints as a
byte count and that crash reporters do not serialize; over the bridge it becomes
a plain string, and most React Native tooling captures whole objects by default.
Hiding it from enumeration closes that.

Consequence worth knowing: if you forward a whole verdict, name the field —
a spread will not carry it.

**It is a mitigation, not containment.** The bridge marshals the verdict as a
JSON string, so the bytes are in JavaScript memory before this package parses
them, and JS strings cannot be zeroed — both copies stay resident until garbage
collection and can appear in a heap snapshot or crash dump. A tool walking
`Object.getOwnPropertyNames` also still sees the field.

If that matters to you, keep the bytes off the device entirely: pass a
`decisionRef`, send that to your backend instead of the proof, and have your
backend fetch the proof by that reference. This needs `proofUploadUrl` set —
upload is off by default — and it costs latency: the SDK queues the proof and
uploads it in the background, so the verdict returns before the upload
completes and your backend must retry until it appears. Good for an audit trail
or an asynchronous decision; poor for a synchronous gate with a user waiting.

Proof upload is off by default. No proof leaves the device unless you set
`proofUploadUrl`.

---

## Usage reporting

The native SDK sends one usage record per device per UTC day, so Octet can count
active devices for billing. It carries no location, no proof data, no user or account
identity and no new device identifier, never delays a proof, and can't be switched
off. `creditServiceUrl` only overrides the endpoint for testing; leaving it unset does
not disable reporting. The native integration guides describe the record in full.

## Versions

Each release pins exact iOS and Android SDK versions, and both are always the
same version. The pinned versions ship inside the package, and the native
version is available at runtime:

```bash
cat node_modules/@octetproof/react-native/native-pin.json
```
```ts
Octet.sdkVersion   // the NATIVE SDK version, not this package's
```
