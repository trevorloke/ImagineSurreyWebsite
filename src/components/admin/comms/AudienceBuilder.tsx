"use client";

import { useEffect, useId, useState } from "react";
import { AUDIENCE_LISTS, LANGUAGE_OPTIONS, parseAudience, type Audience, type AudienceList } from "@/lib/email/audience";
import { NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { countAudienceAction } from "@/app/admin/(secure)/comms/actions";

export type AudienceOptions = { campaigns: { slug: string; title: string }[]; tags: string[] };

/**
 * Pick who gets a campaign or text. Every chosen list and filter must match
 * (AND). The inputs submit with the surrounding form; the count updates
 * live as choices change.
 */
export function AudienceBuilder({ initial, channel, options, error }: { initial: Audience; channel: "email" | "sms"; options: AudienceOptions; error?: string }) {
  const id = useId();
  const [audience, setAudience] = useState<Audience>(initial);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCounting(true);
    const timer = setTimeout(async () => {
      try {
        const n = await countAudienceAction(audience, channel);
        if (!cancelled) setCount(n);
      } catch {
        if (!cancelled) setCount(null);
      } finally {
        if (!cancelled) setCounting(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [audience, channel]);

  const update = (patch: Partial<Audience>) => setAudience((a) => parseAudience({ ...a, ...patch }));
  const toggleList = (list: AudienceList, on: boolean) => update({ lists: on ? [...audience.lists, list] : audience.lists.filter((l) => l !== list) });
  const signers = audience.lists.includes("signers");

  return (
    <fieldset className="audience" aria-describedby={`${id}-count`}>
      <legend>{channel === "sms" ? "Who gets the text" : "Who gets it"}</legend>
      <p className="hint" style={{ margin: 0 }}>
        {channel === "sms"
          ? "Only people who said yes to texts and gave a Canadian number. Every list and filter you pick must match."
          : "Every list and filter you pick must match. Unsubscribed addresses are always left out, and lists other than the newsletter include only people who agreed to be contacted."}
      </p>
      <div className="audience-lists">
        {AUDIENCE_LISTS.map((list) => (
          <label key={list.id} className="check" htmlFor={`${id}-${list.id}`}>
            <input id={`${id}-${list.id}`} type="checkbox" name="lists" value={list.id} checked={audience.lists.includes(list.id)} onChange={(e) => toggleList(list.id, e.target.checked)} />
            <span>
              {list.label}
              <small>{list.help}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="audience-filters">
        <div className="field">
          <label htmlFor={`${id}-campaign`}>Campaign (for signers)</label>
          <select id={`${id}-campaign`} name="campaign" className="input" value={audience.campaign ?? ""} onChange={(e) => update({ campaign: e.target.value || undefined })} disabled={!signers} aria-describedby={signers ? undefined : `${id}-campaign-hint`}>
            <option value="">Choose a petition or pledge</option>
            {options.campaigns.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
          {!signers && (
            <span id={`${id}-campaign-hint`} className="hint">
              Tick “Signers of a campaign” to use this.
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${id}-neighbourhood`}>Neighbourhood</label>
          <select id={`${id}-neighbourhood`} name="neighbourhood" className="input" value={audience.neighbourhood ?? ""} onChange={(e) => update({ neighbourhood: e.target.value || undefined })}>
            <option value="">Anywhere</option>
            {NEIGHBOURHOODS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-tag`}>Tag</label>
          <input id={`${id}-tag`} name="tag" className="input" list={`${id}-tags`} value={audience.tag ?? ""} onChange={(e) => update({ tag: e.target.value || undefined })} maxLength={60} placeholder="Any tag" />
          <datalist id={`${id}-tags`}>
            {options.tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor={`${id}-language`}>Language</label>
          <select id={`${id}-language`} name="language" className="input" value={audience.language ?? ""} onChange={(e) => update({ language: e.target.value || undefined })}>
            <option value="">Any language</option>
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p id={`${id}-count`} className="audience-count" aria-live="polite">
        {counting ? (
          "Counting…"
        ) : count === null ? (
          "Choose a list or filter to see how many people match."
        ) : (
          <>
            <strong>{count.toLocaleString("en-CA")}</strong> {count === 1 ? "person" : "people"} {channel === "sms" ? "will get this text" : "will get this email"}
          </>
        )}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
