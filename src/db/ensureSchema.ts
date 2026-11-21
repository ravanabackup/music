import { db } from "@/db";
import { sql } from "drizzle-orm";

const globalForSchema = globalThis as typeof globalThis & {
  __pulseSchemaEnsured?: Promise<void>;
};

export function ensurePulseSchema(): Promise<void> {
  if (!globalForSchema.__pulseSchemaEnsured) {
    globalForSchema.__pulseSchemaEnsured = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pulse_sessions (
          id TEXT PRIMARY KEY,
          mode TEXT NOT NULL DEFAULT 'android_bridge',
          title TEXT NOT NULL DEFAULT 'Neon Drift (Midnight Expressway)',
          artist TEXT NOT NULL DEFAULT 'Kuroshio & Analog Syndicate',
          album TEXT NOT NULL DEFAULT 'Late Night Telemetry Vol. IV',
          app_name TEXT NOT NULL DEFAULT 'Spotify',
          is_playing BOOLEAN NOT NULL DEFAULT false,
          position_ms INTEGER NOT NULL DEFAULT 38000,
          duration_ms INTEGER NOT NULL DEFAULT 214000,
          artwork_url TEXT NOT NULL DEFAULT '/covers/neon-drift.jpg',
          volume INTEGER NOT NULL DEFAULT 85,
          webrtc_active BOOLEAN NOT NULL DEFAULT false,
          webrtc_offer TEXT,
          webrtc_answer TEXT,
          webrtc_candidates TEXT,
          position_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pulse_scrobbles (
          id SERIAL PRIMARY KEY,
          session_id TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          album TEXT NOT NULL DEFAULT '',
          app_name TEXT NOT NULL DEFAULT 'Android Media',
          duration_ms INTEGER NOT NULL DEFAULT 0,
          artwork_url TEXT NOT NULL DEFAULT '/covers/neon-drift.jpg',
          played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_pulse_scrobbles_session ON pulse_scrobbles (session_id);
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pulse_remote_commands (
          id SERIAL PRIMARY KEY,
          session_id TEXT NOT NULL,
          command TEXT NOT NULL,
          seek_position_ms INTEGER,
          volume INTEGER,
          status TEXT NOT NULL DEFAULT 'pending',
          source TEXT NOT NULL DEFAULT 'pc_viewer',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_pulse_commands_session ON pulse_remote_commands (session_id);
      `);
    })().catch((err) => {
      globalForSchema.__pulseSchemaEnsured = undefined;
      throw err;
    });
  }
  return globalForSchema.__pulseSchemaEnsured;
}
