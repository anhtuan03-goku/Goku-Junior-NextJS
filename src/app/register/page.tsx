import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MinimalAuthForm } from "@/components/auth/auth-form";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";
import { SITE_CONFIG } from "@/lib/site-config";

const REGISTER_TITLE = "Create Account";
const REGISTER_DESC =
  "Create a minimalist naut.frame account in 3 steps using only a unique username and password.";

export const metadata: Metadata = {
  title: REGISTER_TITLE,
  description: REGISTER_DESC,
  alternates: {
    canonical: "/register",
  },
  openGraph: {
    type: "website",
    url: "/register",
    title: `${REGISTER_TITLE} · ${SITE_CONFIG.name}`,
    description: REGISTER_DESC,
    siteName: SITE_CONFIG.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${REGISTER_TITLE} · ${SITE_CONFIG.name}`,
    description: REGISTER_DESC,
  },
};

export default async function RegisterPage() {
  const user = await getOptionalSessionUser();
  if (user) {
    redirect("/");
  }
  return <MinimalAuthForm mode="register" />;
}
