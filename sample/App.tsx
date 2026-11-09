// Octet React Native sample.
//
// Activate the SDK, ask whether the device is in a region, read the verdict.
// Requires a physical device: neither the iOS Simulator nor an x86_64 Android
// emulator can produce a proof.

import React, { useState } from 'react';
import {
  ActivityIndicator, SafeAreaView, ScrollView, StatusBar,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Octet, OctetRegion } from '@octetproof/react-native';
import type { OctetSdk, OctetVerdict, PredicateOpts } from '@octetproof/react-native';

// A session nonce is 1–512 bytes, base64. 513 is over the cap, and an
// out-of-range nonce comes back as a verdict rather than an error.
const OVER_CAP_NONCE_B64 = btoa('A'.repeat(513));

export default function App() {
  const [sdk, setSdk] = useState<OctetSdk | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const say = (line: string) => setLog((prev) => [line, ...prev].slice(0, 40));

  async function start() {
    setBusy(true);
    try {
      // No licence key: the SDK activates by attesting the app instance (App Attest on
      // iOS, Keystore attestation on Android) on first launch.
      const started = await Octet.start();
      setSdk(started);
      const status = await started.licenseStatus();
      say(`started — license ${status?.state ?? 'unknown'}, native SDK ${Octet.sdkVersion}`);
    } catch (e: any) {
      // start() is the only call that throws. It rejects with a LicenseError
      // carrying a `code`; predicates never throw.
      say(`start failed — ${e?.code ?? 'ERROR'}: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  function describe(v: OctetVerdict): string {
    // Narrow on `result` first. INDETERMINATE means "cannot answer right now" —
    // it is not a NO, and must never be treated as one.
    if (v.result === 'INDETERMINATE') {
      return `INDETERMINATE — reason ${v.reason}, achievable ${v.achievable_level}`;
    }
    // YES and NO always carry a proof, and TypeScript knows it here.
    // Send proof_bytes_b64 to your verifier verbatim. This screen prints its
    // length only — proof bytes do not belong in a log.
    return (
      `${v.result} — level ${v.proof.level}, ` +
      `proof ${v.proof.id} (${v.proof.proof_bytes_b64.length} b64 chars)`
    );
  }

  async function probe(label: string, opts?: PredicateOpts) {
    if (!sdk) return say('call start() first');
    setBusy(true);
    say(`${label} …`);
    try {
      const verdict = await sdk.loc.isWithin(OctetRegion.country('US'), opts);
      say(`${label} -> ${describe(verdict)}`);
    } catch (e: any) {
      say(`${label} threw (unexpected) — ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.title}>Octet — React Native sample</Text>
      <Text style={styles.sub}>
        Requires a physical device. Simulators and x86_64 emulators cannot produce a proof.
      </Text>

      <Button label="1. start()" onPress={start} disabled={busy || !!sdk} />
      <Button
        label='2. isWithin(country("US"))'
        onPress={() => probe('isWithin US', { decisionRef: `demo-${Date.now()}` })}
        disabled={busy || !sdk}
      />

      <Text style={styles.section}>An out-of-range session nonce returns a verdict, not an error</Text>
      <Button
        label="3. nonce 0 bytes"
        onPress={() => probe('nonce 0B', { sessionNonceB64: '' })}
        disabled={busy || !sdk}
      />
      <Button
        label="4. nonce 513 bytes"
        onPress={() => probe('nonce 513B', { sessionNonceB64: OVER_CAP_NONCE_B64 })}
        disabled={busy || !sdk}
      />

      {busy ? <ActivityIndicator style={styles.spinner} /> : null}

      <ScrollView style={styles.logBox}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>{line}</Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ label, onPress, disabled }: {
  label: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonOff]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0e14', padding: 16 },
  title: { color: '#e6edf3', fontSize: 20, fontWeight: '600', marginBottom: 4 },
  sub: { color: '#8b949e', fontSize: 12, marginBottom: 16 },
  section: { color: '#8b949e', fontSize: 12, marginTop: 16, marginBottom: 6 },
  button: { backgroundColor: '#1f6feb', borderRadius: 8, padding: 12, marginBottom: 8 },
  buttonOff: { backgroundColor: '#21262d' },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '500' },
  spinner: { marginVertical: 8 },
  logBox: { flex: 1, marginTop: 12, backgroundColor: '#010409', borderRadius: 8, padding: 10 },
  logLine: { color: '#7ee787', fontFamily: 'Courier', fontSize: 11, marginBottom: 4 },
});
