"use client";

/** Last-resort screen if the root layout itself fails. Plain markup: styles may not load. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Blackbox stopped working</h1>
        <p>Your data is safe. Try again or reload the page.</p>
        <button type="button" onClick={reset} style={{ padding: "0.5rem 1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
