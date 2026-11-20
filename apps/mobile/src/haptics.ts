import * as Haptics from 'expo-haptics';

class HapticsController {
  enabled = true;
  private last = 0;

  private ok(minGapMs = 40): boolean {
    if (!this.enabled) return false;
    const now = Date.now();
    if (now - this.last < minGapMs) return false;
    this.last = now;
    return true;
  }

  light(): void {
    if (this.ok()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  medium(): void {
    if (this.ok()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }
  heavy(): void {
    if (this.ok(0)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }
  success(): void {
    if (this.ok(0)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}

export const haptics = new HapticsController();
