import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const horsesTable = pgTable("horses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  sex: text("sex").notNull().default("horse"),
  color: text("color").notNull().default("bay"),
  sire: text("sire").notNull().default("Unknown"),
  dam: text("dam").notNull().default("Unknown"),
  trainer: text("trainer").notNull().default("Unknown"),
  owner: text("owner").notNull().default("Unknown"),
  totalRaces: integer("total_races").notNull().default(0),
  totalWins: integer("total_wins").notNull().default(0),
  totalPlaces: integer("total_places").notNull().default(0),
  totalShows: integer("total_shows").notNull().default(0),
  earnings: integer("earnings").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHorseSchema = createInsertSchema(horsesTable).omit({ id: true, createdAt: true });
export type InsertHorse = z.infer<typeof insertHorseSchema>;
export type Horse = typeof horsesTable.$inferSelect;
