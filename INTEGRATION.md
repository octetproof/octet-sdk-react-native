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

The plugin never replaces a value you have already set. Its options:

| Option | Sets |
|---|---|
| `locationWhenInUsePermission` | `NSLocationWhenInUseUsageDescription` |
| `motionPermission` | `NSMotionUsageDescription` |
| `locationAlwaysPermission` | `NSLocationAlwaysAndWhenInUseUsageDescription` |
| `backgroundLocation` | the always-location key and `UIBackgroundModes` |

---

## Usage

```ts
import { Octet, OctetRegion } from '@octetproof/react-native';

const sdk = await Octet.start();

const verdict = await sdk.loc.isWithin(OctetRegion.country('US'));

switch (verdict.result) {
  case 'YES':
  case 'NO':
    // proof is non-null here, and TypeScript knows it
    sendToVerifier(verdict.proof.proof_bytes_b64);
    break;
  case 'INDETERMINATE':
    // not a "no": the SDK cannot answer right now
    console.log(verdict.reason, verdict.achievable_level);
    break;
}
```

`sdk.loc` has three predicates: `isWithin(region, opts?)`, `isOutside(region, opts?)`
and `contains(center, tolerance, opts?)`, which asks about a disc. Each returns an
`OctetVerdict`. `sendToVerifier` stands for your own code.

---

## Reading a verdict

`result` is `'YES'`, `'NO'` or `'INDETERMINATE'`. `'NO'` means the SDK established the
fact and it is false. `'INDETERMINATE'` means it could not establish the fact: no fix
yet, a fix too stale, the requested precision unavailable, location permission
missing, spoofing or tampering signals, or the SDK isn't running. `verdict.reason`
says which. Never treat `'INDETERMINATE'` as `'NO'`.

Fail closed on the action for anything that isn't `'YES'`, but keep the two non-pass
cases apart in your UX and telemetry. Mapping `'INDETERMINATE'` to `'NO'` denies
legitimate users, and mapping it to `'YES'` admits unproven ones.

`OctetVerdict` is a discriminated union, so the type system enforces the rule that a
proof exists only for `'YES'` and `'NO'`: `verdict.proof.proof_bytes_b64` does not
compile until you narrow on `result`. There is deliberately no `isYes` or boolean
accessor, because a boolean would merge `'NO'` and `'INDETERMINATE'`.

When `reason` is `INSUFFICIENT_PRECISION`, `achievable_level` names the best level
obtainable right now. The SDK never returns a coarser answer than you asked for.

### The one thing the type system cannot catch

`result` is a non-empty string in all three cases, so it is always truthy:

```ts
if (verdict.result) { grantAccess(); }   // compiles, and fires on NO
```

TypeScript protects `verdict.proof`, because that field differs between the union's
branches. It cannot protect this: testing a non-empty string for truthiness is legal
TypeScript. Always compare explicitly:

```ts
if (verdict.result === 'YES') { grantAccess(); }
```

If you lint, `@typescript-eslint/strict-boolean-expressions` catches the mistake:

```json
{ "rules": { "@typescript-eslint/strict-boolean-expressions": "error" } }
```

---

## Regions

```ts
OctetRegion.country('US')
OctetRegion.subdivision('US-CA')
OctetRegion.usState('CA')              // sugar for US-CA
OctetRegion.city('San Francisco')
OctetRegion.disc({ latitude: 37.422, longitude: -122.084 }, 500)
OctetRegion.ellipse(center, 900, 400, 31.5)
OctetRegion.box3D([37, 38], [-122.5, -122], [0, 500])
OctetRegion.polygonSet(['8a2a1072b59ffff'])
OctetRegion.earth()
```

Build regions with these factories rather than by hand. The objects they return are the
SDK's own region representation, and the native side validates them. A malformed region
is rejected, never reinterpreted.

**H3 cells are hex strings, not numbers.** An H3 index exceeds JavaScript's
exact-integer range, so a numeric cell would denote a different cell. Numeric cells are
rejected rather than truncated.

---

## Predicate options

`PredicateOpts` is the optional last argument to every predicate. It is specific to
React Native: it groups the trailing parameters that Swift and Kotlin express as
default arguments.

| Field | Meaning |
|---|---|
| `atTime` | `Date` to answer for. Defaults to now. |
| `sessionNonceB64` | Per-login challenge, base64, 1 to 512 bytes. Committed inside the proof, and it forces a fresh proof, so a verifier can bind the proof to one login. |
| `decisionRef` | Opaque host decision id, committed into the proof and its upload tags. |
| `content` | Content to commit to the proof by digest. See [Committed content and uploads](#committed-content-and-uploads). |

An empty or oversized `sessionNonceB64` produces an `INVALID_SESSION_NONCE` verdict with
no proof. It is not an exception. This library does not pre-validate the length, so the
documented outcome reaches you intact.

---

## Committed content and uploads

`content` in `PredicateOpts` commits content to the proof by digest. The content never
enters the proof. Each `ContentItem` is one of `valueB64` (in memory), `fileUri` (a file
of up to 64 MiB) or `digest` (from `Octet.hashContent`, for larger files).

Content is salted by default. A `valueB64` or `fileUri` item without `saltB64` gets a
fresh 32-byte salt, written onto your item object during the call. Read `item.saltB64`
afterwards and keep it with the content: a verifier needs it. Pass `saltB64: ''` to
commit unsalted. `Octet.hashContent` works the same way and returns the salt as
`saltB64`. The upload request your provider receives carries `saltB64`, so you can store
it with the file.

Caller content is off until Octet enables it for your licence. Until then, a query with
`content` returns `'INDETERMINATE'` with reason `CALLER_CONTENT_NOT_ENABLED`.

To have the SDK upload committed content to your own storage after the proof is made,
set `upload: true` (or `uploadFromUri` and `uploadSaltB64` on a `digest` item) and
register a provider that returns a fresh upload target for each attempt:

```ts
Octet.setContentUploadProvider(async (request) => {
  const url = await myBackend.presignUpload(request.proofId, request.key, request.size);
  return { url, headers: { 'Content-Type': request.contentType } };
});
Octet.setContentUploadListener((status) => console.log(status.key, status.state, status.failure));

const verdict = await sdk.loc.isWithin(OctetRegion.country('US'), {
  content: [{ key: 'photo', contentType: 'image/jpeg', fileUri, upload: true, locator: 'site-42/photo' }],
});
if (verdict.proof) {
  const statuses = await Octet.contentUploads(verdict.proof.id);
}
```

The proof is returned before any upload starts, and an upload never changes it. Each
status is `pending`, `uploading`, `uploaded` or `failed`, and a failure names its reason
(`contentChanged`, `contentMissing`, `providerFailed`, `rejected` with `httpStatus`, or
`exhausted`).

**Uploads run in the foreground only.** The provider is JavaScript, so it can answer
only while the JS runtime is up. When the OS starts the app in the background, no
provider is registered and queued uploads wait until the app runs again, for at most 7
days. Register the provider early, for example when the app starts. A provider that
throws, returns no `url`, or does not answer within 60 seconds counts as a failed
attempt, which the SDK retries.

### Resumable uploads

For large files, return a resumable target instead. The SDK then sends the content in
chunks and continues from the last confirmed chunk after an interruption:

| Target | What your backend supplies |
|---|---|
| `{ kind: 'gcsResumable', url, headers? }` | A Google Cloud Storage resumable session URL it has opened. |
| `{ kind: 'azureBlock', url, headers? }` | The blob's Azure SAS URL. The SDK uploads blocks, then commits the block list. |
| `{ kind: 's3Multipart', uploadId }` | An S3 multipart upload it has started. |

The headers of a resumable target are sent with every request. An `s3Multipart` target
needs two more callbacks, passed as the second argument (`ContentUploadS3Handlers`).
`s3PartTarget` returns the pre-signed URL for one part, as a
`ContentUploadSingleTarget` (`{ url, method?, headers? }`), and `s3Complete` completes
the upload with the parts (`ContentUploadS3Part`: `partNumber` and `etag`), in order:

```ts
Octet.setContentUploadProvider(
  async (request) => ({ kind: 's3Multipart', uploadId: await myBackend.startMultipart(request) }),
  {
    s3PartTarget: async (request, uploadId, partNumber) =>
      ({ url: await myBackend.presignPart(uploadId, partNumber) }),
    s3Complete: async (request, uploadId, parts) => myBackend.completeMultipart(uploadId, parts),
  },
);
```

Each callback has the same 60 seconds to settle. A rejection or a timeout counts as a
failed attempt, and a failed `s3Complete` is retried without re-sending any part.
Without the S3 callbacks, an `s3Multipart` target is refused as a failed attempt.
Resumable uploads also run in the foreground only.

---

## Errors

`Octet.start` rejects with a `LicenseError` carrying a `code` (`LicenseErrorCode`).
Predicates return a verdict for every SDK outcome. They reject only on input the bridge
can't decode, or when called before `Octet.start` completes.

`MALFORMED_KEY`, `VERIFICATION_FAILED`, `NO_ACTIVATION`, `EXPIRED`,
`ACTIVATION_WINDOW_CLOSED`, `REVOKED`, `NETWORK`, `UPGRADE_REQUIRED`,
`SERVER_REJECTED`, `NOT_YET_RELEASED`, `BOOTSTRAP_FAILED`, `NEW_DEVICES_BLOCKED`,
`START_FAILED`.

- `UPGRADE_REQUIRED` carries `minVersion`.
- `SERVER_REJECTED` carries `httpStatus`.
- `VERIFICATION_FAILED` carries `verificationReason`.
- `BOOTSTRAP_FAILED` means the attested bootstrap was refused. The reason
  (`ATTESTATION_INVALID`, `APP_NOT_REGISTERED`, `DEVICE_LIMIT_REACHED`, …) rides in the
  message.
- `NEW_DEVICES_BLOCKED` means the account's free grace period is used up, so no new
  devices activate. Send the user to `upgradeUrl`, which is server-signed: open it
  verbatim.
- `START_FAILED` means `Octet.start` failed for a reason that is not a licence problem.
  The message says what failed.

The named union is specific to React Native. Natively these are the error's own cases.

```ts
try {
  await Octet.start();
} catch (e) {
  if (e instanceof LicenseError && e.code === 'UPGRADE_REQUIRED') {
    promptUpgrade(e.minVersion);
  }
}
```

---

## Proof handling

`proof_bytes_b64` is the only field with cryptographic weight: base64 of the serialized
proof, opaque on the device and interpreted only by a verifier. Hand it over verbatim.
Do not parse or re-encode it. The other proof fields are conveniences for on-device
inspection.

### `proof_bytes_b64` is non-enumerable

Reading it works normally:

```ts
sendToVerifier(verdict.proof.proof_bytes_b64);   // ✅
```

It is invisible to anything that walks the object:

```ts
JSON.stringify(verdict)     // no proof bytes
console.log(verdict)        // no proof bytes
{ ...verdict.proof }        // no proof bytes
```

On iOS and Android the proof is a `Data` / `ByteArray`: it prints as a byte count, and
crash reporters do not serialize it. Over the bridge the same value becomes a plain
string, and most React Native tooling captures whole objects by default, such as a
`console.log`, a Sentry breadcrumb or a store persisted to `AsyncStorage`. Hiding the
field from enumeration closes that without removing anything you can do.

**If you forward a whole verdict, name the field**, because a spread does not carry it:

```ts
await fetch(url, {
  method: 'POST',
  body: JSON.stringify({
    result: verdict.result,
    proof_bytes_b64: verdict.proof.proof_bytes_b64,   // required: a spread drops it
  }),
});
```

**It is a mitigation, not containment.** It is narrower than the native behaviour it
borrows from:

- The bridge hands the verdict across as a JSON string, so the bytes exist in
  JavaScript memory before this package parses them. That copy is transient and outside
  your control and ours. Native has no equivalent: the verdict is a typed object there,
  never a serialized string.
- JavaScript strings cannot be zeroed. Both copies stay resident until garbage
  collection, so they can appear in a heap snapshot or a crash dump. A native `Data` can
  be released deliberately.
- A tool that walks `Object.getOwnPropertyNames` rather than `Object.keys` sees the
  field regardless.

If your threat model includes any of those, keep the bytes out of JavaScript, as below.

### Keeping proofs off the device

If your backend can tolerate a short wait, it can fetch the proof itself and the bytes
never enter JavaScript. Pass a `decisionRef`, send that to your backend instead of the
proof, and have your backend retrieve the proof by that reference:

```ts
const verdict = await sdk.loc.isWithin(OctetRegion.country('US'), { decisionRef });
await fetch('/my-backend/decide', {
  method: 'POST',
  body: JSON.stringify({ decisionRef, result: verdict.result }),   // no proof bytes
});
```

This requires `proofUploadUrl`. Proof upload is off by default, and no proof leaves the
device unless you set it.

**The cost is latency.** The SDK queues the proof and uploads it in the background, so
the verdict returns before the upload finishes, and your backend has to retry until the
proof appears. For an audit trail or an asynchronous decision that costs nothing. For a
synchronous gate, with a user waiting on a screen, it puts a network upload on your
critical path, and sending the bytes from the app is the better route.

---

## Usage reporting

The native SDK sends one usage record per device per UTC day, so Octet can count
active devices for billing. It carries no location, no proof data, no user or account
identity and no new device identifier, never delays a proof, and can't be switched
off. `creditServiceUrl` only overrides the endpoint for testing; leaving it unset does
not disable reporting. The native integration guides describe the record in full.

---

## What this library does not expose

Log-sink registration, the region-builder DSL, the canonical region-string helper and
the feature-flag getters are intentionally not bridged. Open an issue if you need one.

---

## Verifying your OctetSDK download

**The npm package** is published with npm provenance. After `npm install`, run this in
your app to check the registry signatures and provenance of your dependencies:

```sh
npm audit signatures
```

**The native SDKs** are checked when you build. During `pod install` the iOS framework
is downloaded and checked against the checksum pinned in this package, and a mismatch
fails the install. On Android, Gradle resolves the pinned version of
`com.octetproof:sdk` from Octet's Maven repository.

**The release files.** Each GitHub release attaches the package tarball,
`SHASUMS256.txt`, its keyless Sigstore signature (`SHASUMS256.txt.sig` and
`SHASUMS256.txt.pem`) and a CycloneDX SBOM. Download them into one directory, then run
([cosign](https://docs.sigstore.dev/cosign/system_config/installation/) 2.x):

```sh
# 1. Confirm the bytes match the published SHA-256.
shasum -a 256 -c SHASUMS256.txt

# 2. Confirm the checksums were signed by the official release workflow.
cosign verify-blob \
  --certificate SHASUMS256.txt.pem \
  --signature SHASUMS256.txt.sig \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github\.com/octetproof/octet-sdk/\.github/workflows/release-react-native\.yml@' \
  SHASUMS256.txt
```

Both steps must report success. A signature from any other workflow fails step 2.

---

## Versions

This package has its own version and pins an exact native SDK version. From 1.0.0 the
major always matches the native SDK's. While this package is 0.x the two majors are
independent. Minor and patch always move independently, so a JavaScript-side fix does
not require a new SDK release.

| `@octetproof/react-native` | Octet native SDK |
|---|---|
| 0.1.x | 3.1.0 |

iOS and Android are always pinned to the same SDK version, so a proof means the same
thing on both platforms. The pinned versions ship inside the package, and the native
version is available at runtime:

```bash
cat node_modules/@octetproof/react-native/native-pin.json
```
```ts
Octet.sdkVersion   // the NATIVE SDK version, not this package's
```
