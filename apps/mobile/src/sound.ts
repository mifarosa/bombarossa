import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const FILES = {
  place: require('../assets/sfx/place.wav'),
  explosion: require('../assets/sfx/explosion.wav'),
  pickup: require('../assets/sfx/pickup.wav'),
  death: require('../assets/sfx/death.wav'),
  win: require('../assets/sfx/win.wav'),
  lose: require('../assets/sfx/lose.wav'),
  click: require('../assets/sfx/click.wav'),
  countdown: require('../assets/sfx/countdown.wav'),
} as const;

export type SoundName = keyof typeof FILES;

/** How many overlapping copies of each sound can play at once. */
const POOL: Record<SoundName, number> = {
  place: 3,
  explosion: 4,
  pickup: 2,
  death: 2,
  win: 1,
  lose: 1,
  click: 2,
  countdown: 1,
};

/** Small pool of preloaded players per sound so rapid effects (explosions) can overlap. */
class SoundBank {
  enabled = true;
  private pools = new Map<SoundName, { players: AudioPlayer[]; next: number }>();
  private started = false;

  /** Preloads everything. Safe to call more than once. */
  init(): void {
    if (this.started) return;
    this.started = true;
    // Let the game sounds mix with whatever music the player already has on.
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    for (const name of Object.keys(FILES) as SoundName[]) {
      try {
        const players = Array.from({ length: POOL[name] }, () => createAudioPlayer(FILES[name]));
        this.pools.set(name, { players, next: 0 });
      } catch {
        // audio is optional; never let it break the game
      }
    }
  }

  play(name: SoundName, volume = 1): void {
    if (!this.enabled) return;
    const pool = this.pools.get(name);
    if (!pool) return;
    try {
      const player = pool.players[pool.next];
      pool.next = (pool.next + 1) % pool.players.length;
      player.volume = Math.max(0, Math.min(1, volume));
      player.seekTo(0);
      player.play();
    } catch {
      // ignore playback errors
    }
  }
}

export const sounds = new SoundBank();
