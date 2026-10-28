import Image from "next/image";
import Link from "next/link";
import { DonateWidget } from "@/components/forms/DonateWidget";
import { MembershipForm } from "@/components/forms/MembershipForm";
import { NewsletterForm } from "@/components/forms/NewsletterForm";
import { SignatureForm } from "@/components/forms/SignatureForm";
import { PillarIcon, PlusIcon, SkyTrainMap, StopDougSign } from "@/components/Icons";
import { RotatingWord } from "@/components/RotatingWord";
import { board, committees, heroWords, memberBenefits, pillars, site, skytrainAsks, socials, stopItems } from "@/content/site";
import { dayAndMonth, formatDate, timeOnly } from "@/lib/dates";
import { env } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { activeProducts, latestNews, siteInfo, upcomingEvents } from "@/lib/server/content";
import { ProductTile } from "@/components/Cart";

export default async function Home() {
  const [news, events, shop, info] = await Promise.all([latestNews(3), upcomingEvents(3), activeProducts(), siteInfo()]);
  const products = shop.products.slice(0, 4);
  const feeCents = info?.membership.fee_cents ?? 1000;
  const [nextEvent, ...moreEvents] = events;

  return (
    <>
      {/* ── Hero ── */}
      <section id="top" className="section section--navy hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <h1 className="hero-title pop">
              Fighting for
              <br />
              <RotatingWord words={heroWords} />
            </h1>
            <p className="hero-text">
              Surrey is the nurse renting in City Centre, the family in Newton, the shop owner in Cloverdale, and the senior in Guildford. They all want
              the same thing: a City Hall that gets the basics right. Imagine Surrey is residents organizing to make that happen. Become a member and help
              build it.
            </p>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <a href="#join" className="btn btn--yellow btn--lg">
                Become a member
              </a>
              <Link href="/donate" className="btn btn--ghost btn--lg">
                Chip in
              </Link>
              <Link href="/shop" className="btn btn--ghost btn--lg">
                Shop
              </Link>
            </div>
          </div>
          <Image
            src="/images/hero-park.jpg"
            alt="A park in Surrey City Centre on a clear day: a lotus fountain and flower planters in a reflecting pool, with the SkyTrain line and residential towers behind"
            width={1600}
            height={1200}
            priority
            sizes="(max-width: 1000px) 100vw, 400px"
            className="hero-image"
          />
        </div>
      </section>

      {/* ── What we stand for ── */}
      <section id="stand" className="section">
        <div className="container stack" style={{ gap: 40 }}>
          <div className="intro">
            <h2 className="display pop">What we stand for</h2>
            <p className="lede">
              Surrey has what it takes to be the best place in Canada to raise a family, start a business, or grow old. What it needs is a City Hall that
              treats the basics as the whole job. That&apos;s the work.
            </p>
          </div>
          <div className="pillars">
            {pillars.map((p) => (
              <div key={p.title} className="pillar">
                <div className="pillar-head">
                  <div className="pillar-icon">
                    <PillarIcon name={p.icon} />
                  </div>
                  <h3>{p.title}</h3>
                </div>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 24px" }}>
            <a href={site.platformUrl} className="btn btn--outline">
              Read the 2026 election platform
            </a>
            <a href="#join" className="text-link">
              Ready to bring change to Surrey? Become a member!
            </a>
          </div>
        </div>
      </section>

      {/* ── News ── */}
      <section id="news" className="section" style={{ paddingTop: 0 }}>
        <div className="container stack" style={{ gap: 32, paddingTop: 72, borderTop: "1px solid var(--line)" }}>
          <div className="section-head">
            <h2 className="display pop">Latest news</h2>
            <Link href="/news" className="text-link">
              All news
            </Link>
          </div>
          {news.length === 0 ? (
            <p className="empty-state">News releases will appear here. Sign up for the newsletter below to hear first.</p>
          ) : (
            <div className="card-grid">
              {news.map((post) => (
                <article key={post.slug} className="card">
                  <p className="eyebrow">{formatDate(post.publishedAt)}</p>
                  <h3 className="h3">{post.title}</h3>
                  <p>{post.summary}</p>
                  <Link href={`/news/${post.slug}`} className="text-link" style={{ fontSize: 15 }}>
                    Read more<span className="visually-hidden">: {post.title}</span>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Become a member ── */}
      <section id="join" className="section section--surface">
        <div className="container stack" style={{ gap: 48 }}>
          <Image
            src="/images/members-rally.jpg"
            alt="A packed room of Imagine Surrey supporters cheering and holding up signs that read change that works for you"
            width={1024}
            height={458}
            sizes="(max-width: 1168px) 100vw, 1120px"
            className="join-photo"
          />
          <div className="split">
            <div className="stack" style={{ flex: "1 1 320px", gap: 28 }}>
              <div className="stack" style={{ gap: 14 }}>
                <h2 className="display pop">Become a member</h2>
                <p className="lede">
                  Imagine Surrey is residents, not a brand. Members set the priorities, have a direct say in what we stand for, and hear first when
                  something is happening in their neighbourhood.
                </p>
              </div>
              <div className="stack" style={{ gap: 20 }}>
                {memberBenefits.map((b) => (
                  <div key={b.title} className="stack" style={{ gap: 6 }}>
                    <div className="bar" />
                    <h3 style={{ margin: "6px 0 0", fontWeight: 700, fontSize: 20, lineHeight: 1.25, color: "var(--navy)" }}>{b.title}</h3>
                    <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>{b.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: "1 1 460px" }}>
              <MembershipForm feeCents={feeCents} />
            </div>
          </div>
          <div id="newsletter" className="newsletter-bar">
            <div className="copy">
              <label htmlFor="nl-email">Not ready to join? Get the newsletter</label>
              <p className="small">News and events from around Surrey. By subscribing you agree to receive email from Imagine Surrey. Unsubscribe anytime.</p>
            </div>
            <NewsletterForm source="home" />
          </div>
        </div>
      </section>

      {/* ── Stop McCallum's chaos ── */}
      <section id="stop" className="section section--navy on-dark">
        <div className="container stack" style={{ gap: 40 }}>
          <div className="stop-head">
            <StopDougSign />
            <div className="stack" style={{ flex: "1 1 480px", minWidth: 0, gap: 14 }}>
              <h2 className="display pop">Stop McCallum&apos;s chaos</h2>
              <p className="lede" style={{ maxWidth: 680 }}>
                Cuts, fee hikes, and deals for his friends, all at your expense. Imagine Surrey is the organized voice of residents who won&apos;t let it
                happen quietly.
              </p>
            </div>
          </div>
          <div className="features">
            {stopItems.map((item) => (
              <article key={item.title} className="feature">
                <div className="bar bar--red" />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <div id="pledge" className="pledge">
            <div className="pledge-copy">
              <p className="eyebrow eyebrow--yellow">The pledge</p>
              <h3>Stop Doug McCallum and Mandeep Nagra</h3>
              <blockquote>
                I won&apos;t sit back while City Hall gets run for insiders. I&apos;ll watch every cut, fee hike, and backroom deal, speak up when it counts,
                and vote to replace Doug McCallum and Mandeep Nagra at the next election.
              </blockquote>
            </div>
            <SignatureForm campaign="stop-mccallum-pledge" variant="pledge" />
          </div>
          <div className="btn-row">
            <a href="#join" className="btn btn--yellow btn--lg">
              Help stop it: become a member
            </a>
            <Link href="/donate" className="btn btn--ghost btn--lg">
              Chip in
            </Link>
            <a href="#join" className="btn btn--ghost btn--lg">
              Volunteer
            </a>
            <Link href="/shop" className="btn btn--ghost btn--lg">
              Get the merch
            </Link>
            <Link href="/tracker" className="btn btn--ghost btn--lg">
              Track their promises
            </Link>
          </div>
        </div>
      </section>

      {/* ── Chip in ── */}
      <section id="donate" className="section">
        <div className="container split">
          <div className="stack" style={{ flex: "1 1 320px", gap: 16 }}>
            <h2 className="display pop">Chip in</h2>
            <p className="lede">
              In BC, elector organizations can only take contributions from individuals. No corporate money, no union money. That&apos;s the law, and
              we&apos;re glad of it. It means Imagine Surrey runs on Surrey residents who give what they can.
            </p>
            <p className="body">
              Your contribution pays for the unglamorous work: organizers, printing, outreach in every town centre, and keeping the lights on.
            </p>
          </div>
          <DonateWidget limitCents={env.contributionLimitCents} />
        </div>
      </section>

      {/* ── SkyTrain ── */}
      <section id="skytrain" className="section--navy-dark skytrain on-dark">
        <div className="skytrain-hero">
          <div className="container">
            <h2 className="display pop">
              Get SkyTrain <span className="hl">to South Surrey</span>
            </h2>
            <p className="skytrain-claim">
              Doug promised SkyTrain to 64 Avenue. It still stops at King George. Don&apos;t worry, Doug. We&apos;ll help you finish the job:{" "}
              <span className="hl">all the way to South Surrey.</span>
            </p>
            <p className="skytrain-callout">
              We&apos;re also calling on the province to honour its commitment of <span className="hl">$250 million for B-Line expansion.</span>
            </p>
          </div>
        </div>
        <div className="container split skytrain-body">
          <div className="map-card">
            <p className="map-title">Imagine Surrey SkyTrain proposal</p>
            <SkyTrainMap />
            <div className="map-legend">
              <span>
                <span aria-hidden="true" className="swatch" style={{ background: "var(--navy)" }} />
                SkyTrain today
              </span>
              <span>
                <span aria-hidden="true" className="swatch" style={{ background: "var(--field-border)" }} />
                Surrey Langley SkyTrain
              </span>
              <span>
                <span aria-hidden="true" className="swatch" style={{ background: "repeating-linear-gradient(90deg, #EF2023 0 6px, transparent 6px 11px)" }} />
                The extension to South Surrey
              </span>
            </div>
          </div>
          <div style={{ flex: "1 1 420px" }}>
            <SignatureForm campaign="skytrain-south-surrey" variant="petition" />
          </div>
        </div>
        <div className="container stack" style={{ padding: "48px 24px 0", gap: 18 }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>We&apos;re calling on Mayor Doug McCallum to keep his promise:</p>
          <ol className="asks">
            {skytrainAsks.map((ask, i) => (
              <li key={ask}>
                <span aria-hidden="true" className="num">
                  {i + 1}
                </span>
                <p>{ask}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Organize ── */}
      <section className="section section--yellow organize">
        <div className="container" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "32px 48px" }}>
          <h2 className="display pop">
            When we organize, <span className="underline">Surrey wins</span>
          </h2>
          <a href="#join" className="btn btn--navy btn--xl">
            Become a member
          </a>
        </div>
      </section>

      {/* ── Board ── */}
      <section id="about" className="section section--surface">
        <div className="container stack" style={{ gap: 36 }}>
          <div className="intro" style={{ maxWidth: 720 }}>
            <h2 className="display pop">Board of directors</h2>
            <p className="lede">
              The board keeps Imagine Surrey running and answers to the members. Eight director seats are open: one for each neighbourhood, one for youth
              and campus clubs, and one for seniors.
            </p>
          </div>
          <div className="board-grid">
            {board.map((seat, i) => (
              <article key={i} className="card card--white">
                {seat.initials ? (
                  <div aria-hidden="true" className="avatar">
                    {seat.initials}
                  </div>
                ) : (
                  <div aria-hidden="true" className="avatar avatar--open">
                    <PlusIcon />
                  </div>
                )}
                <p className="eyebrow" style={{ marginTop: 10 }}>
                  {seat.role}
                </p>
                <h3 className="h3">{seat.name ?? "Seat open"}</h3>
                {!seat.name && (
                  <a href="#join" className="text-link" style={{ fontSize: 15 }}>
                    Put your name forward
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Committees ── */}
      <section id="committees" className="section">
        <div className="container stack" style={{ gap: 44 }}>
          <div className="intro" style={{ maxWidth: 720 }}>
            <h2 className="display pop">Committees</h2>
            <p className="lede">
              Committees do the work between board meetings. Pick the one that matches what you&apos;re good at, the one for your neighbourhood, or the one
              on your campus.
            </p>
          </div>
          <div className="features" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {committees.map((c) => (
              <article key={c.title} className="feature">
                <div className="bar" />
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
          <div className="stack" style={{ gap: 16 }}>
            <h3 className="h3" style={{ fontSize: 24 }}>
              Neighbourhood committees
            </h3>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "var(--muted)" }}>One for each community, run by the members who live there.</p>
            <div className="tile-grid">
              {NEIGHBOURHOODS.map((n) => (
                <a key={n} href="#join" className="tile">
                  {n}
                </a>
              ))}
            </div>
          </div>
          <div className="stack" style={{ gap: 16 }}>
            <h3 className="h3" style={{ fontSize: 24 }}>
              Campus clubs
            </h3>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "var(--muted)" }}>
              Student-run clubs on Surrey&apos;s campuses, represented on the board by the youth and campus clubs director.
            </p>
            <div className="tile-grid">
              {["Kwantlen Cloverdale", "Kwantlen Newton", "SFU Surrey"].map((c) => (
                <a key={c} href="#join" className="tile">
                  {c}
                </a>
              ))}
            </div>
          </div>
          <a href="#join" className="text-link" style={{ alignSelf: "flex-start" }}>
            Be part of it by joining as a member
          </a>
        </div>
      </section>

      {/* ── Events ── */}
      <section id="events" className="section section--red on-dark">
        <div className="container stack" style={{ gap: 28 }}>
          <div className="section-head">
            <div className="stack" style={{ gap: 10 }}>
              <p className="eyebrow" style={{ color: "#fff", fontSize: 14, letterSpacing: "0.14em" }}>
                Next event
              </p>
              <h2 className="display pop--navy">Come and meet us</h2>
            </div>
            <Link href="/events" className="text-link">
              All events
            </Link>
          </div>
          {nextEvent ? (
            <>
              <div className="event-feature">
                <div className="date-badge">
                  <span className="day">{dayAndMonth(nextEvent.startsAt).day}</span>
                  <span className="mon">{dayAndMonth(nextEvent.startsAt).mon}</span>
                </div>
                <div className="info">
                  <h3>{nextEvent.title}</h3>
                  <p className="event-when">
                    {timeOnly(nextEvent.startsAt)}, {nextEvent.location}
                  </p>
                  <p className="summary">{nextEvent.summary}</p>
                </div>
                <Link href={`/events/${nextEvent.slug}`} className="btn btn--yellow btn--lg" style={{ fontSize: 19, minHeight: 56, padding: "0 32px" }}>
                  RSVP
                </Link>
              </div>
              {moreEvents.length > 0 && (
                <div className="event-list">
                  {moreEvents.map((ev) => (
                    <article key={ev.slug} className="event-row">
                      <div className="date-badge date-badge--sm">
                        <span className="day">{dayAndMonth(ev.startsAt).day}</span>
                        <span className="mon">{dayAndMonth(ev.startsAt).mon}</span>
                      </div>
                      <div className="info">
                        <h3>{ev.title}</h3>
                        <p>
                          {timeOnly(ev.startsAt)}, {ev.location}
                        </p>
                      </div>
                      <Link href={`/events/${ev.slug}`} className="text-link" style={{ fontSize: 15, flex: "none" }}>
                        RSVP<span className="visually-hidden"> for {ev.title}</span>
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="event-feature">
              <div className="info">
                <h3>New events are on the way</h3>
                <p className="summary">Get the newsletter and we&apos;ll tell you as soon as the next one is booked.</p>
              </div>
              <a href="#newsletter" className="btn btn--yellow btn--lg">
                Get the newsletter
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ── Shop ── */}
      <section id="shop" className="section section--surface">
        <div className="container stack" style={{ gap: 32 }}>
          <div className="section-head">
            <div className="intro" style={{ maxWidth: 720, gap: 12 }}>
              <h2 className="display pop">Get the merch</h2>
              <p className="lede">Lawn signs, shirts, and buttons. Pick something to see it and check out.</p>
            </div>
            <Link href="/shop" className="btn btn--red btn--lg">
              Shop and check out
            </Link>
          </div>
          <div className="products">
            {products.map((p) => (
              <Link key={p.slug} href="/shop" className="product">
                <ProductTile product={p} />
                <div className="product-meta">
                  <h3>{p.name}</h3>
                  <span className="price">{formatCents(p.priceCents)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social ── */}
      <section id="social" className="section">
        <div className="container stack" style={{ gap: 32 }}>
          <div className="intro" style={{ maxWidth: 720, gap: 12 }}>
            <h2 className="display pop">Follow along</h2>
            <p className="lede">The latest from our feeds: events, actions, and news from around Surrey.</p>
          </div>
          <div className="social-grid">
            {socials.map((s) => (
              <article key={s.name} className="social-card">
                <div className="head">
                  <h3>{s.name}</h3>
                  <span className="handle">{s.handle}</span>
                </div>
                <a href={s.url} className="btn btn--outline">
                  {s.cta}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
