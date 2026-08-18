import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import type { ScoreSet } from "@/lib/admissions/types";
import type { UserState } from "./types";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS site_users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_site_users_email ON site_users (email)",
  `CREATE TABLE IF NOT EXISTS score_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    scores_json TEXT NOT NULL,
    individual_achievements INTEGER NOT NULL DEFAULT 0,
    dvi_score INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_score_profiles_user_updated ON score_profiles (user_id, updated_at)",
  `CREATE TABLE IF NOT EXISTS user_favorites (
    user_id TEXT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
    program_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, program_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_user_favorites_user_created ON user_favorites (user_id, created_at)",
  `CREATE TABLE IF NOT EXISTS comparison_items (
    user_id TEXT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
    program_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, program_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_comparison_items_user_position ON comparison_items (user_id, position)",
  `CREATE TABLE IF NOT EXISTS user_audit_log (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_user_audit_log_user_created ON user_audit_log (user_id, created_at)",
] as const;

let schemaReady: Promise<void> | null = null;

async function ensureSchema(db: D1Database) {
  schemaReady ??= (async () => {
    await db.prepare("PRAGMA foreign_keys = ON").run();
    await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
    await db.prepare("PRAGMA optimize").run();
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

async function touchUser(db: D1Database, user: ChatGPTUser) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO site_users (id, email, full_name, created_at, updated_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, full_name = excluded.full_name,
      updated_at = excluded.updated_at, last_seen_at = excluded.last_seen_at`)
    .bind(user.userId, user.email, user.fullName, now, now, now)
    .run();
}

type ScoreProfileRow = {
  id: string;
  name: string;
  scores_json: string;
  individual_achievements: number;
  dvi_score: number | null;
  updated_at: string;
};

function parseScoreProfile(row: ScoreProfileRow): ScoreSet | null {
  try {
    const scores = JSON.parse(row.scores_json) as Record<string, number>;
    if (!scores || typeof scores !== "object" || Array.isArray(scores)) return null;
    return {
      id: row.id,
      name: row.name,
      scores,
      individualAchievements: row.individual_achievements,
      dviScore: row.dvi_score ?? undefined,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export async function loadUserState(user: ChatGPTUser): Promise<UserState> {
  const db = await getD1();
  await ensureSchema(db);
  await touchUser(db, user);

  const [favorites, comparison, profiles] = await Promise.all([
    db.prepare("SELECT program_id FROM user_favorites WHERE user_id = ? ORDER BY created_at ASC").bind(user.userId).all<{ program_id: string }>(),
    db.prepare("SELECT program_id FROM comparison_items WHERE user_id = ? ORDER BY position ASC").bind(user.userId).all<{ program_id: string }>(),
    db.prepare(`SELECT id, name, scores_json, individual_achievements, dvi_score, updated_at
      FROM score_profiles WHERE user_id = ? ORDER BY updated_at DESC`).bind(user.userId).all<ScoreProfileRow>(),
  ]);

  return {
    favoriteIds: (favorites.results ?? []).map((row) => row.program_id),
    comparisonIds: (comparison.results ?? []).map((row) => row.program_id),
    scoreSets: (profiles.results ?? []).map(parseScoreProfile).filter((item): item is ScoreSet => item !== null),
  };
}

export async function saveUserState(user: ChatGPTUser, state: UserState): Promise<UserState> {
  const db = await getD1();
  await ensureSchema(db);
  await touchUser(db, user);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM user_favorites WHERE user_id = ?").bind(user.userId),
    db.prepare("DELETE FROM comparison_items WHERE user_id = ?").bind(user.userId),
    db.prepare("DELETE FROM score_profiles WHERE user_id = ?").bind(user.userId),
  ];

  for (const programId of state.favoriteIds) {
    statements.push(db.prepare("INSERT INTO user_favorites (user_id, program_id, created_at) VALUES (?, ?, ?)").bind(user.userId, programId, now));
  }
  state.comparisonIds.forEach((programId, position) => {
    statements.push(db.prepare("INSERT INTO comparison_items (user_id, program_id, position, created_at) VALUES (?, ?, ?, ?)").bind(user.userId, programId, position, now));
  });
  for (const profile of state.scoreSets) {
    statements.push(db.prepare(`INSERT INTO score_profiles
      (id, user_id, name, scores_json, individual_achievements, dvi_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(profile.id, user.userId, profile.name, JSON.stringify(profile.scores), profile.individualAchievements, profile.dviScore ?? null, now, profile.updatedAt));
  }
  statements.push(db.prepare(`INSERT INTO user_audit_log
    (id, user_id, action, entity_type, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), user.userId, "SYNC_USER_STATE", "USER_STATE", JSON.stringify({ favorites: state.favoriteIds.length, comparison: state.comparisonIds.length, scoreProfiles: state.scoreSets.length }), now));

  await db.batch(statements);
  return state;
}
