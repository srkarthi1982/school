import type { LandingPageContent } from "../lib/landing";

export const createLandingDemoContent = ({
  startHref,
}: {
  startHref: string;
}): LandingPageContent => ({
  categoryLabel: "School Ansiversa",
  appLabel: "Backend Foundation",
  title: "School management backend",
  subtitle:
    "A clean Ansiversa foundation for school owners, admins, academics, attendance, and fees, prepared without adding domain modules before approval.",
  heroBullets: [
    "Parent Ansiversa authentication and session validation stay the source of truth",
    "Public School landing page with a protected /app backend workspace",
    "Prepared for future school workflows without fake demo data or premature tables",
  ],
  primaryCta: {
    label: "Open Workspace",
    href: startHref,
  },
  secondaryCta: {
    label: "See Workflow",
    href: "#workflow",
    variant: "ghost",
  },
  heroNote: "Foundation only: school modules will be added after approval.",
  heroPanel: {
    eyebrow: "Foundation scope",
    title: "Clean backend first",
    steps: [
      "1. Keep the app identity, routes, and auth boundary aligned",
      "2. Preserve the shared Ansiversa shell and Alpine store pattern",
      "3. Add school modules only after the baseline is verified",
    ],
    meta: [
      { value: "School", label: "App key" },
      { value: "/app", label: "Workspace" },
    ],
  },
  features: {
    title: "What the foundation includes",
    lead:
      "School starts from the current Ansiversa mini-app baseline and stays intentionally small until domain workflows are approved.",
    items: [
      {
        title: "School identity",
        description:
          "The app key, app name, metadata, package identity, and visible copy are aligned to School Ansiversa.",
      },
      {
        title: "Parent auth boundary",
        description:
          "The app keeps the standard parent login and shared JWT validation pattern instead of implementing independent authentication.",
      },
      {
        title: "Protected workspace",
        description:
          "The public landing page remains open while the School backend workspace stays protected at /app.",
      },
      {
        title: "No premature modules",
        description:
          "Students, teachers, attendance, fees, and school database tables are intentionally not created in this foundation pass.",
      },
    ],
  },
  pillars: {
    title: "Foundation guardrails",
    lead:
      "The first School version protects Ansiversa architecture before product-specific workflows begin.",
    items: [
      {
        title: "Shared components",
        description:
          "School uses the shared @ansiversa/components shell, navigation, layout rhythm, and global styling baseline.",
      },
      {
        title: "One Alpine store pattern",
        description:
          "Client behavior remains organized through the existing global Alpine store structure inherited from the baseline.",
      },
      {
        title: "SSR-first actions",
        description:
          "Future workflows should use Astro actions and server-first behavior rather than client-side shortcuts.",
      },
      {
        title: "Own database",
        description:
          "The School app is configured for its own Turso remote database while secrets stay outside committed files.",
      },
      {
        title: "Parent ownership",
        description:
          "Users, roles, sessions, and shared account behavior remain owned by the parent Ansiversa app.",
      },
      {
        title: "Freeze-safe scope",
        description:
          "This initialization avoids billing, Stripe, fake data, and unapproved school-specific features.",
      },
    ],
  },
  workflow: {
    eyebrow: "How it works",
    title: "How School starts",
    lead:
      "The first pass establishes the routes, identity, and platform boundary only.",
    steps: [
      {
        title: "Open the public landing page",
        description:
          "Visitors can reach / to understand the School backend foundation and continue through parent sign-in.",
      },
      {
        title: "Enter the protected workspace",
        description:
          "Authenticated users land at /app, where the School backend workspace placeholder is ready for approved modules.",
      },
      {
        title: "Extend after approval",
        description:
          "School-specific tables and workflows should be added only when Astra and Karthikeyan approve the next phase.",
      },
    ],
  },
  showcase: {
    eyebrow: "Prepared areas",
    title: "Ready for real school workflows later",
    description:
      "The foundation names the intended backend areas without implementing them early.",
    bullets: [
      "Owners and admins",
      "Academics and attendance",
      "Fees and operational reporting",
    ],
    calloutLabel: "Current scope",
    calloutValue: "Foundation only",
  },
  finalCta: {
    title: "Open the School backend workspace",
    description:
      "Continue through the standard Ansiversa auth flow and enter the protected School workspace.",
    primaryCta: {
      label: "Open Workspace",
      href: startHref,
    },
    secondaryCta: {
      label: "See Workflow",
      href: "#workflow",
      variant: "ghost",
    },
  },
});
