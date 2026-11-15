import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MinimalAuthForm } from "@/components/auth/auth-form";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";
import { SITE_CONFIG } from "@/lib/site-config";

const LOGIN_TITLE = "Sign In";
const LOGIN_DESC =
  "Sign in to your naut.frame account to access your saved photography collection and private or public visual stories.";

export const metadata: Metadata = {
  title: LOGIN_TITLE,
  description: LOGIN_DESC,
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    type: "website",
    url: "/login",
    title: `${LOGIN_TITLE} · ${SITE_CONFIG.name}`,
    description: LOGIN_DESC,
    siteName: SITE_CONFIG.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${LOGIN_TITLE} · ${SITE_CONFIG.name}`,
    description: LOGIN_DESC,
  },
};

export default async function LoginPage() {
  const user = await getOptionalSessionUser();
  if (user) {
    redirect(user.role === "ADMIN" ? "/admin" : "/");
  }
  return <MinimalAuthForm mode="login" />;
}
