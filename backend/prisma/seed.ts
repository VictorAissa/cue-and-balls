import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BALLS = [
    { number: 0,  type: null,      color: "#F5F5F5" }, // cue
    { number: 1,  type: "SOLIDS",  color: "#F5C400" },
    { number: 2,  type: "SOLIDS",  color: "#0000CC" },
    { number: 3,  type: "SOLIDS",  color: "#CC0000" },
    { number: 4,  type: "SOLIDS",  color: "#660099" },
    { number: 5,  type: "SOLIDS",  color: "#FF6600" },
    { number: 6,  type: "SOLIDS",  color: "#006600" },
    { number: 7,  type: "SOLIDS",  color: "#660000" },
    { number: 8,  type: null,      color: "#111111" }, // eight
    { number: 9,  type: "STRIPES", color: "#F5C400" },
    { number: 10, type: "STRIPES", color: "#0000CC" },
    { number: 11, type: "STRIPES", color: "#CC0000" },
    { number: 12, type: "STRIPES", color: "#660099" },
    { number: 13, type: "STRIPES", color: "#FF6600" },
    { number: 14, type: "STRIPES", color: "#006600" },
    { number: 15, type: "STRIPES", color: "#660000" },
];

async function main() {
    for (const ball of BALLS) {
        await prisma.ball.upsert({
            where: { number: ball.number },
            update: {},
            create: {
                number: ball.number,
                type: ball.type as any,
                color: ball.color,
            },
        });
    }
    console.log("Seeded 16 balls");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
