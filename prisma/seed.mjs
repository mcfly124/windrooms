// Idempotent seed: superadmin + the 4 Flyspot locations + Gdansk's 6 rooms.
// Run with: npm run seed
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

const LOCATIONS = [
  { name: "Gdańsk", slug: "gdansk", publicBookingEnabled: false, releaseWindowDays: 14 },
  { name: "Katowice", slug: "katowice" },
  { name: "Warsaw", slug: "warsaw" },
  { name: "Wrocław", slug: "wroclaw" },
];

const GDANSK_ROOMS = [
  { name: "S1", type: "SINGLE" },
  { name: "S2", type: "SINGLE" },
  { name: "S3", type: "SINGLE" },
  { name: "D1", type: "DOUBLE" },
  { name: "D2", type: "DOUBLE" },
  { name: "D3", type: "DOUBLE" },
];

async function main() {
  for (const loc of LOCATIONS) {
    await prisma.location.upsert({ where: { slug: loc.slug }, create: loc, update: {} });
  }
  const gdansk = await prisma.location.findUnique({ where: { slug: "gdansk" } });
  for (const room of GDANSK_ROOMS) {
    await prisma.room.upsert({
      where: { locationId_name: { locationId: gdansk.id, name: room.name } },
      create: { ...room, locationId: gdansk.id },
      update: {},
    });
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? "").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    await prisma.user.upsert({
      where: { email },
      create: { email, name: "Super Admin", role: "SUPERADMIN", passwordHash: hashPassword(password) },
      update: {},
    });
    console.log(`Superadmin ready: ${email}`);
  } else {
    console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipped superadmin");
  }
  console.log("Seed complete: 4 locations, Gdansk rooms S1-S3 / D1-D3");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
