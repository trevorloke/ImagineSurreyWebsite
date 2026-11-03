import Link from "next/link";
import { CampaignForm } from "@/components/admin/comms/CampaignForm";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/server/admin-auth";
import { loadAudienceOptions } from "@/lib/server/comms";
import "../comms.css";

// "Send" keeps sending in the background after the response; give it time.
export const maxDuration = 60;

export default async function NewCampaign() {
  const user = await requireAdmin("comms");
  const options = await loadAudienceOptions(getDb());
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="comms-head">
        <h1 className="h3">New email campaign</h1>
        <Link href="/admin/comms" className="text-link" style={{ marginLeft: "auto" }}>
          ← All campaigns
        </Link>
      </div>
      <p className="body" style={{ maxWidth: 820 }}>
        Write the email, choose who gets it and save the draft. On the next screen you can send yourself a test and then send it for real.
      </p>
      <CampaignForm options={options} adminEmail={user.email} />
    </div>
  );
}
