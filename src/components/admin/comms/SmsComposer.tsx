"use client";

import { useActionState, useState } from "react";
import { sendTextAction } from "@/app/admin/(secure)/comms/actions";
import { fieldError, Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { smsSegments } from "@/lib/email/inbound-sms";
import { STOP_LINE } from "@/lib/email/notifications";
import { AudienceBuilder, type AudienceOptions } from "./AudienceBuilder";

const DEFAULT_MESSAGE = `\n\n${STOP_LINE}`;

/** Write a text to an audience of people who said yes to texts. */
export function SmsComposer({ options, orgName }: { options: AudienceOptions; orgName: string }) {
  const [state, action] = useActionState(sendTextAction, null);
  const [message, setMessage] = useState(`${orgName}: ${DEFAULT_MESSAGE}`);
  const { characters, segments, unicode } = smsSegments(message.trim());
  const endsWithStop = new RegExp(`${STOP_LINE.replace(/\s+/g, "\\s+")}\\.?$`, "i").test(message.trim());
  const messageError = fieldError(state, "message");

  return (
    <form action={action} className="composer">
      <Notice state={state} />
      <div className="form-card form-card--surface" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="sms-message">Text message</label>
          <textarea
            id="sms-message"
            name="message"
            className="input"
            required
            maxLength={640}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ minHeight: 160 }}
            aria-invalid={messageError ? true : undefined}
            aria-describedby="sms-counter"
          />
          {messageError && (
            <p className="field-error" role="alert">
              {messageError}
            </p>
          )}
          <p id="sms-counter" className="sms-counter" aria-live="polite">
            <span>
              {characters} characters · {segments} {segments === 1 ? "text segment" : "text segments"}
              {unicode ? " (special characters shorten segments to 70)" : ""}
            </span>
            {!endsWithStop && <span className="is-warning">Must end with “{STOP_LINE}”</span>}
          </p>
          <p className="hint">Keep it to one segment (160 characters) when you can. Links count. The sign-off is required by Canadian anti-spam rules.</p>
        </div>
      </div>

      <AudienceBuilder initial={{ lists: [] }} channel="sms" options={options} error={fieldError(state, "lists")} />

      <div className="btn-row">
        <SubmitButton className="btn btn--red" pendingText="Sending…" confirm="Send this text to everyone in the audience now? This can't be undone.">
          Send text
        </SubmitButton>
      </div>
    </form>
  );
}
