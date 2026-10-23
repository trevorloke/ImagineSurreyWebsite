import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

// The button POSTs so that link scanners and prefetching can't unsubscribe anyone.
export default async function Unsubscribe({ searchParams }: PageProps<"/newsletter/unsubscribe">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <>
      <PageHead title={sp.done ? "You're unsubscribed" : "Unsubscribe"}>
        {sp.done
          ? "You won't get the newsletter any more. If that was a mistake, you can sign up again on the home page."
          : "Stop getting the Imagine Surrey newsletter?"}
      </PageHead>
      {!sp.done && (
        <section className="section">
          <div className="container">
            {token ? (
              <form method="post" action="/api/newsletter/unsubscribe">
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="btn btn--navy btn--lg">
                  Unsubscribe me
                </button>
              </form>
            ) : (
              <p className="empty-state">This unsubscribe link is incomplete. Use the link from the bottom of one of our emails.</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
