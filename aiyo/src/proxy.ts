import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/profile/:path*",
    "/itinerary/:path*",
    "/collaborate/:path*",
  ],
};

