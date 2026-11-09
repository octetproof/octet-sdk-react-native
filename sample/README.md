# Octet React Native sample

Activate the SDK, ask whether the device is in a region, read the verdict. One
screen, four buttons.

**A physical device is required.** The iOS Simulator cannot produce a proof, and
the Android SDK ships `arm64-v8a` only, so the standard x86_64 emulator cannot
run it either.

## Setup

```bash
npm install
```

There is no licence key to paste. The SDK activates by attesting the app instance
on first launch (App Attest on iOS, Keystore attestation on Android), so run it on
a real device with your app registered with Octet. Sign up at
[octetproof.com](https://octetproof.com).

Then generate the native projects and run:

```bash
npx expo prebuild --clean
npx expo run:ios        # or: npx expo run:android
```

`expo prebuild` applies the config plugin, which writes the iOS permission
strings, the Octet Maven repository and `minSdkVersion`. Nothing to configure by
hand.

## What each button does

| Button | Expected |
|---|---|
| `start()` | `started — license ACTIVE, native SDK <version>` |
| `isWithin(country("US"))` | `YES` inside the US, `NO` outside. Both carry a proof. |
| nonce 0 bytes | `INDETERMINATE — reason INVALID_SESSION_NONCE` |
| nonce 513 bytes | `INDETERMINATE — reason INVALID_SESSION_NONCE` |

A session nonce is 1–512 bytes. Buttons 3 and 4 show that an out-of-range nonce
comes back as a **verdict**, not an exception, so you handle it in the same place
as every other answer.

## The three things worth copying

**Narrow on `result` before reading `proof`.** `YES` and `NO` carry a proof;
`INDETERMINATE` does not. TypeScript enforces this — `verdict.proof` does not
compile until you have narrowed.

**Never treat `INDETERMINATE` as `NO`.** It means the SDK cannot answer right
now, not that the device is outside the region. And do not test `result` for
truthiness: it is a non-empty string in all three cases, so `if (verdict.result)`
is always true and would grant on a `NO`.

**Send `proof_bytes_b64` to your verifier verbatim.** Do not parse or re-encode
it. This screen prints its length only; proof bytes do not belong in a log, and
the field is non-enumerable so `console.log(verdict)` will not include it.

## Not enabled here

Proof upload is off unless you set `proofUploadUrl`, so no proof leaves the device
in this sample. Background location is off — add
`{ "backgroundLocation": true }` to the plugin options in `app.json` to try it.
