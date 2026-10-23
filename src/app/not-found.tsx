import Link from "next/link";
import { PageHead } from "@/components/PageHead";

export default function NotFound() {
  return (
    <>
      <PageHead title="Page not found">We couldn&apos;t find that page. It may have moved.</PageHead>
      <section className="section">
        <div className="container">
          <Link href="/" className="btn btn--red btn--lg">
            Go to the home page
          </Link>
        </div>
      </section>
    </>
  );
}
