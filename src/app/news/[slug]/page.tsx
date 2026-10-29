import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { Prose } from "@/components/Prose";
import { formatDate } from "@/lib/dates";
import { newsBySlug } from "@/lib/server/content";

export async function generateMetadata({ params }: PageProps<"/news/[slug]">): Promise<Metadata> {
  const post = await newsBySlug((await params).slug);
  return post ? { title: post.title, description: post.summary } : {};
}

export default async function NewsPost({ params }: PageProps<"/news/[slug]">) {
  const post = await newsBySlug((await params).slug);
  if (!post) notFound();
  return (
    <>
      <PageHead title={post.title} eyebrow={formatDate(post.publishedAt)}>
        {post.summary}
      </PageHead>
      <section className="section">
        <div className="container stack" style={{ gap: 24 }}>
          <Prose html={post.html} />
          <Link href="/news" className="text-link">
            ← All news
          </Link>
        </div>
      </section>
    </>
  );
}
