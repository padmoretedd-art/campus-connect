import { prisma } from "./index.js";

// DEVELOPMENT ONLY. Promotes an existing user to SUPER_ADMIN by email.
// This script must never be run against a production database, and
// production must never rely on a script like this for admin creation.
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx seedAdmin.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { role: "SUPER_ADMIN" },
  });

  console.log(`DEVELOPMENT MODE: promoted ${user.email} to SUPER_ADMIN.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
