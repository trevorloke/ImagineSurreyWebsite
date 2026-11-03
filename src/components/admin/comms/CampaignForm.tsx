"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { createCampaign, saveCampaign } from "@/app/admin/(secure)/comms/actions";
import { fieldError, Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { Audience } from "@/lib/email/audience";
import { MERGE_FIELDS } from "@/lib/email/merge";
import { AudienceBuilder, type AudienceOptions } from "./AudienceBuilder";

export type CampaignDraft = { id: string; subject: string; preheader: string; body: string; audience: Audience };

/** The composer: content, audience, and the save / test / send buttons. */
export function CampaignForm({ campaign, options, adminEmail }: { campaign?: CampaignDraft; options: AudienceOptions; adminEmail: string }) {
  const router = useRouter();
  const [state, action] = useActionState(campaign ? saveCampaign : createCampaign, null);

  useEffect(() => {
    if (state?.ok && state.redirect) router.push(state.redirect);
    else if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="composer">
      <Notice state={state} />
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <div className="form-card form-card--surface" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="c-subject">Subject</label>
          <input id="c-subject" name="subject" className="input" required maxLength={200} defaultValue={campaign?.subject ?? ""} aria-invalid={fieldError(state, "subject") ? true : undefined} aria-describedby={fieldError(state, "subject") ? "c-subject-error" : undefined} />
          {fieldError(state, "subject") && (
            <p id="c-subject-error" className="field-error" role="alert">
              {fieldError(state, "subject")}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="c-preheader">Preview text (shown after the subject in most inboxes)</label>
          <input id="c-preheader" name="preheader" className="input" maxLength={200} defaultValue={campaign?.preheader ?? ""} aria-invalid={fieldError(state, "preheader") ? true : undefined} />
          {fieldError(state, "preheader") && (
            <p className="field-error" role="alert">
              {fieldError(state, "preheader")}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="c-body">Email (Markdown: blank line between paragraphs, **bold**, [link text](https://…), ## headings)</label>
          <textarea id="c-body" name="body" className="input" required defaultValue={campaign?.body ?? ""} aria-invalid={fieldError(state, "body") ? true : undefined} aria-describedby="c-merge" />
          {fieldError(state, "body") && (
            <p className="field-error" role="alert">
              {fieldError(state, "body")}
            </p>
          )}
          <details id="c-merge">
            <summary className="link-button">Merge fields you can use</summary>
            <ul className="merge-fields" style={{ marginTop: 8 }}>
              {MERGE_FIELDS.map((f) => (
                <li key={f.name}>
                  <code>{`{{${f.name}}}`}</code> {f.help}
                </li>
              ))}
            </ul>
            <p className="hint" style={{ marginTop: 8 }}>
              Every email ends with the recipient&apos;s own unsubscribe link, whether or not you include one.
            </p>
          </details>
        </div>
      </div>

      <AudienceBuilder initial={campaign?.audience ?? { lists: [] }} channel="email" options={options} error={fieldError(state, "lists")} />

      <div className="btn-row">
        <SubmitButton name="intent" value="save" className="btn btn--navy" pendingText="Saving…">
          {campaign ? "Save draft" : "Save draft and continue"}
        </SubmitButton>
        {campaign && (
          <>
            <SubmitButton name="intent" value="test" className="btn btn--outline" pendingText="Sending test…">
              Send test to me ({adminEmail})
            </SubmitButton>
            <SubmitButton name="intent" value="send" className="btn btn--red" pendingText="Sending…" confirm="Send this email to everyone in the audience now? This can't be undone.">
              Send
            </SubmitButton>
          </>
        )}
      </div>
    </form>
  );
}
