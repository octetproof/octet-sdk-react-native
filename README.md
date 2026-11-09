# @octetproof/react-native

Cryptographic proof-of-location for React Native. Native bindings for the Octet
iOS and Android SDKs.

Ask whether a device is inside or outside a region and get back a signed,
hardware-attested proof that a relying party can verify off-device.

## Requirements

| | |
|---|---|
| React Native | 0.71 or later (New Architecture and legacy bridge both supported) |
| iOS | **16.0** or later. A physical device is required for attestation. |
| Android | **API 30** (Android 11) or later |
| Android ABI | **`arm64-v8a` only** — see below |

### Supported ABIs

The Android SDK ships `arm64-v8a` only. There is no `x86_64` build, so **the
standard Android emulator will not work** — develop against a physical arm64
device. Gradle resolution fails at link time for other ABIs.

This is a property of the native SDK, not of this wrapper. iOS simulators are
also unsuitable for attestation, which needs real hardware.

## Install

```bash
npm install @octetproof/react-native
```

### iOS

**Set your deployment target to 16.0 first.** React Native's default is lower
(15.1 as of 0.79), and CocoaPods will otherwise fail with a confusing message
that does not name the version:

```
[!] CocoaPods could not find compatible versions for pod "OctetReactNative":
    Specs satisfying the dependency were found, but they required a higher
    minimum deployment target.
```

In `ios/Podfile`, replace `platform :ios, min_ios_version_supported` with:

```ruby
platform :ios, '16.0'
```

Then:

```bash
cd ios && pod install
```

The native framework is downloaded and checksum-verified during `pod install`,
so the install is reproducible, but the first run needs network access. A
checksum mismatch fails the install rather than linking an unverified binary.

### Android

Two changes to your app, both required.

**1. Set `minSdkVersion` to 30** in `android/build.gradle`. Lower fails the
manifest merge with `uses-sdk:minSdkVersion N cannot be smaller than version 30`.

**2. Add Octet's Maven repository to your app.** It must go in the *consuming
app* — a library cannot supply repositories for its own dependencies, so
declaring it inside this package has no effect on your build. Missing it is the
most common Android setup failure:

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

If your app instead uses `dependencyResolutionManagement` in
`android/settings.gradle`, add it there. Gradle warns if you declare both —
project repositories win, and the settings ones are ignored.

### Expo

Add the config plugin to `app.json`, then `npx expo prebuild`:

```json
{ "expo": { "plugins": ["@octetproof/react-native"] } }
```

It does everything the two manual sections above describe — the `Info.plist`
permission strings, the iOS deployment target, the Maven repository and
`minSdkVersion`. Nothing else to configure.

For proofs while the app is backgrounded, which adds the always-location key
and the `location` background mode:

```json
{ "expo": { "plugins": [["@octetproof/react-native", { "backgroundLocation": true }]] } }
```

The permission strings are reference copy. Apple's reviewers read them and
prefer a specific explanation to boilerplate, so override them in your own
voice — the plugin never replaces a value you have already set:

| Option | Sets |
|---|---|
| `locationWhenInUsePermission` | `NSLocationWhenInUseUsageDescription` |
| `motionPermission` | `NSMotionUsageDescription` |
| `locationAlwaysPermission` | `NSLocationAlwaysAndWhenInUseUsageDescription` |
| `backgroundLocation` | the always-location key + `UIBackgroundModes` |

### Permissions

Both platforms need location permission before `start`, and Android needs
`ACCESS_FINE_LOCATION` granted or the SDK refuses to start. The iOS usage
strings are mandatory — a missing motion-usage description terminates the app
the first time the SDK touches motion data. The Expo plugin handles both; bare
projects should follow the SDK's integration guide.

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
    // NOT a "no" — the SDK cannot answer right now
    console.log(verdict.reason, verdict.achievable_level);
    break;
}
```

### The verdict is a trichotomy, not a boolean

`result` is `YES`, `NO`, or `INDETERMINATE`. **Never treat `INDETERMINATE` as
`NO`** — it means "cannot answer right now" (still warming up, fix too stale,
requested precision unavailable), not "you are outside the region".

`OctetVerdict` is a discriminated union, so the type system enforces the rule
that a proof exists only for `YES` and `NO`: `verdict.proof.proof_bytes_b64`
does not compile until you narrow on `result`. There is deliberately no
`isYes` or boolean convenience accessor — that accessor would be the bug.

When `reason` is `INSUFFICIENT_PRECISION`, `achievable_level` names the best
level obtainable right now. The SDK never silently returns a coarser answer
than you asked for.

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

### Regions

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

Build regions with these factories rather than by hand. The objects they return
are the SDK's own stable region representation, and the native side validates
them — a malformed region is rejected, never silently reinterpreted.

**H3 cells are hex strings, not numbers.** An H3 index exceeds JavaScript's
exact-integer range, so a numeric cell would denote a different cell. Numeric
cells are rejected rather than truncated.

### Predicate options — `PredicateOpts`

The optional third argument to every predicate. `RN-only`: it groups the
trailing parameters that Swift and Kotlin express as default arguments.

| Field | Meaning |
|---|---|
| `atTime` | `Date` to answer for. Defaults to now. |
| `sessionNonceB64` | Per-login challenge, base64, 1–512 bytes. Committed inside the proof and forces fresh generation, so a verifier can bind the proof to one login. |
| `decisionRef` | Opaque host decision id, committed into the proof and its upload tags. |

An empty or oversized `sessionNonceB64` produces an `INVALID_SESSION_NONCE`
verdict with no proof — it is not an exception, and this library deliberately
does not pre-validate the length, so the documented outcome reaches you intact.

### Committed content and uploads

`content` in `PredicateOpts` commits content to the proof by digest. The content never enters
the proof. Each `ContentItem` is one of `valueB64` (in memory), `fileUri` (a file of up to
64 MiB) or `digest` (from `Octet.hashContent`, for larger files).

Content is salted by default. A `valueB64` or `fileUri` item without `saltB64` gets a fresh
32-byte salt, written onto your item object during the call. Read `item.saltB64` afterwards
and keep it with the content: a verifier needs it. Pass `saltB64: ''` to commit unsalted.
`Octet.hashContent` works the same way and returns the salt as `saltB64`. The upload request
your provider receives carries `saltB64`, so you can store it with the file.

To have the SDK upload committed content to your own storage after the proof is made, set
`upload: true` (or `uploadFromUri` and `uploadSaltB64` on a `digest` item) and register a
provider that returns a fresh upload target for each attempt:

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

The proof is returned before any upload starts, and an upload never changes it. Each status
is `pending`, `uploading`, `uploaded` or `failed`, and a failure names its reason
(`contentChanged`, `contentMissing`, `providerFailed`, `rejected` with `httpStatus`, or
`exhausted`).

**Uploads run in the foreground only.** The provider is JavaScript, so it can answer only
while the JS runtime is up. When the OS starts the app in the background, no provider is
registered and queued uploads wait until the app runs again, for at most 7 days. Register the
provider early, for example when the app starts. A provider that throws, returns no `url`, or
does not answer within 60 seconds counts as a failed attempt, which the SDK retries.

#### Resumable uploads

For large files, return a resumable target instead. The SDK then sends the content in chunks
and continues from the last confirmed chunk after an interruption:

| Target | What your backend supplies |
|---|---|
| `{ kind: 'gcsResumable', url, headers? }` | A Google Cloud Storage resumable session URL it has opened. |
| `{ kind: 'azureBlock', url, headers? }` | The blob's Azure SAS URL. The SDK uploads blocks, then commits the block list. |
| `{ kind: 's3Multipart', uploadId }` | An S3 multipart upload it has started. |

The headers of a resumable target are sent with every request. An `s3Multipart` target needs
two more callbacks, passed as the second argument (`ContentUploadS3Handlers`).
`s3PartTarget` returns the pre-signed URL for one part, as a `ContentUploadSingleTarget`
(`{ url, method?, headers? }`), and `s3Complete` completes the upload with the parts
(`ContentUploadS3Part`: `partNumber` and `etag`), in order:

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

Each callback has the same 60 seconds to settle. A rejection or a timeout counts as a failed
attempt, and a failed `s3Complete` is retried without re-sending any part. Without the S3
callbacks, an `s3Multipart` target is refused as a failed attempt. Resumable uploads also run
in the foreground only.

### Errors — `LicenseErrorCode`

`Octet.start` rejects with a `LicenseError` carrying a `code`. Predicates never
throw; they return a verdict.

`MALFORMED_KEY`, `VERIFICATION_FAILED`, `NO_ACTIVATION`, `EXPIRED`,
`ACTIVATION_WINDOW_CLOSED`, `REVOKED`, `NETWORK`, `UPGRADE_REQUIRED`,
`SERVER_REJECTED`, `NOT_YET_RELEASED`, `BOOTSTRAP_FAILED`, `NEW_DEVICES_BLOCKED`.

`UPGRADE_REQUIRED` carries `minVersion`; `SERVER_REJECTED` carries
`httpStatus`; `VERIFICATION_FAILED` carries `verificationReason`.
`BOOTSTRAP_FAILED` means the attested bootstrap was refused; the reason
(`ATTESTATION_INVALID`, `APP_NOT_REGISTERED`, `DEVICE_LIMIT_REACHED`, …) rides in the
message. `NEW_DEVICES_BLOCKED` means the account's free grace period is used up, so
no new devices activate; send the user to `upgradeUrl`, which is server-signed: open
it verbatim. `RN-only` as a
named union — natively these are the error's own cases.

```ts
try {
  await Octet.start();
} catch (e) {
  if (e instanceof LicenseError && e.code === 'UPGRADE_REQUIRED') {
    promptUpgrade(e.minVersion);
  }
}
```

## Proofs

`proof_bytes_b64` is the only field with cryptographic weight — base64 of the
serialized proof, opaque on device and interpreted only by a verifier. Hand it
over verbatim; do not parse or re-encode it. The other proof fields are
conveniences for on-device inspection.

### `proof_bytes_b64` is non-enumerable

Reading it works normally:

```ts
sendToVerifier(verdict.proof.proof_bytes_b64);   // ✅
```

It is simply invisible to anything that walks the object:

```ts
JSON.stringify(verdict)     // no proof bytes
console.log(verdict)        // no proof bytes
{ ...verdict.proof }        // no proof bytes
```

On iOS and Android the proof is a `Data` / `ByteArray`: it prints as a byte
count, and crash reporters do not serialize it. Over the bridge the same value
becomes a plain string, and most React Native tooling captures whole objects by
default — a `console.log`, a Sentry breadcrumb, a store persisted to
`AsyncStorage`. Hiding it from enumeration closes that, without removing
anything you can do.

**What it does not close.** This is a mitigation, not containment, and it is
narrower than the native behaviour it borrows from:

- The bridge hands the verdict across as a **JSON string**, so the bytes exist
  in JavaScript memory before this package parses them. That copy is transient
  and outside your control and ours. Native has no equivalent — the verdict is
  a typed object there, never a serialized string.
- JavaScript strings cannot be zeroed. Both copies stay resident until garbage
  collection, so they can appear in a heap snapshot or a crash dump. A native
  `Data` can be released deliberately.
- A tool that walks `Object.getOwnPropertyNames` rather than `Object.keys` sees
  the field regardless.

If your threat model includes any of those, do not take the bytes into
JavaScript at all — see **Keeping proofs off the device** below.

**If you forward a whole verdict, name the field**, because a spread will not
carry it:

```ts
await fetch(url, {
  method: 'POST',
  body: JSON.stringify({
    result: verdict.result,
    proof_bytes_b64: verdict.proof.proof_bytes_b64,   // required — a spread drops it
  }),
});
```

Proof upload is off by default. No proof leaves the device unless you set
`proofUploadUrl`.

### Keeping proofs off the device

If your backend can tolerate a short wait, it can fetch the proof itself and the
bytes never enter JavaScript. Pass a `decisionRef`, send **that** to your
backend instead of the proof, and have your backend retrieve it:

```ts
const verdict = await sdk.loc.isWithin(OctetRegion.country('US'), { decisionRef });
await fetch('/my-backend/decide', {
  method: 'POST',
  body: JSON.stringify({ decisionRef, result: verdict.result }),   // no proof bytes
});
```

Requires `proofUploadUrl` to be set — proof upload is off by default.

**The trade is latency, and it is not small.** The SDK queues the proof and
uploads it on a background drainer, so the verdict returns *before* the upload
finishes. Your backend has to retry until the proof appears. For an audit trail
or any asynchronous decision that is free. For a **synchronous** gate — a user
waiting on a screen — it puts a network upload on your critical path, and the
bytes-in-hand route is the better one.

## Usage reporting

The native SDK sends one usage record per device per UTC day, so Octet can count
active devices for billing. It carries no location, no proof data, no user or account
identity and no new device identifier, never delays a proof, and can't be switched
off. `creditServiceUrl` only overrides the endpoint for testing; leaving it unset does
not disable reporting. The native integration guides describe the record in full.

## What this library does not expose

Log-sink registration, the region-builder DSL, the canonical region-string
helper and the feature-flag getters are intentionally not bridged. Each is recorded with its reason in the
SDK's TypeScript API allowlist. Open an issue if you need one.

## Versions

This package has its own version and pins an exact native SDK version. From
1.0.0 the **major always matches** the native SDK's; while this package is 0.x
the two majors are independent. Minor and patch always move independently, so a
JavaScript-side fix does not require a new SDK release.

| `@octetproof/react-native` | Octet native SDK |
|---|---|
| 0.1.x | 3.1.0 |

The pinned versions are in the package itself, and the native version is also
available at runtime:

```bash
cat node_modules/@octetproof/react-native/native-pin.json
```
```ts
Octet.sdkVersion   // the NATIVE SDK version, not this package's
```

iOS and Android are always pinned to the same SDK version, and the release
pipeline fails if they disagree — a proof means the same thing on both
platforms, so the wrapper never straddles two native versions.

## License

See `LICENSE`.
