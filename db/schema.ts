import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const siteUsers = sqliteTable("site_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [index("idx_site_users_email").on(table.email)]);

export const scoreProfiles = sqliteTable("score_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => siteUsers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  scoresJson: text("scores_json").notNull(),
  individualAchievements: integer("individual_achievements").notNull().default(0),
  dviScore: integer("dvi_score"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_score_profiles_user_updated").on(table.userId, table.updatedAt)]);

export const userFavorites = sqliteTable("user_favorites", {
  userId: text("user_id").notNull().references(() => siteUsers.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.programId] }),
  index("idx_user_favorites_user_created").on(table.userId, table.createdAt),
]);

export const comparisonItems = sqliteTable("comparison_items", {
  userId: text("user_id").notNull().references(() => siteUsers.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull(),
  position: integer("position").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.programId] }),
  index("idx_comparison_items_user_position").on(table.userId, table.position),
]);

export const userAuditLog = sqliteTable("user_audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => siteUsers.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  summaryJson: text("summary_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_user_audit_log_user_created").on(table.userId, table.createdAt)]);
