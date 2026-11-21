import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const sessions = pgTable("pulse_sessions", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull().default("android_bridge"),
  title: text("title").notNull().default("Neon Drift (Midnight Expressway)"),
  artist: text("artist").notNull().default("Kuroshio & Analog Syndicate"),
  album: text("album").notNull().default("Late Night Telemetry Vol. IV"),
  appName: text("app_name").notNull().default("Spotify"),
  isPlaying: boolean("is_playing").notNull().default(false),
  positionMs: integer("position_ms").notNull().default(38000),
  durationMs: integer("duration_ms").notNull().default(214000),
  artworkUrl: text("artwork_url").notNull().default("/covers/neon-drift.jpg"),
  volume: integer("volume").notNull().default(85),
  webrtcActive: boolean("webrtc_active").notNull().default(false),
  webrtcOffer: text("webrtc_offer"),
  webrtcAnswer: text("webrtc_answer"),
  webrtcCandidates: text("webrtc_candidates"),
  positionUpdatedAt: timestamp("position_updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const scrobbles = pgTable(
  "pulse_scrobbles",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    album: text("album").notNull().default(""),
    appName: text("app_name").notNull().default("Android Media"),
    durationMs: integer("duration_ms").notNull().default(0),
    artworkUrl: text("artwork_url").notNull().default("/covers/neon-drift.jpg"),
    playedAt: timestamp("played_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_pulse_scrobbles_session").on(table.sessionId)]
);

export const remoteCommands = pgTable(
  "pulse_remote_commands",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    command: text("command").notNull(),
    seekPositionMs: integer("seek_position_ms"),
    volume: integer("volume"),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("pc_viewer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_pulse_commands_session").on(table.sessionId)]
);

export type SessionRow = typeof sessions.$inferSelect;
export type ScrobbleRow = typeof scrobbles.$inferSelect;
export type RemoteCommandRow = typeof remoteCommands.$inferSelect;
