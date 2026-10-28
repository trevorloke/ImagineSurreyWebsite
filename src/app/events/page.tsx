import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { dayAndMonth, formatEventTime } from "@/lib/dates";
import { upcomingEvents } from "@/lib/server/content";

export const metadata: Metadata = { title: "Events", description: "Come and meet Imagine Surrey at an event near you." };

export default async function EventsIndex() {
  const events = await upcomingEvents(50);
  return (
    <>
      <PageHead title="Come and meet us">Town halls, door-knocking, socials, and neighbourhood meetings across Surrey.</PageHead>
      <section className="section section--red on-dark">
        <div className="container stack" style={{ gap: 16 }}>
          {events.length === 0 ? (
            <p className="lede" style={{ color: "#fff" }}>
              No events are booked right now. <Link href="/#newsletter" style={{ color: "#fff" }}>Get the newsletter</Link> and we&apos;ll tell you when the next one is.
            </p>
          ) : (
            events.map((ev) => {
              const { day, mon } = dayAndMonth(ev.startsAt);
              return (
                <article key={ev.slug} className="event-feature">
                  <div className="date-badge">
                    <span className="day">{day}</span>
                    <span className="mon">{mon}</span>
                  </div>
                  <div className="info">
                    <h2 style={{ margin: 0, fontWeight: 800, fontSize: 28, lineHeight: 1.15, color: "#fff" }}>{ev.title}</h2>
                    <p className="event-when">
                      {formatEventTime(ev.startsAt)}, {ev.location}
                    </p>
                    <p className="summary">{ev.summary}</p>
                  </div>
                  <Link href={`/events/${ev.slug}`} className="btn btn--yellow btn--lg">
                    RSVP<span className="visually-hidden"> for {ev.title}</span>
                  </Link>
                </article>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
