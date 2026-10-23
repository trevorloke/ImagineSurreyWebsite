import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { products } from "../src/lib/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL first (see .env.example).");

// The shop as designed. Safe to re-run: existing products keep their prices.
const catalogue = [
  { slug: "stop-doug-lawn-sign", name: "Stop Doug lawn sign", priceCents: 2000, tileLabel: "Stop Doug", tileBackground: "#EF2023", tileForeground: "#FFFFFF" },
  { slug: "t-shirt", name: "Imagine Surrey T-shirt", priceCents: 3000, tileLabel: "Fighting for Surrey", tileBackground: "#003979", tileForeground: "#FFF100" },
  { slug: "button-3-pack", name: "Button 3-pack", priceCents: 1000, tileLabel: "Buttons", tileBackground: "#FFF100", tileForeground: "#003979" },
  { slug: "tote-bag", name: "Tote bag", priceCents: 2500, tileLabel: "Imagine Surrey", tileBackground: "#FFFFFF", tileForeground: "#003979" },
  { slug: "hoodie", name: "Imagine Surrey hoodie", priceCents: 5500, tileLabel: "Imagine Surrey", tileBackground: "#00285A", tileForeground: "#FFF100" },
  { slug: "window-sign", name: "Window sign", priceCents: 500, tileLabel: "SkyTrain to South Surrey", tileBackground: "#FFFFFF", tileForeground: "#EF2023" },
];

const client = postgres(url, { max: 1 });
const db = drizzle(client);
await db
  .insert(products)
  .values(catalogue.map((p, i) => ({ ...p, sortOrder: i })))
  .onConflictDoNothing({ target: products.slug });
await client.end();
console.log(`Seeded ${catalogue.length} products.`);
