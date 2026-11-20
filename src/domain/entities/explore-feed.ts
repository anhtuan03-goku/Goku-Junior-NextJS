import type { ExternalImageItem } from "./models";

export const EXPLORE_PAGE_SIZE = 30;
export const MAX_EXPLORE_PAGES = 500;

export function getExploreImageKey(item: ExternalImageItem): string {
  const original = item.provider === "picsum" && item.photographer?.portfolioUrl;
  if (original) {
    try {
      const url = new URL(original);
      if (url.origin === "https://unsplash.com" || url.origin === "https://www.unsplash.com") {
        const photoId = /^\/photos\/(?:[^/]+-)?([\w-]{11})\/?$/.exec(url.pathname)?.[1];
        if (photoId) return `unsplash:${photoId}`;
      }
    } catch {
      // A provider's own id still identifies an image with missing or invalid source metadata.
    }
  }
  return `${item.provider}:${item.externalId}`;
}
