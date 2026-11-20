import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Row, Screen, Segmented, Toggle } from './ui';
import { THEMES, useSettings } from './settings';
import type { ThemeId } from './render/theme';

export function Menu({ onSolo, onOnline, onSettings }: { onSolo: () => void; onOnline: () => void; onSettings: () => void }) {
  const { theme } = useSettings();
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.bigEmoji}>💣</Text>
        <Text style={[styles.title, { color: theme.ui.text }]}>BOMBAROSSA</Text>
        <Text style={[styles.tagline, { color: theme.ui.muted }]}>Patlat, kaç, hayatta kal</Text>
        <View style={styles.buttons}>
          <Button label="Tek Oyuncu" onPress={onSolo} />
          <Button label="Online" onPress={onOnline} />
          <Button label="Ayarlar" variant="secondary" onPress={onSettings} />
        </View>
      </View>
    </Screen>
  );
}

export function SoloSetup({ onBack, onStart }: { onBack: () => void; onStart: (bots: number) => void }) {
  const { theme } = useSettings();
  const [bots, setBots] = useState(3);
  return (
    <Screen title="Tek Oyuncu" onBack={onBack}>
      <View style={styles.content}>
        <Text style={[styles.label, { color: theme.ui.text }]}>Bot sayısı</Text>
        <Segmented
          value={bots}
          onChange={setBots}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
        />
        <Text style={[styles.hint, { color: theme.ui.muted }]}>
          {bots >= 4 ? '4 ve 5 bot daha büyük bir harita açar.' : 'Botlar bloklara bomba koyar, kaçar ve seni kovalar.'}
        </Text>
        <View style={styles.buttons}>
          <Button label="Başla" onPress={() => onStart(bots)} />
          <Button label="Antrenman: boş harita" variant="secondary" onPress={() => onStart(0)} />
        </View>
      </View>
    </Screen>
  );
}

function ThemeCard({ id, active, onPress }: { id: ThemeId; active: boolean; onPress: () => void }) {
  const { theme } = useSettings();
  const t = THEMES[id];
  const blurb = id === 'cartoon' ? 'Yumuşak renkler, sevimli karakterler' : 'Piksel sanatı, klasik hava, en hafif';
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.themeCard,
        { backgroundColor: theme.ui.panel, borderColor: active ? theme.ui.accent : theme.ui.panelBorder, borderWidth: active ? 3 : 1 },
      ]}
    >
      <View style={styles.swatches}>
        {t.playerColors.slice(0, 4).map((c) => (
          <View key={c} style={[styles.swatch, { backgroundColor: c, borderRadius: id === 'cartoon' ? 9 : 2 }]} />
        ))}
      </View>
      <Text style={[styles.themeName, { color: theme.ui.text }]}>{t.label}</Text>
      <Text style={[styles.hint, { color: theme.ui.muted }]}>{blurb}</Text>
    </Pressable>
  );
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { settings, update, theme } = useSettings();
  return (
    <Screen title="Ayarlar" onBack={onBack}>
      <ScrollView contentContainerStyle={styles.settings}>
        <Field
          label="Oyuncu adı"
          value={settings.name}
          onChangeText={(name) => update({ name })}
          placeholder="Oyuncu"
          maxLength={12}
          autoCorrect={false}
        />

        <Text style={[styles.label, { color: theme.ui.text }]}>Görünüm</Text>
        <View style={styles.themes}>
          <ThemeCard id="cartoon" active={settings.theme === 'cartoon'} onPress={() => update({ theme: 'cartoon' })} />
          <ThemeCard id="classic" active={settings.theme === 'classic'} onPress={() => update({ theme: 'classic' })} />
        </View>

        <Row label="Ses efektleri">
          <Toggle value={settings.sound} onChange={(sound) => update({ sound })} />
        </Row>
        <Row label="Titreşim">
          <Toggle value={settings.haptics} onChange={(haptics) => update({ haptics })} />
        </Row>
        <Row label="Grafik kalitesi" hint="Otomatik: telefon yavaşsa efektleri kendi kısar">
          <Segmented
            value={settings.quality}
            onChange={(quality) => update({ quality })}
            options={[
              { value: 'auto', label: 'Oto' },
              { value: 'high', label: 'Yüksek' },
              { value: 'low', label: 'Düşük' },
            ]}
          />
        </Row>
        <Row label="FPS göstergesi" hint="Performansı görmek için">
          <Toggle value={settings.showFps} onChange={(showFps) => update({ showFps })} />
        </Row>

        <Field
          label="Sunucu adresi (online için)"
          value={settings.serverUrl}
          onChangeText={(serverUrl) => update({ serverUrl: serverUrl.trim() })}
          placeholder="wss://oyun.ornek.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  bigEmoji: { fontSize: 72 },
  title: { fontSize: 40, fontWeight: '900', letterSpacing: 3 },
  tagline: { fontSize: 15, marginBottom: 28 },
  buttons: { gap: 12, alignItems: 'center', marginTop: 8 },
  content: { flex: 1, padding: 24, gap: 14 },
  label: { fontSize: 16, fontWeight: '800', marginTop: 6 },
  hint: { fontSize: 13 },
  settings: { padding: 20, gap: 12 },
  themes: { flexDirection: 'row', gap: 12 },
  themeCard: { flex: 1, borderRadius: 16, padding: 12, gap: 6 },
  swatches: { flexDirection: 'row', gap: 5 },
  swatch: { width: 18, height: 18 },
  themeName: { fontSize: 16, fontWeight: '800' },
});
