import "server-only";
import { env } from "@/lib/env";
import { connection } from "next/server";
import { readOrNull } from "@/lib/starbase";

// What the site shows, read from Starbase per request (the pages render
// dynamically; Starbase revalidates by ETag, so an edit is live at once).

type SitePost = { slug: string; title: string; date: string; summary: string; pinned: boolean; cover_image: string | null; html?: string; text?: string };
type SiteEvent = {
  slug: string; title: string; starts_at: string; ends_at: string | null; location: string | null; capacity: number | null;
  going: number; past: boolean; full: boolean; image: string | null; rsvp_url: string; summary: string; html?: string;
};
type SiteProduct = {
  id: string; slug: string; name: string; price_cents: number; images: string[]; variants: { label: string; left: number | null }[];
  left: number | null; sold_out: boolean; summary: string; html?: string;
};
type StoreWays = { open: boolean; ways: { code: "ship" | "pickup"; label: string; note: string; cents: number }[] };

export type NewsPost = { slug: string; title: string; summary: string; publishedAt: Date; coverImage: string | null; html: string };
export type CampaignEvent = {
  slug: string; title: string; startsAt: Date; location: string; summary: string; html: string; past: boolean; full: boolean; going: number;
};
export type Product = { id: string; slug: string; name: string; description: string; priceCents: number; image: string | null; soldOut: boolean };

const post = (p: SitePost): NewsPost => ({
  slug: p.slug, title: p.title, summary: p.summary, publishedAt: new Date(`${p.date}T12:00:00-08:00`), coverImage: p.cover_image, html: p.html ?? "",
});
const event = (e: SiteEvent): CampaignEvent => ({
  slug: e.slug, title: e.title, startsAt: new Date(e.starts_at), location: e.location ?? "", summary: e.summary, html: e.html ?? "",
  past: e.past, full: e.full, going: e.going,
});
const product = (p: SiteProduct): Product => ({
  id: p.id, slug: p.slug, name: p.name, description: p.summary, priceCents: p.price_cents, image: p.images[0] ?? null, soldOut: p.sold_out,
});

export async function latestNews(limit = 3): Promise<NewsPost[]> {
  await connection();
  const r = await readOrNull<{ posts: SitePost[] }>(`/site/news?limit=${limit}`);
  return (r?.posts ?? []).map(post);
}

export async function newsBySlug(slug: string): Promise<NewsPost | null> {
  await connection();
  const r = await readOrNull<{ post: SitePost }>(`/site/news/${encodeURIComponent(slug)}`);
  return r ? post(r.post) : null;
}

export async function upcomingEvents(limit = 20): Promise<CampaignEvent[]> {
  await connection();
  const r = await readOrNull<{ events: SiteEvent[] }>("/site/events");
  return (r?.events ?? []).slice(0, limit).map(event);
}

export async function eventBySlug(slug: string): Promise<CampaignEvent | null> {
  await connection();
  const r = await readOrNull<{ event: SiteEvent }>(`/site/events/${encodeURIComponent(slug)}`);
  return r ? event(r.event) : null;
}

export async function activeProducts(): Promise<{ products: Product[]; store: StoreWays }> {
  await connection();
  const r = await readOrNull<{ products: SiteProduct[]; store: StoreWays }>("/site/products");
  return { products: (r?.products ?? []).map(product), store: r?.store ?? { open: false, ways: [] } };
}

/** The products with their Starbase ids and sizes, for a checkout. */
export async function productsForCheckout(): Promise<{ products: SiteProduct[]; store: StoreWays }> {
  const r = await readOrNull<{ products: SiteProduct[]; store: StoreWays }>("/site/products");
  return { products: r?.products ?? [], store: r?.store ?? { open: false, ways: [] } };
}

export type SiteInfo = {
  campaign: { name: string; slug: string };
  links: { donate: string; volunteer: string; newsletter: string; unsubscribe: string };
  /** This year's limit per contributor per slate, from Starbase's cap table (null when it knows no rule), and the slates. */
  donate: { limit_cents: number | null; year: number; slates: { code: string; label: string }[] };
  membership: { fee_cents: number; min_age: number; neighbourhoods: string[]; campuses: string[]; citizenship: string[] };
};

export async function siteInfo(): Promise<SiteInfo | null> {
  await connection();
  return readOrNull<SiteInfo>("/site");
}

/** The limit the donate pages quote: Starbase's figure, or CONTRIBUTION_LIMIT_CENTS when it can't be reached. */
export async function contributionLimitCents(): Promise<number> {
  const info = await siteInfo();
  return info?.donate?.limit_cents ?? env.contributionLimitCents;
}
