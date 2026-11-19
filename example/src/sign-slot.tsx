import type { AlertSignRef } from '@mapzone/nav-speed-alert';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  sign: AlertSignRef | null | undefined;
  /** Omit to hide the distance line (e.g. the current-limit slot). */
  distMeters?: number;
};

/** One sign slot: the native image ref rendered by expo-image plus a caption. */
export function SignSlot({ label, sign, distMeters }: Props) {
  return (
    <View style={styles.slot}>
      {sign ? <Image source={sign} style={styles.image} /> : <View style={styles.empty} />}
      <Text style={styles.label}>{label}</Text>
      {distMeters !== undefined && sign ? <Text style={styles.dist}>{distMeters} m</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', width: 84, marginVertical: 4 },
  image: { width: 72, height: 72 },
  empty: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: '#ccc' },
  label: { fontSize: 11, marginTop: 2 },
  dist: { fontSize: 11, color: '#555' },
});
