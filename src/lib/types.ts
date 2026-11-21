export type BroadcastMode = "android_bridge" | "browser_audio";

export type RemoteActionType =
  | "play"
  | "pause"
  | "toggle"
  | "next"
  | "previous"
  | "seek"
  | "volume";

export interface PlaybackState {
  sessionId: string;
  mode: BroadcastMode;
  title: string;
  artist: string;
  album: string;
  appName: string;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  artworkBase64OrUrl: string;
  volume: number;
  webrtcActive: boolean;
  positionUpdatedAt: string;
  updatedAt: string;
  serverNow: string;
}

export interface ScrobbleItem {
  id: number;
  sessionId: string;
  title: string;
  artist: string;
  album: string;
  appName: string;
  durationMs: number;
  artworkUrl: string;
  playedAt: string;
}

export interface RemoteCommandItem {
  id: number;
  sessionId: string;
  command: RemoteActionType;
  seekPositionMs: number | null;
  volume: number | null;
  status: string;
  source: string;
  createdAt: string;
}

export interface WebRTCSignalMessage {
  type: "offer" | "answer" | "candidate" | "hangup" | "request-offer";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  senderId: string;
  timestamp: string;
}

export interface PresenceSummary {
  viewers: number;
  broadcasters: number;
  totalConnections: number;
}

export type StreamEventPayload =
  | { event: "state"; data: PlaybackState }
  | { event: "scrobble"; data: ScrobbleItem }
  | { event: "command"; data: RemoteCommandItem }
  | { event: "webrtc"; data: WebRTCSignalMessage }
  | { event: "presence"; data: PresenceSummary };
