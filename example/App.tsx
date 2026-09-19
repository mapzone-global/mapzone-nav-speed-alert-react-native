import * as NavSpeedAlert from '@mapzone/nav-speed-alert';
import { VoiceAlertType, useNavSpeedAlertSigns } from '@mapzone/nav-speed-alert';
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

type Extra = NavSpeedAlert.ConfigureOptions & { segmentUrl: string };
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

  // configure once + always-on listeners
  useEffect(() => {
    const { segmentUrl, ...opts } = extra;
    NavSpeedAlert.configure(opts);
    if (segmentUrl) NavSpeedAlert.setSegmentUrl(segmentUrl);
    NavSpeedAlert.canExportLogs().then(setLogsAvailable);
    const subs = [
      NavSpeedAlert.addResultListener((e) =>
        appendLog(`result ok=${e.success} code=${e.errorCode} ${e.errorMessage}`)
      ),
      NavSpeedAlert.addRerouteListener((e) =>
        appendLog(`reroute at ${e.lat.toFixed(5)},${e.lng.toFixed(5)}`)
      ),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      stopSources();
      NavSpeedAlert.reset();
    };
  }, [appendLog, stopSources]);

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

  // Debug helpers for the extras contract: a reserved key must come back as a
  // native error string, and `{}` must clear and return null. Call before Start.
  const onDebugHeaders = () => {
    const err = NavSpeedAlert.setExtraHeaders({ 'content-type': 'x' });
    const cleared = NavSpeedAlert.setExtraHeaders({});
    appendLog(`setExtraHeaders reserved → ${err} | clear → ${cleared}`);
  };

  const onDebugBodyFields = () => {
    const err = NavSpeedAlert.setExtraBodyFields({ pointsPolyline: 'x' });
    const cleared = NavSpeedAlert.setExtraBodyFields({});
    appendLog(`setExtraBodyFields reserved → ${err} | clear → ${cleared}`);
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
            <Button title={running ? 'Restart' : 'Start'} onPress={onStart} />
            <Button title="Reset" onPress={onReset} />
            <Button title="Export logs" onPress={onExportLogs} disabled={!logsAvailable} />
          </View>
        </Section>

        <Section title="Voice">
          <Toggle label="Receive voice in JS (silences built-in player)" value={voiceViaJs} onChange={setVoiceViaJs} />
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
