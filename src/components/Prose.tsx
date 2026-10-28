/** A body from Starbase, already rendered by its safe Markdown renderer (every
 * character escaped first; only its own tags come out). Plain text works too. */
export function Prose({ html, text }: { html?: string; text?: string }) {
  if (html) return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className="prose">
      {(text ?? "")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </div>
  );
}
