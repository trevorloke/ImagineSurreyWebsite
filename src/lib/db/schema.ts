import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ── People ────────────────────────────────────────────────────────────────
// One row per email address. Members, donors, petition signers, newsletter
// subscribers and shoppers all resolve to a person so the organization has a
// single view of each supporter.
export const people = pgTable(
  "people",
  {
    id: id(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    province: text("province"),
    postalCode: text("postal_code"),
    neighbourhood: text("neighbourhood"),
    birthdate: date("birthdate"),
    citizenshipStatus: text("citizenship_status"),
    gender: text("gender"),
    languages: text("languages").array(),
    student: boolean("student").notNull().default(false),
    campus: text("campus"),
    issue: text("issue"),
    interestVolunteer: boolean("interest_volunteer").notNull().default(false),
    interestLawnSign: boolean("interest_lawn_sign").notNull().default(false),
    contactConsentAt: timestamp("contact_consent_at", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("people_email_idx").on(t.email)],
);

// ── Memberships ───────────────────────────────────────────────────────────
export const membershipStatus = pgEnum("membership_status", [
  "pending_payment",
  "active",
  "expired",
  "cancelled",
]);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    status: membershipStatus("status").notNull().default("pending_payment"),
    feeCents: integer("fee_cents").notNull(),
    // Outside-Surrey members can join but don't vote at member meetings.
    votingEligible: boolean("voting_eligible").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("memberships_person_idx").on(t.personId),
    uniqueIndex("memberships_checkout_idx").on(t.stripeCheckoutSessionId),
  ],
);

// ── Contributions ─────────────────────────────────────────────────────────
// Every dollar received, including membership fees, which count as
// contributions under BC's Local Elections Campaign Financing Act. Each row
// snapshots the contributor's name and address as given at the time, which is
// what disclosure reports need.
export const contributionKind = pgEnum("contribution_kind", ["donation", "membership_fee"]);
export const contributionFrequency = pgEnum("contribution_frequency", ["one_time", "monthly"]);
// Council and school board slates are separate campaigns with separate limits.
export const contributionSlate = pgEnum("contribution_slate", ["council", "school_board"]);
export const contributionStatus = pgEnum("contribution_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
  "refunded_over_limit",
]);

export const contributions = pgTable(
  "contributions",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    kind: contributionKind("kind").notNull(),
    frequency: contributionFrequency("frequency").notNull(),
    slate: contributionSlate("slate").notNull().default("council"),
    amountCents: integer("amount_cents").notNull(),
    // Returned to the contributor, e.g. the part of a payment over the annual limit.
    refundedCents: integer("refunded_cents").notNull().default(0),
    status: contributionStatus("status").notNull().default("pending"),
    contributorName: text("contributor_name").notNull(),
    contributorAddress: text("contributor_address").notNull(),
    contributorCity: text("contributor_city").notNull(),
    contributorPostalCode: text("contributor_postal_code").notNull(),
    eligibilityAttestedAt: timestamp("eligibility_attested_at", { withTimezone: true }).notNull(),
    // Monthly gifts support the Imagine Victory Fund.
    fund: text("fund").notNull().default("general"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeInvoiceId: text("stripe_invoice_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("contributions_person_idx").on(t.personId),
    index("contributions_checkout_idx").on(t.stripeCheckoutSessionId),
    index("contributions_payment_intent_idx").on(t.stripePaymentIntentId),
    // One row per slate per invoice: a Superstar monthly payment is two rows.
    uniqueIndex("contributions_invoice_slate_idx").on(t.stripeInvoiceId, t.slate),
  ],
);

// ── Recurring donations ───────────────────────────────────────────────────
export const recurringStatus = pgEnum("recurring_status", ["pending", "active", "cancelled"]);

export const recurringDonations = pgTable(
  "recurring_donations",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    // Per month, per slate, keyed by slate name: {"council": 11900}.
    slateAmounts: jsonb("slate_amounts").$type<Partial<Record<"council" | "school_board", number>>>().notNull(),
    status: recurringStatus("status").notNull().default("pending"),
    contributorName: text("contributor_name").notNull(),
    contributorAddress: text("contributor_address").notNull(),
    contributorCity: text("contributor_city").notNull(),
    contributorPostalCode: text("contributor_postal_code").notNull(),
    eligibilityAttestedAt: timestamp("eligibility_attested_at", { withTimezone: true }).notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("recurring_checkout_idx").on(t.stripeCheckoutSessionId),
    uniqueIndex("recurring_subscription_idx").on(t.stripeSubscriptionId),
  ],
);

// ── Newsletter ────────────────────────────────────────────────────────────
export const subscriberStatus = pgEnum("subscriber_status", ["subscribed", "unsubscribed"]);

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: id(),
    email: text("email").notNull(),
    personId: uuid("person_id").references(() => people.id),
    status: subscriberStatus("status").notNull().default("subscribed"),
    source: text("source").notNull(),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }).notNull().defaultNow(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("newsletter_email_idx").on(t.email),
    uniqueIndex("newsletter_token_idx").on(t.unsubscribeToken),
  ],
);

// ── Petitions and pledges ─────────────────────────────────────────────────
export const campaignSignatures = pgTable(
  "campaign_signatures",
  {
    id: id(),
    campaign: text("campaign").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    postalCode: text("postal_code").notNull(),
    address: text("address"),
    phone: text("phone"),
    answer: text("answer"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("signatures_campaign_email_idx").on(t.campaign, t.email)],
);

// ── News and events ───────────────────────────────────────────────────────
export const newsPosts = pgTable(
  "news_posts",
  {
    id: id(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("news_slug_idx").on(t.slug)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    location: text("location").notNull(),
    summary: text("summary").notNull(),
    description: text("description").notNull().default(""),
    published: boolean("published").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("events_slug_idx").on(t.slug), index("events_starts_idx").on(t.startsAt)],
);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    guests: integer("guests").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rsvps_event_email_idx").on(t.eventId, t.email)],
);

// ── Shop ──────────────────────────────────────────────────────────────────
export const products = pgTable(
  "products",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceCents: integer("price_cents").notNull(),
    // The text and colours of the product tile.
    tileLabel: text("tile_label").notNull(),
    tileBackground: text("tile_background").notNull(),
    tileForeground: text("tile_foreground").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("products_slug_idx").on(t.slug)],
);

export const orderStatus = pgEnum("order_status", ["pending_payment", "paid", "fulfilled", "cancelled", "refunded"]);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    personId: uuid("person_id").references(() => people.id),
    email: text("email"),
    status: orderStatus("status").notNull().default("pending_payment"),
    totalCents: integer("total_cents").notNull(),
    shipping: jsonb("shipping"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("orders_checkout_idx").on(t.stripeCheckoutSessionId)],
);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  name: text("name").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: integer("quantity").notNull(),
});

// ── Stripe webhook idempotency ────────────────────────────────────────────
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
