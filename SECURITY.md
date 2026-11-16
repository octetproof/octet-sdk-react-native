# Security

## Reporting a vulnerability

Report a suspected vulnerability privately to **security@octetproof.com**. That
includes a proof that verifies when it should not, a YES or NO the SDK returns for a
location the device is not at, a way to produce a proof without a genuine device or a
genuine install of the app, and any flaw in how the SDK handles device keys, proofs or
activation. Include the SDK version, the platform and OS version, the device model,
and the smallest steps that show the problem. Do not open a public issue for a
verification bypass until it has been triaged.

## What the release signature covers

The `cosign` check in `INTEGRATION.md` (Verifying your OctetSDK download) confirms that
`SHASUMS256.txt` was signed by Octet's release workflow. The checksum check then
confirms that each release file is the one listed in that signed file.

The release files are not reproducible builds. The signature and the checksums are
how you check them.

## What a proof establishes

The app's copy of a verdict is only as trustworthy as the device it runs on. Forward
the proof bytes to your backend and verify them there with
[`octet-verify`](https://github.com/octetproof/octet-verify) before you act on the
answer. A proof that passes was signed by the device key it carries and has not been
altered since. To also require that the key is genuine device hardware, run
`octet-verify` with hardware attestation required.
