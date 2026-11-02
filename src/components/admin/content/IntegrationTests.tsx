"use client";

import { useActionState } from "react";
import { sendTestEmail, sendTestSms } from "@/app/admin/(secure)/integrations/actions";
import { fieldError, Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { TextField } from "@/components/forms/Field";
import { useCmsForm } from "./useCmsForm";

export function TestEmailForm({ to }: { to: string }) {
  const [state, action] = useActionState(sendTestEmail, null);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <div>
        <SubmitButton className="btn btn--outline btn--sm" pendingText="Sending…">
          Send me a test email
        </SubmitButton>
      </div>
      <p className="small">Goes to {to}.</p>
      <Notice state={state} />
    </form>
  );
}

export function TestSmsForm() {
  const form = useCmsForm(sendTestSms);
  const { state } = form;
  return (
    <form key={form.key} action={form.action} className="stack" style={{ gap: 8 }}>
      <TextField id="test-sms-to" name="to" type="tel" label="Send a test text to (your own phone)" required autoComplete="tel" placeholder="604 555 0100" defaultValue={form.text("to", "")} error={fieldError(state, "to")} />
      <div>
        <SubmitButton className="btn btn--outline btn--sm" pendingText="Sending…">
          Send a test text
        </SubmitButton>
      </div>
      <Notice state={state} />
    </form>
  );
}
