import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelCampaignButton, DeleteDraftButton } from "@/components/admin/comms/CampaignActions";
import { CampaignForm } from "@/components/admin/comms/CampaignForm";
import { StatusBadge } from "@/components/admin/comms/StatusBadge";
import { getDb } from "@/lib/db";
import { emailCampaigns } from "@/lib/db/schema";
import { describeAudience, parseAudience } from "@/lib/email/audience";
import { renderCampaignEmail, sampleMergeValues } from "@/lib/email/merge";
import { requireAdmin } from "@/lib/server/admin-auth";
import { campaignProgress, loadAudienceOptions } from "@/lib/server/comms";
import { emailContext } from "@/lib/server/email";
import "../comms.css";

const when = (d: Date | null) => (d ? d.toLocaleString("en-CA", { timeZone: "America/Vancouver", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

export default async function CampaignPage({ params, searchParams }: PageProps<"/admin/comms/[id]">) {
  const user = await requireAdmin("comms");
  const { id } = await params;
  const justSent = typeof (await searchParams).sent === "string";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const campaign = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, id) });
  if (!campaign) notFound();
  const [progress, options, ctx] = await Promise.all([campaignProgress(db, id), loadAudienceOptions(db), emailContext()]);
  const audience = parseAudience(campaign.audience);
  const preview = renderCampaignEmail(ctx, { subject: campaign.subject, preheader: campaign.preheader, body: campaign.body }, sampleMergeValues(ctx, user.name.split(/\s+/)[0]));
  const draft = campaign.status === "draft";

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="comms-head">
        <h1 className="h3" style={{ fontSize: 26 }}>
          {campaign.subject}
        </h1>
        <StatusBadge status={campaign.status} />
        <Link href="/admin/comms" className="text-link" style={{ marginLeft: "auto" }}>
          ← All campaigns
        </Link>
      </div>

      {!draft && justSent && campaign.status !== "cancelled" && (
        <div role="status" className="alert alert--note">
          <span aria-hidden="true" className="alert-icon">
            ✓
          </span>
          <span>
            Sending to {campaign.recipientCount} {campaign.recipientCount === 1 ? "person" : "people"}. The first batch goes out now and the rest follow within minutes.
          </span>
        </div>
      )}

      {!draft && (
        <section className="card card--white stack" style={{ gap: 14, padding: 20 }}>
          <h2 className="h3" style={{ fontSize: 20 }}>
            Progress
          </h2>
          <dl className="progress-row">
            <div>
              <dt>Recipients</dt>
              <dd>{campaign.recipientCount}</dd>
            </div>
            <div>
              <dt>Sent</dt>
              <dd>{progress.sent}</dd>
            </div>
            <div>
              <dt>Queued</dt>
              <dd>{progress.queued}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{progress.failed}</dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>{progress.skipped}</dd>
            </div>
          </dl>
          <p className="small" style={{ margin: 0 }}>
            Audience: {describeAudience(audience)} · Started {when(campaign.sentAt ?? campaign.updatedAt)}
            {progress.skipped > 0 && !campaign.status.startsWith("cancel") ? " · Skipped emails usually mean email isn't configured yet; see the log." : ""}
          </p>
          {campaign.status === "sending" && <CancelCampaignButton id={campaign.id} />}
          {campaign.status === "sent" && progress.queued > 0 && <CancelCampaignButton id={campaign.id} />}
        </section>
      )}

      {draft ? (
        <>
          <CampaignForm campaign={{ id: campaign.id, subject: campaign.subject, preheader: campaign.preheader, body: campaign.body, audience }} options={options} adminEmail={user.email} />
          <DeleteDraftButton id={campaign.id} />
        </>
      ) : (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="h3" style={{ fontSize: 20 }}>
            The email as sent
          </h2>
          {campaign.preheader && <p className="small">Preview text: {campaign.preheader}</p>}
        </section>
      )}

      <section className="stack" style={{ gap: 10 }}>
        <h2 className="h3" style={{ fontSize: 20 }}>
          {draft ? "Preview of the saved draft" : "Preview"}
        </h2>
        <p className="hint" style={{ margin: 0 }}>
          With sample merge values. {draft ? "Save the draft to refresh it." : ""}
        </p>
        <iframe title="Email preview" className="email-preview" sandbox="" srcDoc={preview.html} />
      </section>
    </div>
  );
}
