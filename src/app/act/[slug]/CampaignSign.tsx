"use client";

import { useState, type ReactNode } from "react";
import { SignatureForm, type SignatureResult } from "@/components/forms/SignatureForm";
import type { ShareLinks } from "@/lib/share";
import { SHARE_CHANNELS } from "../links";
import { Milestone } from "../Milestone";
import { formatCount, nextMilestone } from "../milestone";

export type CampaignSummary = {
  slug: string;
  title: string;
  kind: "petition" | "pledge";
  question: string | null;
  goal: number | null;
};

export type CountsSummary = {
  count: number;
  byNeighbourhood: { neighbourhood: string; count: number }[];
  latestNeighbourhoods: string[];
};

/**
 * The live half of a campaign page: the milestone bar, the per-town-centre
 * counts and the form share one count, so signing moves the bar at once.
 * `children` is the server-rendered body and statement.
 */
export function CampaignSign({ campaign, counts, share, children }: { campaign: CampaignSummary; counts: CountsSummary; share: ShareLinks; children: ReactNode }) {
  const [count, setCount] = useState(counts.count);
  const latest = counts.latestNeighbourhoods;
  const milestone = nextMilestone(count, campaign.goal);
  const noun = campaign.kind === "pledge" ? "pledges" : "signatures";

  const onSigned = (result: SignatureResult) => setCount(result.count);

  return (
    <div className="split act-split">
      <div className="stack act-main" style={{ gap: 28 }}>
        {children}
        <Milestone count={count} milestone={milestone} label={campaign.kind === "pledge" ? "Pledges" : "Signatures"} noun={noun} />
        {counts.byNeighbourhood.length > 0 && (
          <div className="stack" style={{ gap: 10 }}>
            <h2 className="h3" style={{ fontSize: 22 }}>
              By town centre
            </h2>
            <dl className="hood-list">
              {counts.byNeighbourhood.map((n) => (
                <div key={n.neighbourhood} className="hood-row">
                  <dt>{n.neighbourhood}</dt>
                  <dd>{formatCount(n.count)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {latest.length > 0 && (
          <p className="act-latest">
            <strong>Latest from:</strong> {latest.join(", ")}
          </p>
        )}
        <div className="stack" style={{ gap: 10 }}>
          <h2 className="h3" style={{ fontSize: 22 }}>
            Share this {campaign.kind}
          </h2>
          <div className="share-links">
            {SHARE_CHANNELS.map((c) => (
              <a key={c.key} className="btn btn--outline" href={share[c.key]} target={c.key === "sms" || c.key === "email" ? undefined : "_blank"} rel="noopener noreferrer">
                {c.label}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="act-form" style={{ flex: "1 1 400px" }}>
        <SignatureForm campaign={campaign.slug} kind={campaign.kind} question={campaign.question} onSigned={onSigned} idPrefix="act" />
      </div>
    </div>
  );
}
