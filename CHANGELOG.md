# Changelog

All notable changes to `@octetproof/react-native` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

This package has its own version and pins an exact native SDK version. From
1.0.0 the **major** always matches the native SDK's; while this package is 0.x
the two majors are independent. Minor and patch always move independently, so a
JavaScript-side fix does not require a new SDK release. Every entry below names
the native SDK version it was released against.

## [0.1.0] — 2026-11-09

> First release. React Native bindings for the Octet iOS and Android SDKs.
> Released against native SDK **3.1.0** — the same version on both platforms.
>
> _Release date stamped at tag time._

### Changed
- **No confidence score or assurance tier by default.** `confidence` holds neutral values
  (`0`, `[]`) and `spoofing_verdict` is `'UNSPECIFIED'`, unless Octet has enabled them for
  your licence. The `ConfidenceSummary` type is deprecated and will be removed in the next
  major release.

### Added
- **Uploads of committed content to your storage.** Mark a `ContentItem` with `upload: true`
  (or `uploadFromUri` on a `digest` item) and register `Octet.setContentUploadProvider`, which
  returns a fresh upload target for each attempt. `Octet.setContentUploadListener` and
  `Octet.contentUploads(proofId)` report each item's state. Uploads run in the foreground only:
  when the OS starts the app in the background, no provider is registered and queued uploads
  wait until the app runs again. Caller content is off until Octet enables it for your licence;
  until then a query with content returns `INDETERMINATE` with reason
  `CALLER_CONTENT_NOT_ENABLED`.

- **`NEW_DEVICES_BLOCKED`** license error code, with `LicenseError.upgradeUrl` (server-signed;
  open it verbatim). On Android, `LicenseError` now also carries `minVersion`, `httpStatus`
  and the bootstrap reason, as on iOS.

- **`LocationProof.spoofing_verdict`.** Each proof now exposes its assurance tier
  (`VERIFIED` / `PLAUSIBLE` / …) where the tier is enabled for your licence, and
  `'UNSPECIFIED'` otherwise. A `contains()` `YES` can be corroborated
  (`VERIFIED`) or falsification-backed (`PLAUSIBLE`, uncorroborated) — read this,
  not the region granularity, to decide what a `YES` is worth. (The
  `acceptPlausibleContainment` opt-in that enables the `PLAUSIBLE` tier is a
  native config; it is not yet settable from the React Native bridge.)

- **`Octet.start` / `licenseStatus` / `attestationEnrolmentBundle`.** Activation
  returns a session handle; the enrolment bundle is a cheap local read a verifier
  can use to establish this device's hardware root. `Octet.start()` needs no
  config: it activates by attesting the app instance. `OctetConfig.licenseKey` is
  optional, deprecated and ignored, and will be removed in a future major version.

- **Predicates — `isWithin`, `isOutside`, `contains`.** All return an
  `OctetVerdict`, which is a **trichotomy**: `YES`, `NO`, or `INDETERMINATE`.
  `INDETERMINATE` means the SDK cannot answer right now and must never be treated
  as `NO`.

  `OctetVerdict` is modelled as a discriminated union, so the rule that a proof
  exists only for `YES` and `NO` is enforced by **your** compiler:
  `verdict.proof.proof_bytes_b64` does not type-check until you narrow on
  `result`. There is deliberately no boolean convenience accessor.

- **`OctetRegion` factories** — `earth`, `box3D`, `ellipse`, `country`,
  `subdivision`, `usState`, `city`, `polygonSet`, `disc`. The objects they return
  are the SDK's own stable region representation and are validated natively; a
  malformed region is rejected, never silently reinterpreted. H3 cells are hex
  strings, not numbers, because an H3 index exceeds JavaScript's exact-integer
  range.

- **Expo config plugin.** Writes the required `Info.plist` permission strings,
  the iOS deployment target, the Octet Maven repository and `minSdkVersion`.
  Without the motion-usage description iOS terminates the app during
  `Octet.start`, and Expo apps never edit `Info.plist` directly.

- **Both React Native architectures supported**, RN 0.71 and later.

### Requirements

- **iOS 16.0** or later. React Native's default deployment target is lower, and
  CocoaPods rejects the install with a message that does not name the version.
- **Android API 30** or later.
- **`arm64-v8a` only** — the Android SDK ships no `x86_64` build, so emulators
  cannot run it. A physical device is required.
