import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Safety: this script irreversibly deletes all users and their related data
  // in the currently configured DATABASE_URL.
  console.log("[db:clear-users] DATABASE_URL =", process.env.DATABASE_URL ? "(set)" : "(missing)");

  const result = await prisma.$transaction(async (tx) => {
    const sessions = await tx.session.deleteMany();
    const accounts = await tx.account.deleteMany();
    const verificationTokens = await tx.verificationToken.deleteMany();

    const comments = await tx.comment.deleteMany();
    const presences = await tx.collaborationPresence.deleteMany();
    const rooms = await tx.collaborationRoom.deleteMany();

    const chatMessages = await tx.chatMessage.deleteMany();

    const tripItems = await tx.tripItem.deleteMany();
    const mapPins = await tx.mapPin.deleteMany();
    const trips = await tx.trip.deleteMany();

    const profiles = await tx.profile.deleteMany();
    const users = await tx.user.deleteMany();

    return {
      sessions: sessions.count,
      accounts: accounts.count,
      verificationTokens: verificationTokens.count,
      comments: comments.count,
      presences: presences.count,
      rooms: rooms.count,
      chatMessages: chatMessages.count,
      tripItems: tripItems.count,
      mapPins: mapPins.count,
      trips: trips.count,
      profiles: profiles.count,
      users: users.count,
    };
  });

  console.log("[db:clear-users] Deleted:", result);
}

main()
  .catch((error) => {
    console.error("[db:clear-users] Failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

