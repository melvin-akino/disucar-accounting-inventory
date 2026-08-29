export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/((?!login|order|_next/static|_next/image|favicon.ico|api/auth|api/uploads).*)",
  ],
};
