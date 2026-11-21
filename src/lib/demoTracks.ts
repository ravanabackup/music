export interface DemoTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  appName: string;
  durationMs: number;
  artworkUrl: string;
  rootFreq: number;
  chordRatios: number[];
  bpm: number;
}

export const STUDIO_DEMO_TRACKS: DemoTrack[] = [
  {
    id: "neon-drift",
    title: "Neon Drift (Midnight Expressway)",
    artist: "Kuroshio & Analog Syndicate",
    album: "Late Night Telemetry Vol. IV",
    appName: "Browser Player",
    durationMs: 24000,
    artworkUrl: "/covers/neon-drift.jpg",
    rootFreq: 220, // A3 minor9 synthwave progression
    chordRatios: [1, 1.2, 1.5, 1.8],
    bpm: 112,
  },
  {
    id: "velvet-echoes",
    title: "Velvet Echoes in Studio B",
    artist: "Miles & The Amber Quartet",
    album: "Tape Saturation Sessions",
    appName: "Browser Player",
    durationMs: 24000,
    artworkUrl: "/covers/velvet-echoes.jpg",
    rootFreq: 196, // G3 warm Rhodes major7
    chordRatios: [1, 1.25, 1.5, 1.875],
    bpm: 92,
  },
  {
    id: "orbital-bloom",
    title: "Orbital Bloom",
    artist: "Solstice Telemetry",
    album: "Prismatic Horizons",
    appName: "Browser Player",
    durationMs: 24000,
    artworkUrl: "/covers/orbital-bloom.jpg",
    rootFreq: 261.63, // C4 ambient lydian pad + arp
    chordRatios: [1, 1.25, 1.5, 2.0],
    bpm: 120,
  },
];

export const ANDROID_WEBHOOK_PRESETS = [
  {
    title: "Starboy (Live Arena Edit)",
    artist: "The Weeknd & Daft Punk",
    album: "Starboy Deluxe",
    appName: "Spotify",
    durationMs: 230000,
    positionMs: 64000,
    isPlaying: true,
    artworkBase64OrUrl: "/covers/neon-drift.jpg",
  },
  {
    title: "Nights",
    artist: "Frank Ocean",
    album: "Blonde",
    appName: "Apple Music",
    durationMs: 307000,
    positionMs: 182000,
    isPlaying: true,
    artworkBase64OrUrl: "/covers/velvet-echoes.jpg",
  },
  {
    title: "Genesis",
    artist: "Justice",
    album: "Cross",
    appName: "YouTube Music",
    durationMs: 234000,
    positionMs: 29000,
    isPlaying: true,
    artworkBase64OrUrl: "/covers/orbital-bloom.jpg",
  },
  {
    title: "Everything In Its Right Place (24-bit FLAC)",
    artist: "Radiohead",
    album: "Kid A",
    appName: "Poweramp",
    durationMs: 251000,
    positionMs: 95000,
    isPlaying: true,
    artworkBase64OrUrl: "/covers/neon-drift.jpg",
  },
];

const blobCache = new Map<string, string>();

/**
 * Generates a rich stereo 16-bit PCM WAV Blob URL in-memory so HTML5 <audio>,
 * navigator.mediaSession, and WebRTC MediaStream audio work immediately offline & cross-origin.
 */
export function getSynthesizedTrackAudioUrl(track: DemoTrack): string {
  const cached = blobCache.get(track.id);
  if (cached) return cached;

  const sampleRate = 22050;
  const durationSeconds = Math.max(8, Math.round(track.durationMs / 1000));
  const numSamples = sampleRate * durationSeconds;
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataByteLength = numSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataByteLength, true);

  const beatSec = 60 / track.bpm;
  const barRoots = [1, 0.8909, 1.1224, 1.0]; // Musical 4-bar chord movement

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beatSec);
    const barIndex = Math.floor(beatIndex / 4) % barRoots.length;
    const rootFreq = track.rootFreq * barRoots[barIndex];

    // Warm stereo pad
    let padL = 0;
    let padR = 0;
    for (let c = 0; c < track.chordRatios.length; c++) {
      const freq = rootFreq * track.chordRatios[c];
      const detune = c % 2 === 0 ? 1.002 : 0.998;
      padL += Math.sin(2 * Math.PI * freq * t) * 0.11;
      padR += Math.sin(2 * Math.PI * freq * detune * t + 0.4) * 0.11;
    }

    // Eighth-note synth arpeggio
    const stepDur = beatSec / 2;
    const stepIdx = Math.floor(t / stepDur);
    const stepPos = (t % stepDur) / stepDur;
    const arpEnv = Math.exp(-stepPos * 5.2);
    const arpFreq =
      rootFreq * 2 * track.chordRatios[stepIdx % track.chordRatios.length];
    const arp = Math.sin(2 * Math.PI * arpFreq * t) * arpEnv * 0.16;

    // Warm sub bass + soft kick pulse
    const beatPos = (t % beatSec) / beatSec;
    const kickEnv = Math.exp(-beatPos * 9.0);
    const kick = Math.sin(2 * Math.PI * (52 + 75 * kickEnv) * t) * kickEnv * 0.24;
    const bass = Math.sin(2 * Math.PI * (rootFreq * 0.5) * t) * 0.16;

    // Smooth fade-in and loop-friendly fade-out
    const fade =
      t < 0.25
        ? t / 0.25
        : t > durationSeconds - 0.35
          ? (durationSeconds - t) / 0.35
          : 1;

    const left = Math.max(-0.95, Math.min(0.95, (padL + arp * 0.9 + kick + bass) * fade));
    const right = Math.max(-0.95, Math.min(0.95, (padR + arp * 1.1 + kick + bass) * fade));

    view.setInt16(offset, Math.round(left * 32767), true);
    view.setInt16(offset + 2, Math.round(right * 32767), true);
    offset += 4;
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  blobCache.set(track.id, url);
  return url;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 25000) return "Just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
