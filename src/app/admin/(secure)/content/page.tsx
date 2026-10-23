import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { events, newsPosts, products } from "@/lib/db/schema";
import { formatDate, formatEventTime } from "@/lib/dates";
import { createEvent, createNews, deleteEvent, deleteNews, setNewsPublished, updateProduct } from "./actions";

export default async function AdminContent() {
  const db = getDb();
  const [posts, allEvents, allProducts] = await Promise.all([
    db.select().from(newsPosts).orderBy(desc(newsPosts.createdAt)).limit(50),
    db.select().from(events).orderBy(desc(events.startsAt)).limit(50),
    db.select().from(products).orderBy(products.sortOrder),
  ]);

  return (
    <div className="stack" style={{ gap: 48 }}>
      <section className="stack" style={{ gap: 16 }}>
        <h2 className="h3" style={{ fontSize: 28 }}>
          News
        </h2>
        <form action={createNews} className="form-card form-card--surface">
          <div className="field">
            <label htmlFor="n-title">Headline</label>
            <input id="n-title" name="title" className="input" required maxLength={200} />
          </div>
          <div className="field">
            <label htmlFor="n-summary">Summary (one or two sentences, shown on the home page)</label>
            <input id="n-summary" name="summary" className="input" required maxLength={400} />
          </div>
          <div className="field">
            <label htmlFor="n-body">Full text (leave a blank line between paragraphs)</label>
            <textarea id="n-body" name="body" className="input" required rows={8} style={{ padding: 14 }} />
          </div>
          <div className="btn-row">
            <button type="submit" name="publish" value="now" className="btn btn--red">
              Publish now
            </button>
            <button type="submit" name="publish" value="draft" className="btn btn--outline">
              Save as draft
            </button>
          </div>
        </form>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td style={{ whiteSpace: "normal" }}>
                    <strong>{p.title}</strong>
                  </td>
                  <td>{p.publishedAt ? `Published ${formatDate(p.publishedAt)}` : "Draft"}</td>
                  <td>
                    <form action={setNewsPublished} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="publish" value={p.publishedAt ? "0" : "1"} />
                      <button className="btn btn--outline" style={{ minHeight: 36 }}>
                        {p.publishedAt ? "Unpublish" : "Publish"}
                      </button>
                    </form>{" "}
                    <form action={deleteNews} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn btn--outline" style={{ minHeight: 36 }}>
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" style={{ gap: 16 }}>
        <h2 className="h3" style={{ fontSize: 28 }}>
          Events
        </h2>
        <form action={createEvent} className="form-card form-card--surface">
          <div className="form-row">
            <div className="field">
              <label htmlFor="e-title">Event name</label>
              <input id="e-title" name="title" className="input" required maxLength={200} />
            </div>
            <div className="field">
              <label htmlFor="e-starts">Date and time (Surrey time)</label>
              <input id="e-starts" name="startsAt" type="datetime-local" className="input" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="e-location">Location</label>
            <input id="e-location" name="location" className="input" required maxLength={200} />
          </div>
          <div className="field">
            <label htmlFor="e-summary">One line on what to expect</label>
            <input id="e-summary" name="summary" className="input" required maxLength={300} />
          </div>
          <div className="field">
            <label htmlFor="e-description">Details (optional)</label>
            <textarea id="e-description" name="description" className="input" rows={5} style={{ padding: 14 }} />
          </div>
          <button type="submit" className="btn btn--red" style={{ alignSelf: "flex-start" }}>
            Add event
          </button>
        </form>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {allEvents.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "normal" }}>
                    <strong>{e.title}</strong>
                  </td>
                  <td>{formatEventTime(e.startsAt)}</td>
                  <td>{e.location}</td>
                  <td>
                    <a href={`/admin?view=rsvps`}>RSVPs</a>
                  </td>
                  <td>
                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="btn btn--outline" style={{ minHeight: 36 }}>
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" style={{ gap: 16 }}>
        <h2 className="h3" style={{ fontSize: 28 }}>
          Shop
        </h2>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {allProducts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>
                    <form action={updateProduct} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <label>
                        $ <input name="price" defaultValue={(p.priceCents / 100).toFixed(2)} className="input" style={{ width: 110, minHeight: 36 }} inputMode="decimal" />
                      </label>
                      <label className="check">
                        <input type="checkbox" name="active" defaultChecked={p.active} /> For sale
                      </label>
                      <button className="btn btn--outline" style={{ minHeight: 36 }}>
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
