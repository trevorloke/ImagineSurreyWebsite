"use client";

import { useActionState } from "react";
import { saveNews } from "@/app/admin/(secure)/content/news/actions";
import { fieldError, Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { useActionRedirect } from "./ActionForm";
import { dateToPacificLocal, publishStatus } from "./fields";
import { ImageField } from "./ImageField";
import { Badge, TextareaField } from "./Inputs";
import { MarkdownEditor } from "./MarkdownEditor";
import { TitleSlugFields } from "./TitleSlugFields";

export type NewsFormValues = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  imageUrl: string | null;
  imageAlt: string | null;
  /** ISO string, or null for a draft. */
  publishedAt: string | null;
};

function tomorrowNine(): string {
  const d = new Date(Date.now() + 86_400_000);
  return dateToPacificLocal(d).slice(0, 11) + "09:00";
}

export function NewsForm({ post }: { post?: NewsFormValues }) {
  const [state, action] = useActionState(saveNews, null);
  useActionRedirect(state);
  const status = post ? publishStatus(post.publishedAt) : "draft";
  const scheduledDefault = status === "scheduled" && post?.publishedAt ? dateToPacificLocal(new Date(post.publishedAt)) : tomorrowNine();

  return (
    <form action={action} className="cms-form">
      {post && <input type="hidden" name="id" value={post.id} />}
      <TitleSlugFields titleLabel="Headline" defaultTitle={post?.title} defaultSlug={post?.slug} urlPrefix="/news/" titleError={fieldError(state, "title")} slugError={fieldError(state, "slug")} />
      <TextareaField
        id="summary"
        name="summary"
        label="Summary"
        hint="One or two sentences. Shown on the home page and in the news list."
        defaultValue={post?.summary}
        required
        maxLength={400}
        rows={3}
        error={fieldError(state, "summary")}
      />
      <MarkdownEditor id="body" name="body" label="Full text" defaultValue={post?.body} required maxLength={50_000} error={fieldError(state, "body")} />
      <ImageField defaultUrl={post?.imageUrl} defaultAlt={post?.imageAlt} urlError={fieldError(state, "imageUrl")} altError={fieldError(state, "imageAlt")} />

      <Notice state={state} />
      <div className="cms-publish">
        {status === "published" ? (
          <>
            <Badge tone="live">Published</Badge>
            <SubmitButton name="publish" value="keep" className="btn btn--red">
              Save changes
            </SubmitButton>
          </>
        ) : (
          <>
            <Badge tone={status}>{status === "scheduled" ? "Scheduled" : "Draft"}</Badge>
            <SubmitButton name="publish" value="now" className="btn btn--red" pendingText="Publishing…">
              Publish now
            </SubmitButton>
            <SubmitButton name="publish" value="draft" className="btn btn--outline">
              Save as draft
            </SubmitButton>
          </>
        )}
      </div>
      {status !== "published" && (
        <div className="schedule-row">
          <div className="field">
            <label htmlFor="scheduledAt">Or schedule for (Surrey time)</label>
            <input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              className="input"
              defaultValue={scheduledDefault}
              aria-invalid={fieldError(state, "scheduledAt") ? true : undefined}
              aria-describedby={fieldError(state, "scheduledAt") ? "scheduledAt-error" : undefined}
            />
            {fieldError(state, "scheduledAt") && (
              <p className="field-error" id="scheduledAt-error">
                {fieldError(state, "scheduledAt")}
              </p>
            )}
          </div>
          <SubmitButton name="publish" value="schedule" className="btn btn--navy" pendingText="Scheduling…">
            Schedule
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
