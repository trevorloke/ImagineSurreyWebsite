"use client";

import { useActionState } from "react";
import { savePage } from "@/app/admin/(secure)/pages/actions";
import { fieldError, Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Checkbox } from "@/components/forms/Field";
import { useActionRedirect } from "./ActionForm";
import { TextareaField } from "./Inputs";
import { MarkdownEditor } from "./MarkdownEditor";
import { TitleSlugFields } from "./TitleSlugFields";

export type PageFormValues = { id: string; slug: string; title: string; summary: string; body: string; published: boolean; showInFooter: boolean };

export function PageForm({ page }: { page?: PageFormValues }) {
  const [state, action] = useActionState(savePage, null);
  useActionRedirect(state);
  return (
    <form action={action} className="cms-form">
      {page && <input type="hidden" name="id" value={page.id} />}
      <TitleSlugFields defaultTitle={page?.title} defaultSlug={page?.slug} urlPrefix="/" titleError={fieldError(state, "title")} slugError={fieldError(state, "slug")} />
      <TextareaField id="summary" name="summary" label="Summary (optional)" hint="Shown under the title and used as the description for search engines." defaultValue={page?.summary} maxLength={300} rows={2} error={fieldError(state, "summary")} />
      <MarkdownEditor id="body" name="body" label="Page text" defaultValue={page?.body} required maxLength={100_000} rows={18} error={fieldError(state, "body")} />
      <Checkbox name="published" defaultChecked={page?.published ?? false}>
        Published (visible to everyone)
      </Checkbox>
      <Checkbox name="showInFooter" defaultChecked={page?.showInFooter ?? false}>
        Link to it from the footer
      </Checkbox>
      <Notice state={state} />
      <div className="cms-publish">
        <SubmitButton className="btn btn--red">{page ? "Save changes" : "Create page"}</SubmitButton>
      </div>
    </form>
  );
}
