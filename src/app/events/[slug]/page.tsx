import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RsvpForm } from "@/components/forms/RsvpForm";
import { PageHead } from "@/components/PageHead";
import { Prose } from "@/components/Prose";
import { formatEventTime } from "@/lib/dates";
import { eventBySlug } from "@/lib/server/content";

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const event = await eventBySlug((await params).slug);
  return event ? { title: event.title, description: event.summary } : {};
}

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const event = await eventBySlug((await params).slug);
  if (!event) notFound();
  const past = event.startsAt < new Date();
  return (
    <>
      <PageHead title={event.title} eyebrow={`${formatEventTime(event.startsAt)} · ${event.location}`}>
        {event.summary}
      </PageHead>
      <section className="section">
        <div className="container split">
          <div className="stack" style={{ flex: "1 1 420px", gap: 24 }}>
            {event.description ? <Prose text={event.description} /> : null}
            <Link href="/events" className="text-link">
              ← All events
            </Link>
          </div>
          <div style={{ flex: "1 1 380px" }}>
            {past ? <p className="empty-state">This event has already happened.</p> : <RsvpForm slug={event.slug} />}
          </div>
        </div>
      </section>
    </>
  );
}
