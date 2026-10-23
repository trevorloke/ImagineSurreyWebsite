import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { formatDate } from "@/lib/dates";
import { latestNews } from "@/lib/server/content";

export const metadata: Metadata = { title: "News", description: "News releases from Imagine Surrey." };

export default async function NewsIndex() {
  const posts = await latestNews(100);
  return (
    <>
      <PageHead title="News">Releases and updates from Imagine Surrey.</PageHead>
      <section className="section">
        <div className="container">
          {posts.length === 0 ? (
            <p className="empty-state">No news yet. Sign up for the newsletter on the home page to hear first.</p>
          ) : (
            <div className="card-grid">
              {posts.map((post) => (
                <article key={post.id} className="card">
                  <p className="eyebrow">{formatDate(post.publishedAt!)}</p>
                  <h2 className="h3">{post.title}</h2>
                  <p>{post.summary}</p>
                  <Link href={`/news/${post.slug}`} className="text-link" style={{ fontSize: 15 }}>
                    Read more<span className="visually-hidden">: {post.title}</span>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
