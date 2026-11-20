import type { Metadata } from "next";
import { ZeroPiiPolicyContent } from "@/components/privacy/privacy-content";
import { SITE_CONFIG } from "@/lib/site-config";

// Static policy content (zero DB queries required)
const PRIVACY_TITLE = "Privacy Policy";
const PRIVACY_DESC =
  "Learn what naut.frame asks for when you sign up and how you can control who sees your posts.";

export const metadata: Metadata = {
  title: PRIVACY_TITLE,
  description: PRIVACY_DESC,
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    type: "article",
    url: "/privacy",
    title: `${PRIVACY_TITLE} · ${SITE_CONFIG.name}`,
    description: PRIVACY_DESC,
    siteName: SITE_CONFIG.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRIVACY_TITLE} · ${SITE_CONFIG.name}`,
    description: PRIVACY_DESC,
  },
};

export default function ZeroPiiPolicyPage() {
  return <ZeroPiiPolicyContent />;
}
