"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { cancelCampaignAction, deleteDraftAction } from "@/app/admin/(secure)/comms/actions";
import { Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";

/** Stop a campaign that is still sending: queued emails are skipped. */
export function CancelCampaignButton({ id }: { id: string }) {
  const router = useRouter();
  const [state, action] = useActionState(cancelCampaignAction, null);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <Notice state={state} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="btn btn--outline" pendingText="Cancelling…" confirm="Cancel this campaign? Emails already sent can't be recalled; anything still queued will be skipped.">
        Cancel the rest of this campaign
      </SubmitButton>
    </form>
  );
}

export function DeleteDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [state, action] = useActionState(deleteDraftAction, null);
  useEffect(() => {
    if (state?.ok && state.redirect) router.push(state.redirect);
  }, [state, router]);
  return (
    <form action={action}>
      <Notice state={state} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="link-button is-danger" pendingText="Deleting…" confirm="Delete this draft? This can't be undone.">
        Delete this draft
      </SubmitButton>
    </form>
  );
}
