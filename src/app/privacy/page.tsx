import type { Metadata } from "next";
import { ZeroPiiPolicyContent } from "@/components/privacy/privacy-content";
import { SITE_CONFIG } from "@/lib/site-config";

// Static policy content (zero DB queries required)
const PRIVACY_TITLE = "Zero-PII Privacy Policy";
const PRIVACY_DESC =
  "How naut.frame protects your identity with strict Zero-PII authentication, one-way cryptographic hashing, anonymous appreciation, and single-slot media storage.";

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
