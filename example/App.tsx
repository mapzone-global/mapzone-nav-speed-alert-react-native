import * as NavSpeedAlert from '@mapzone/nav-speed-alert';
import {
  AlertViewError,
  VoiceAlertType,
  VoiceMode,
  useNavSpeedAlertSigns,
} from '@mapzone/nav-speed-alert';
import Constants from 'expo-constants';
import { Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { startGpsSource } from './src/gps-source';
import { SAMPLE_ROUTE_POLYLINE } from './src/fixtures/route';
import { RouteSimulator } from './src/route-simulator';
import { SignSlot } from './src/sign-slot';

type Extra = Omit<NavSpeedAlert.ConfigureOptions, 'metadata'> & { segmentUrl: string };
const extra = Constants.expoConfig?.extra as Extra;

const MUTABLE_TYPES = Object.entries(VoiceAlertType).filter(
  (e): e is [string, VoiceAlertType] => typeof e[1] === 'number'
);

export default function App() {
  const { signs, restriction } = useNavSpeedAlertSigns();
  const [polylineText, setPolylineText] = useState(SAMPLE_ROUTE_POLYLINE);
  const [useGps, setUseGps] = useState(false);
  const [simSpeed, setSimSpeed] = useState(60);
  const [running, setRunning] = useState(false);
  const [voiceViaJs, setVoiceViaJs] = useState(false);
  const [dingMode, setDingMode] = useState(false);
  const [voiceSpeed, setVoiceSpeedState] = useState(1);
  const [identity, setIdentity] = useState(extra.identity);
  const [signedIn, setSignedIn] = useState(false);
  const [muted, setMuted] = useState<Set<VoiceAlertType>>(new Set());
  const [log, setLog] = useState<string[]>([]);
  const [logsAvailable, setLogsAvailable] = useState(false);

  const simRef = useRef<RouteSimulator | null>(null);
  const stopGpsRef = useRef<(() => void) | null>(null);
  // Bumped on every Start/Reset so an awaited permission dialog can't revive a stale run.
  const runGeneration = useRef(0);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 30));
  }, []);

  const stopSources = useCallback(() => {
    runGeneration.current += 1;
    simRef.current?.stop();
    simRef.current = null;
    stopGpsRef.current?.();
    stopGpsRef.current = null;
    setRunning(false);
  }, []);

  // Call on sign-in and on every launch with a user already signed in.
  const signIn = useCallback(
    async (user: string) => {
      const { segmentUrl, ...opts } = extra;
      try {
        await NavSpeedAlert.configure({ ...opts, identity: user.trim() });
        setSignedIn(true);
        appendLog(`configure() ok for ${user.trim()}`);
        if (segmentUrl) NavSpeedAlert.setSegmentUrl(segmentUrl);
      } catch (e) {
        appendLog(String(e));
      }
    },
    [appendLog]
  );

  const signOut = useCallback(async () => {
    stopSources();
    const r = await NavSpeedAlert.logout();
    appendLog(`logout() ok=${r.success} code=${r.errorCode} ${r.errorMessage}`);
    if (r.success) setSignedIn(false);
  }, [appendLog, stopSources]);

  // Launch: sign the stored user back in. Always-on listeners.
  useEffect(() => {
    if (extra.identity) signIn(extra.identity);
    NavSpeedAlert.canExportLogs().then(setLogsAvailable);
    const subs = [
      NavSpeedAlert.addResultListener((e) => {
        appendLog(`result ok=${e.success} code=${e.errorCode} ${e.errorMessage}`);
        if (e.errorCode === AlertViewError.SESSION_MOVED) {
          // The account signed in on another device: sign out here and do not
          // configure() again until the user signs in again.
          appendLog('account in use on another device → signing out');
          signOut();
        }
      }),
      NavSpeedAlert.addRerouteListener((e) =>
        appendLog(`reroute at ${e.lat.toFixed(5)},${e.lng.toFixed(5)}`)
      ),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      stopSources();
      NavSpeedAlert.reset();
    };
    // All deps are stable callbacks, so this runs once per mount.
  }, [appendLog, stopSources, signIn, signOut]);

  // Subscribing silences the built-in player; unsubscribing restores it.
  useEffect(() => {
    if (!voiceViaJs) return;
    const sub = NavSpeedAlert.addVoiceListener((e) =>
      appendLog(`voice trigger=${e.trigger} priority=${e.priority} bytes=${e.wavBase64.length}`)
    );
    return () => sub.remove();
  }, [voiceViaJs, appendLog]);

  useEffect(() => {
    if (simRef.current) simRef.current.speedKmh = simSpeed;
  }, [simSpeed]);

  const onStart = useCallback(async () => {
    stopSources();
    const generation = runGeneration.current;
    NavSpeedAlert.start(polylineText.trim());
    appendLog('start()');
    if (useGps) {
      let stop: () => void;
      try {
        stop = await startGpsSource(NavSpeedAlert.onLocation);
      } catch (e) {
        appendLog(String(e));
        return;
      }
      if (generation !== runGeneration.current) {
        stop(); // Reset/Start pressed while the permission dialog was open.
        return;
      }
      stopGpsRef.current = stop;
    } else {
      const sim = new RouteSimulator(polylineText.trim(), NavSpeedAlert.onLocation, () => {
        appendLog('simulator reached end of route');
        setRunning(false);
      });
      sim.speedKmh = simSpeed;
      simRef.current = sim;
      sim.start();
    }
    setRunning(true);
  }, [polylineText, useGps, simSpeed, stopSources, appendLog]);

  const onReset = useCallback(() => {
    stopSources();
    NavSpeedAlert.reset();
    appendLog('reset()');
  }, [stopSources, appendLog]);

  const toggleMute = (type: VoiceAlertType) => {
    const next = new Set(muted);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setMuted(next);
    NavSpeedAlert.setMutedAlertTypes([...next]);
  };

  const tryCall = (label: string, call: () => void) => {
    try {
      call();
      appendLog(`${label} → ok`);
    } catch (e) {
      appendLog(`${label} → ${String(e)}`);
    }
  };

  // Debug helpers for the extras contract: a reserved key must throw the
  // native reason, and `{}` must clear without throwing.
  const onDebugHeaders = () => {
    tryCall('setExtraHeaders reserved', () => NavSpeedAlert.setExtraHeaders({ 'content-type': 'x' }));
    tryCall('setExtraHeaders clear', () => NavSpeedAlert.setExtraHeaders({}));
  };

  const onDebugBodyFields = () => {
    tryCall('setExtraBodyFields reserved', () => NavSpeedAlert.setExtraBodyFields({ identity: 'x' }));
    tryCall('setExtraBodyFields clear', () => NavSpeedAlert.setExtraBodyFields({}));
  };

  const onDingMode = (on: boolean) => {
    setDingMode(on);
    NavSpeedAlert.setVoiceMode(on ? VoiceMode.DING : VoiceMode.FULL);
  };

  const changeVoiceSpeed = (delta: number) => {
    const next = Math.min(2, Math.max(0.5, Math.round((voiceSpeed + delta) * 100) / 100));
    setVoiceSpeedState(next);
    NavSpeedAlert.setVoiceSpeed(next);
  };

  const onExportLogs = async () => {
    const path = `${Paths.cache.uri.replace('file://', '')}/nav.log`;
    const bytes = await NavSpeedAlert.exportLogs(path);
    appendLog(`exportLogs → ${bytes} bytes (${path})`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>NavSpeedAlert example</Text>

        <Section title="Account">
          <TextInput
            style={styles.input}
            value={identity}
            onChangeText={setIdentity}
            editable={!signedIn}
            autoCapitalize="none"
            placeholder="Identity (phone number, driver code, ...)"
          />
          <View style={styles.rowCenter}>
            <Button title="Sign in" onPress={() => signIn(identity)} disabled={signedIn || !identity.trim()} />
            <Button title="Sign out" onPress={signOut} disabled={!signedIn} />
            <Text>{signedIn ? 'signed in' : 'signed out'}</Text>
          </View>
        </Section>

        <Section title="Signs">
          <Text>speedStatus: {signs?.speedStatus ?? '-'}</Text>
          <View style={styles.row}>
            <SignSlot label="current" sign={signs?.current} />
            <SignSlot label="next" sign={signs?.next} distMeters={signs?.nextDistMeters} />
            <SignSlot label="camera" sign={signs?.camera} distMeters={signs?.cameraDistMeters} />
            <SignSlot label="toll" sign={signs?.toll} distMeters={signs?.tollDistMeters} />
          </View>
          <View style={styles.row}>
            <SignSlot label="stop" sign={restriction?.stop} distMeters={restriction?.stopDistMeters} />
            <SignSlot label="closed" sign={restriction?.closed} distMeters={restriction?.closedDistMeters} />
            <SignSlot label="vehicle" sign={restriction?.vehicle} distMeters={restriction?.vehicleDistMeters} />
            <SignSlot label={`bua${restriction?.inBua ? ' (in)' : ''}`} sign={restriction?.bua} distMeters={restriction?.buaDistMeters} />
            <SignSlot label="turn" sign={restriction?.turn} distMeters={restriction?.turnDistMeters} />
          </View>
        </Section>

        <Section title="Route">
          <TextInput
            style={styles.input}
            multiline
            numberOfLines={3}
            value={polylineText}
            onChangeText={setPolylineText}
            placeholder="Encoded polyline (precision 1e6)"
          />
          <Toggle label="Use real GPS (else simulator)" value={useGps} onChange={setUseGps} />
          {!useGps && (
            <View style={styles.rowCenter}>
              <Text>Sim speed: {simSpeed} km/h </Text>
              <Button title="-10" onPress={() => setSimSpeed((s) => Math.max(0, s - 10))} />
              <Button title="+10" onPress={() => setSimSpeed((s) => Math.min(150, s + 10))} />
            </View>
          )}
          <View style={styles.rowCenter}>
            <Button title={running ? 'Restart' : 'Start'} onPress={onStart} disabled={!signedIn} />
            <Button title="Reset" onPress={onReset} />
            <Button title="Export logs" onPress={onExportLogs} disabled={!logsAvailable} />
          </View>
        </Section>

        <Section title="Voice">
          <Toggle label="Receive voice in JS (silences built-in player)" value={voiceViaJs} onChange={setVoiceViaJs} />
          <Toggle label="Ding mode (chimes instead of sentences)" value={dingMode} onChange={onDingMode} />
          <View style={styles.rowCenter}>
            <Text>Voice speed: {voiceSpeed.toFixed(2)}x </Text>
            <Button title="-0.25" onPress={() => changeVoiceSpeed(-0.25)} />
            <Button title="+0.25" onPress={() => changeVoiceSpeed(0.25)} />
          </View>
          <Text style={styles.sub}>Mute:</Text>
          {MUTABLE_TYPES.map(([name, type]) => (
            <Toggle key={name} label={name} value={muted.has(type)} onChange={() => toggleMute(type)} />
          ))}
        </Section>

        <Section title="Debug">
          <View style={styles.rowCenter}>
            <Button title="Extra headers" onPress={onDebugHeaders} />
            <Button title="Extra body fields" onPress={onDebugBodyFields} />
          </View>
        </Section>

        <Section title="Log">
          {log.map((l, i) => (
            <Text key={i} style={styles.log}>{l}</Text>
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.rowCenter}>
      <Switch value={value} onValueChange={onChange} />
      <Text style={styles.toggleLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eee' },
  content: { padding: 12 },
  h1: { fontSize: 22, fontWeight: '600', marginBottom: 8 },
  h2: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  sub: { marginTop: 6, fontWeight: '500' },
  section: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginVertical: 2 },
  toggleLabel: { marginLeft: 6 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 6, fontSize: 11, maxHeight: 80 },
  log: { fontSize: 11, fontFamily: 'monospace' },
});
