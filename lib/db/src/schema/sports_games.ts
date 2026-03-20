import { pgTable, serial, text, integer, timestamp, real, index } from "drizzle-orm/pg-core";

export const sportsGamesTable = pgTable(
  "sports_games",
  {
    id: serial("id").primaryKey(),
    externalId: text("external_id").notNull().unique(),
    sportKey: text("sport_key").notNull(),
    sportTitle: text("sport_title").notNull(),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    winner: text("winner"), // 'home', 'away', 'draw', or null if not finished
    gameDate: timestamp("game_date").notNull(),
    completed: timestamp("completed"), // When game actually finished, if known
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("sports_games_sport_key_idx").on(table.sportKey),
    index("sports_games_teams_idx").on(table.homeTeam, table.awayTeam),
    index("sports_games_date_idx").on(table.gameDate),
  ]
);

export const sportsTeamStatsTable = pgTable(
  "sports_team_stats",
  {
    id: serial("id").primaryKey(),
    teamName: text("team_name").notNull(),
    sportKey: text("sport_key").notNull(),
    season: integer("season").notNull(), // e.g., 2025, 2024
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    pointsFor: real("points_for").notNull().default(0),
    pointsAgainst: real("points_against").notNull().default(0),
    powerRating: real("power_rating"), // Computed from stats
    elo: real("elo"), // Computed Elo rating
    lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  },
  (table) => [
    index("sports_team_stats_team_sport_season_idx").on(table.teamName, table.sportKey, table.season),
    index("sports_team_stats_sport_season_idx").on(table.sportKey, table.season),
  ]
);

export type SportsGame = typeof sportsGamesTable.$inferSelect;
export type SportsTeamStats = typeof sportsTeamStatsTable.$inferSelect;
