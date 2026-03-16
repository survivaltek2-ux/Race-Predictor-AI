import { db, tracksTable, horsesTable, racesTable, raceEntriesTable } from "@workspace/db";

async function seed() {
  console.log("Seeding horse racing data...");

  const existingTracks = await db.select().from(tracksTable);
  if (existingTracks.length > 0) {
    console.log("Data already seeded, skipping.");
    process.exit(0);
  }

  const tracks = await db.insert(tracksTable).values([
    { name: "Churchill Downs", location: "Louisville, KY", state: "Kentucky", surface: "dirt" },
    { name: "Santa Anita Park", location: "Arcadia, CA", state: "California", surface: "dirt/turf" },
    { name: "Belmont Park", location: "Elmont, NY", state: "New York", surface: "dirt/turf" },
    { name: "Saratoga Race Course", location: "Saratoga Springs, NY", state: "New York", surface: "dirt/turf" },
    { name: "Keeneland", location: "Lexington, KY", state: "Kentucky", surface: "dirt/turf" },
    { name: "Gulfstream Park", location: "Hallandale Beach, FL", state: "Florida", surface: "dirt/turf" },
    { name: "Del Mar", location: "Del Mar, CA", state: "California", surface: "dirt/turf" },
    { name: "Oaklawn Park", location: "Hot Springs, AR", state: "Arkansas", surface: "dirt" },
  ]).returning();

  console.log(`Inserted ${tracks.length} tracks`);

  const horses = await db.insert(horsesTable).values([
    { name: "Thunder Ridge", age: 4, sex: "horse", color: "bay", sire: "Pioneerof the Nile", dam: "Storm Flag Flying", trainer: "Bob Baffert", owner: "Triple Crown Stables", totalRaces: 12, totalWins: 5, totalPlaces: 3, totalShows: 2, earnings: 850000 },
    { name: "Golden Arrow", age: 3, sex: "colt", color: "chestnut", sire: "American Pharoah", dam: "Golden Sash", trainer: "Chad Brown", owner: "Klaravich Stables", totalRaces: 8, totalWins: 4, totalPlaces: 2, totalShows: 1, earnings: 620000 },
    { name: "Midnight Storm", age: 5, sex: "gelding", color: "dark bay", sire: "Curlin", dam: "Midnight Lady", trainer: "Todd Pletcher", owner: "WinStar Farm", totalRaces: 20, totalWins: 7, totalPlaces: 5, totalShows: 4, earnings: 1200000 },
    { name: "Desert Wind", age: 4, sex: "horse", color: "gray", sire: "War Front", dam: "Sand Storm", trainer: "Steve Asmussen", owner: "Calumet Farm", totalRaces: 15, totalWins: 4, totalPlaces: 4, totalShows: 3, earnings: 540000 },
    { name: "Lucky Star", age: 3, sex: "filly", color: "bay", sire: "Justify", dam: "Lucky Charm", trainer: "John Sadler", owner: "Hronis Racing", totalRaces: 6, totalWins: 3, totalPlaces: 2, totalShows: 0, earnings: 380000 },
    { name: "Iron Horse", age: 6, sex: "gelding", color: "brown", sire: "Tapit", dam: "Iron Maiden", trainer: "Mark Casse", owner: "Fern Hill Stable", totalRaces: 28, totalWins: 8, totalPlaces: 7, totalShows: 6, earnings: 1850000 },
    { name: "Royal Flush", age: 4, sex: "horse", color: "chestnut", sire: "Into Mischief", dam: "Royal Rumble", trainer: "Brad Cox", owner: "Eclipse Thoroughbreds", totalRaces: 11, totalWins: 6, totalPlaces: 2, totalShows: 1, earnings: 920000 },
    { name: "Silver Bullet", age: 3, sex: "colt", color: "gray", sire: "Nyquist", dam: "Silver Bell", trainer: "Mike Maker", owner: "Juddmonte Farms", totalRaces: 7, totalWins: 3, totalPlaces: 3, totalShows: 0, earnings: 290000 },
    { name: "Crimson Rose", age: 4, sex: "mare", color: "chestnut", sire: "Medaglia d'Oro", dam: "Red Rose", trainer: "Christophe Clement", owner: "Stonestreet Stables", totalRaces: 14, totalWins: 5, totalPlaces: 4, totalShows: 2, earnings: 710000 },
    { name: "Blue Thunder", age: 5, sex: "horse", color: "dark bay", sire: "Distorted Humor", dam: "Blue Sky", trainer: "Dale Romans", owner: "Gary and Mary West", totalRaces: 18, totalWins: 6, totalPlaces: 5, totalShows: 4, earnings: 980000 },
    { name: "Shooting Star", age: 3, sex: "colt", color: "bay", sire: "Constitution", dam: "Stardust", trainer: "Bill Mott", owner: "Repole Stable", totalRaces: 5, totalWins: 2, totalPlaces: 2, totalShows: 1, earnings: 175000 },
    { name: "Wind Dancer", age: 4, sex: "filly", color: "gray", sire: "Speightstown", dam: "Dance Away", trainer: "Wesley Ward", owner: "Team Valor", totalRaces: 13, totalWins: 5, totalPlaces: 3, totalShows: 3, earnings: 650000 },
  ]).returning();

  console.log(`Inserted ${horses.length} horses`);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const races = await db.insert(racesTable).values([
    { trackId: tracks[0].id, raceNumber: 7, raceName: "Churchill Downs Derby Trial", raceDate: fmt(tomorrow), postTime: "5:30 PM", distance: "1 1/16 miles", surface: "dirt", purse: 100000, conditions: "For 3-year-olds. Allowance.", status: "upcoming" },
    { trackId: tracks[0].id, raceNumber: 9, raceName: "Clark Handicap", raceDate: fmt(tomorrow), postTime: "7:00 PM", distance: "1 1/8 miles", surface: "dirt", purse: 500000, conditions: "For 3-year-olds & up. Grade I.", status: "upcoming" },
    { trackId: tracks[1].id, raceNumber: 6, raceName: "Santa Anita Handicap", raceDate: fmt(today), postTime: "4:00 PM", distance: "1 1/4 miles", surface: "dirt", purse: 300000, conditions: "For 4-year-olds & up. Grade II.", status: "upcoming" },
    { trackId: tracks[2].id, raceNumber: 5, raceName: "Belmont Stakes Trial", raceDate: fmt(today), postTime: "3:45 PM", distance: "1 mile", surface: "dirt", purse: 75000, conditions: "For 3-year-olds. Allowance.", status: "upcoming" },
    { trackId: tracks[3].id, raceNumber: 8, raceName: "Travers Stakes", raceDate: fmt(yesterday), postTime: "5:45 PM", distance: "1 1/4 miles", surface: "dirt", purse: 1000000, conditions: "For 3-year-olds. Grade I.", status: "completed", winnerHorseId: horses[1].id },
    { trackId: tracks[4].id, raceNumber: 4, raceName: "Blue Grass Stakes", raceDate: fmt(lastWeek), postTime: "6:00 PM", distance: "1 1/8 miles", surface: "dirt", purse: 500000, conditions: "For 3-year-olds. Grade II.", status: "completed", winnerHorseId: horses[0].id },
  ]).returning();

  console.log(`Inserted ${races.length} races`);

  await db.insert(raceEntriesTable).values([
    { raceId: races[0].id, horseId: horses[0].id, postPosition: 1, jockey: "Irad Ortiz Jr.", trainer: "Bob Baffert", morningLineOdds: "2-1", weight: 126, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1 },
    { raceId: races[0].id, horseId: horses[1].id, postPosition: 2, jockey: "Flavien Prat", trainer: "Chad Brown", morningLineOdds: "3-1", weight: 126, lastRaceDate: fmt(lastWeek), lastRaceFinish: 2 },
    { raceId: races[0].id, horseId: horses[2].id, postPosition: 3, jockey: "Luis Saez", trainer: "Todd Pletcher", morningLineOdds: "4-1", weight: 126, lastRaceDate: fmt(yesterday), lastRaceFinish: 3 },
    { raceId: races[0].id, horseId: horses[6].id, postPosition: 4, jockey: "John Velazquez", trainer: "Brad Cox", morningLineOdds: "5-2", weight: 126, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1 },
    { raceId: races[0].id, horseId: horses[3].id, postPosition: 5, jockey: "Ricardo Santana Jr.", trainer: "Steve Asmussen", morningLineOdds: "8-1", weight: 126, lastRaceDate: fmt(yesterday), lastRaceFinish: 4 },

    { raceId: races[1].id, horseId: horses[5].id, postPosition: 1, jockey: "Jose Ortiz", trainer: "Mark Casse", morningLineOdds: "3-1", weight: 118, lastRaceDate: fmt(yesterday), lastRaceFinish: 2 },
    { raceId: races[1].id, horseId: horses[9].id, postPosition: 2, jockey: "Tyler Gaffalione", trainer: "Dale Romans", morningLineOdds: "4-1", weight: 115, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1 },
    { raceId: races[1].id, horseId: horses[0].id, postPosition: 3, jockey: "Irad Ortiz Jr.", trainer: "Bob Baffert", morningLineOdds: "5-2", weight: 122, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1 },
    { raceId: races[1].id, horseId: horses[6].id, postPosition: 4, jockey: "John Velazquez", trainer: "Brad Cox", morningLineOdds: "2-1", weight: 120, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1 },
    { raceId: races[1].id, horseId: horses[2].id, postPosition: 5, jockey: "Luis Saez", trainer: "Todd Pletcher", morningLineOdds: "6-1", weight: 116, lastRaceDate: fmt(yesterday), lastRaceFinish: 3 },
    { raceId: races[1].id, horseId: horses[3].id, postPosition: 6, jockey: "Ricardo Santana Jr.", trainer: "Steve Asmussen", morningLineOdds: "10-1", weight: 114, lastRaceDate: fmt(yesterday), lastRaceFinish: 4 },

    { raceId: races[2].id, horseId: horses[2].id, postPosition: 1, jockey: "Luis Saez", trainer: "Todd Pletcher", morningLineOdds: "3-1", weight: 118, lastRaceDate: fmt(yesterday), lastRaceFinish: 2 },
    { raceId: races[2].id, horseId: horses[5].id, postPosition: 2, jockey: "Jose Ortiz", trainer: "Mark Casse", morningLineOdds: "5-2", weight: 120, lastRaceDate: fmt(yesterday), lastRaceFinish: 2 },
    { raceId: races[2].id, horseId: horses[9].id, postPosition: 3, jockey: "Tyler Gaffalione", trainer: "Dale Romans", morningLineOdds: "4-1", weight: 117, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1 },
    { raceId: races[2].id, horseId: horses[11].id, postPosition: 4, jockey: "Drayden Van Dyke", trainer: "Wesley Ward", morningLineOdds: "7-1", weight: 117, lastRaceDate: fmt(lastWeek), lastRaceFinish: 3 },
    { raceId: races[2].id, horseId: horses[7].id, postPosition: 5, jockey: "Mike Smith", trainer: "Mike Maker", morningLineOdds: "6-1", weight: 118, lastRaceDate: fmt(lastWeek), lastRaceFinish: 2 },

    { raceId: races[3].id, horseId: horses[1].id, postPosition: 1, jockey: "Flavien Prat", trainer: "Chad Brown", morningLineOdds: "2-1", weight: 126, lastRaceDate: fmt(yesterday), lastRaceFinish: 1 },
    { raceId: races[3].id, horseId: horses[7].id, postPosition: 2, jockey: "Mike Smith", trainer: "Mike Maker", morningLineOdds: "5-1", weight: 118, lastRaceDate: fmt(lastWeek), lastRaceFinish: 2 },
    { raceId: races[3].id, horseId: horses[10].id, postPosition: 3, jockey: "Joel Rosario", trainer: "Bill Mott", morningLineOdds: "8-1", weight: 118, lastRaceDate: fmt(lastWeek), lastRaceFinish: 3 },
    { raceId: races[3].id, horseId: horses[8].id, postPosition: 4, jockey: "Javier Castellano", trainer: "Christophe Clement", morningLineOdds: "4-1", weight: 120, lastRaceDate: fmt(lastWeek), lastRaceFinish: 2 },
    { raceId: races[3].id, horseId: horses[4].id, postPosition: 5, jockey: "Drayden Van Dyke", trainer: "John Sadler", morningLineOdds: "9-2", weight: 121, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1 },

    { raceId: races[4].id, horseId: horses[1].id, postPosition: 1, jockey: "Flavien Prat", trainer: "Chad Brown", morningLineOdds: "3-1", weight: 126, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1, finishPosition: 1 },
    { raceId: races[4].id, horseId: horses[6].id, postPosition: 2, jockey: "John Velazquez", trainer: "Brad Cox", morningLineOdds: "5-2", weight: 126, lastRaceDate: fmt(lastWeek), lastRaceFinish: 2, finishPosition: 2 },
    { raceId: races[4].id, horseId: horses[2].id, postPosition: 3, jockey: "Luis Saez", trainer: "Todd Pletcher", morningLineOdds: "4-1", weight: 126, lastRaceDate: fmt(lastWeek), lastRaceFinish: 3, finishPosition: 3 },
    { raceId: races[4].id, horseId: horses[0].id, postPosition: 4, jockey: "Irad Ortiz Jr.", trainer: "Bob Baffert", morningLineOdds: "2-1", weight: 126, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1, finishPosition: 4 },

    { raceId: races[5].id, horseId: horses[0].id, postPosition: 1, jockey: "Irad Ortiz Jr.", trainer: "Bob Baffert", morningLineOdds: "2-1", weight: 126, lastRaceDate: fmt(lastWeek), lastRaceFinish: 1, finishPosition: 1 },
    { raceId: races[5].id, horseId: horses[3].id, postPosition: 2, jockey: "Ricardo Santana Jr.", trainer: "Steve Asmussen", morningLineOdds: "8-1", weight: 126, lastRaceDate: fmt(lastWeek), lastRaceFinish: 4, finishPosition: 2 },
    { raceId: races[5].id, horseId: horses[5].id, postPosition: 3, jockey: "Jose Ortiz", trainer: "Mark Casse", morningLineOdds: "3-1", weight: 118, lastRaceDate: fmt(lastWeek), lastRaceFinish: 2, finishPosition: 3 },
  ]);

  console.log("Seeded race entries");
  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
