import { createSuccess } from "../src/lib/api-response";
import { prisma } from "../src/lib/prisma";
import { getBootstrapPayload } from "../src/server/data/appStateService";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  if (users.length === 0) {
    console.log("smoke-bootstrap: no users in database");
    process.exit(0);
  }

  console.log(`smoke-bootstrap: ${users.length} user(s)`);
  let allOk = true;
  try {
    for (const user of users) {
      try {
        const payload = await getBootstrapPayload(user.id);
        JSON.stringify(createSuccess(payload));
        console.log(
          "ok",
          user.email,
          payload.trip?.tripId ?? "(no-trip)",
          payload.collaboration?.inviteCode ?? "(no-collab)",
        );
      } catch (error) {
        allOk = false;
        console.error("FAIL", user.email, user.id, error);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (!allOk) {
    process.exit(1);
  }
}

void main();
