import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sounds } from './sound';
import { useSettings } from './settings';

export function Screen({ children, title, onBack }: { children: ReactNode; title?: string; onBack?: () => void }) {
  const { theme } = useSettings();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.ui.bg }]}>
      {(title || onBack) && (
        <View style={styles.header}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
              <Text style={[styles.backText, { color: theme.ui.text }]}>‹ Geri</Text>
            </Pressable>
          ) : (
            <View style={styles.back} />
          )}
          <Text style={[styles.headerTitle, { color: theme.ui.text }]}>{title}</Text>
          <View style={styles.back} />
        </View>
      )}
      {children}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { theme } = useSettings();
  const primary = variant === 'primary';
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        sounds.play('click', 0.7);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.ui.accent : theme.ui.panel,
          borderColor: primary ? theme.ui.accent : theme.ui.panelBorder,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? theme.ui.accentText : theme.ui.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const { theme } = useSettings();
  return (
    <View style={[styles.row, { backgroundColor: theme.ui.panel, borderColor: theme.ui.panelBorder }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: theme.ui.text }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: theme.ui.muted }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { theme } = useSettings();
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.ui.accent, false: theme.ui.panelBorder }} />;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const { theme } = useSettings();
  return (
    <View style={[styles.segmented, { borderColor: theme.ui.panelBorder }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[styles.segment, { backgroundColor: on ? theme.ui.accent : 'transparent' }]}
          >
            <Text style={{ color: on ? theme.ui.accentText : theme.ui.text, fontWeight: '700' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { theme } = useSettings();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.rowHint, { color: theme.ui.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.ui.muted}
        {...rest}
        style={[
          styles.input,
          { backgroundColor: theme.ui.panel, borderColor: theme.ui.panelBorder, color: theme.ui.text },
          style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 80 },
  backText: { fontSize: 17, fontWeight: '600' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    minWidth: 240,
  },
  buttonText: { fontSize: 18, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  rowLabel: { fontSize: 16, fontWeight: '700' },
  rowHint: { fontSize: 13 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  segment: { paddingVertical: 8, paddingHorizontal: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17 },
});
