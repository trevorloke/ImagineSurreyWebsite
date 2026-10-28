"use client";

import { DEFAULT_CENTS, PRESETS_CENTS, starClubCents, type Frequency, type Tier } from "@/lib/contributions";
import { formatCents } from "@/lib/money";

export type Choice = { frequency: Frequency; tier: Tier; amountCents: number };

export function choiceTotalCents(choice: Choice, limitCents: number): number {
  const star = starClubCents(choice.frequency, limitCents);
  return choice.tier === "standard" ? choice.amountCents : choice.tier === "star" ? star : star * 2;
}

export function choiceLabel(choice: Choice, limitCents: number): string {
  return formatCents(choiceTotalCents(choice, limitCents)) + (choice.frequency === "monthly" ? " a month" : "");
}

/** Frequency toggle and amount buttons, as on the home page "Chip in" card. */
export function AmountPicker({
  choice,
  onChange,
  limitCents,
  allowCustom = false,
}: {
  choice: Choice;
  onChange: (c: Choice) => void;
  limitCents: number;
  allowCustom?: boolean;
}) {
  const star = starClubCents(choice.frequency, limitCents);
  const presets = PRESETS_CENTS[choice.frequency];
  const isPreset = choice.tier === "standard" && presets.includes(choice.amountCents);
  const setFrequency = (frequency: Frequency) =>
    frequency !== choice.frequency && onChange({ frequency, tier: choice.tier === "standard" ? "standard" : choice.tier, amountCents: DEFAULT_CENTS[frequency] });

  return (
    <>
      <div className="stack" style={{ gap: 8 }}>
        <p className="field-label" style={{ margin: 0 }}>
          How often?
        </p>
        <div role="group" aria-label="How often" className="toggle">
          <button type="button" aria-pressed={choice.frequency === "one_time"} onClick={() => setFrequency("one_time")}>
            One-time
          </button>
          <button type="button" aria-pressed={choice.frequency === "monthly"} onClick={() => setFrequency("monthly")}>
            Monthly
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          <strong>Monthly donors</strong> automatically support the Imagine Victory Fund, our war chest for the next election.
        </p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <p className="field-label" style={{ margin: 0 }}>
          Choose an amount
        </p>
        <div role="group" aria-label="Contribution amount" className="amounts">
          {presets.map((cents) => (
            <button
              key={cents}
              type="button"
              className="amount"
              aria-pressed={choice.tier === "standard" && choice.amountCents === cents}
              onClick={() => onChange({ ...choice, tier: "standard", amountCents: cents })}
            >
              {formatCents(cents)}
            </button>
          ))}
          <button type="button" className="amount amount--wide" aria-pressed={choice.tier === "star"} onClick={() => onChange({ ...choice, tier: "star", amountCents: star })}>
            Star Club {formatCents(star)}
          </button>
        </div>
        {allowCustom && (
          <div className="field" style={{ marginTop: 6 }}>
            <label htmlFor="custom-amount">Or enter another amount</label>
            <div className="custom-amount">
              <span aria-hidden="true">$</span>
              <input
                id="custom-amount"
                className="input"
                inputMode="decimal"
                placeholder="Other amount"
                value={choice.tier === "standard" && !isPreset ? String(choice.amountCents / 100) : ""}
                onChange={(e) => {
                  const dollars = Number(e.target.value.replace(/[^0-9.]/g, ""));
                  if (Number.isFinite(dollars)) onChange({ ...choice, tier: "standard", amountCents: Math.round(dollars * 100) });
                }}
              />
            </div>
          </div>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
        <strong>The Star Club</strong> is our name for donors who give the yearly maximum, all at once or spread across twelve months.
      </p>
    </>
  );
}
