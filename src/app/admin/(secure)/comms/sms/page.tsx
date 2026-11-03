import Link from "next/link";
import { SmsComposer } from "@/components/admin/comms/SmsComposer";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/server/admin-auth";
import { loadAudienceOptions } from "@/lib/server/comms";
import { emailContext } from "@/lib/server/email";
import "../comms.css";

export default async function SmsPage() {
  await requireAdmin("comms");
  const [options, ctx] = await Promise.all([loadAudienceOptions(getDb()), emailContext()]);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="comms-head">
        <h1 className="h3">Send a text</h1>
        <Link href="/admin/comms" className="text-link" style={{ marginLeft: "auto" }}>
          ← Email &amp; texts
        </Link>
      </div>
      {!env.smsEnabled && (
        <div role="status" className="alert alert--note">
          <span aria-hidden="true" className="alert-icon">
            !
          </span>
          <span>Twilio isn&apos;t configured, so texts are logged as skipped instead of sent. Add the Twilio keys in the environment to go live.</span>
        </div>
      )}
      <p className="body" style={{ maxWidth: 820 }}>
        Texts go only to people who ticked the box for texts. Anyone can reply STOP to opt out, HELP for our contact details, or JOIN for the membership link.
      </p>
      <SmsComposer options={options} orgName={ctx.orgName} />
    </div>
  );
}
