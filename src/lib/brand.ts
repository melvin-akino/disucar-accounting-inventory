/**
 * Central branding config — all UI and print docs read from here.
 * Set NEXT_PUBLIC_ORG_* env vars to customise without a code change.
 */
export const brand = {
  name:    process.env.NEXT_PUBLIC_ORG_NAME    ?? "Disucar Sales Inc",
  tagline: process.env.NEXT_PUBLIC_ORG_TAGLINE ?? "Grocery & FMCG Distribution",
  address: process.env.NEXT_PUBLIC_ORG_ADDRESS ?? "3F Greenfield Tower, Mandaluyong City, Metro Manila 1550",
  phone:   process.env.NEXT_PUBLIC_ORG_PHONE   ?? "+63 2 8123 4567",
  email:   process.env.NEXT_PUBLIC_ORG_EMAIL   ?? "info@disucarsales.ph",
  tin:     process.env.NEXT_PUBLIC_ORG_TIN     ?? "123-456-789-000",
  website: process.env.NEXT_PUBLIC_ORG_WEBSITE ?? "www.disucarsales.ph",
  color:   process.env.NEXT_PUBLIC_ORG_COLOR   ?? "#003087",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL    ?? "",
} as const;
