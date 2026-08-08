import Link from "next/link";

/**
 * The page's closing call to action.
 *
 * `.hero` is the same class and gradient the page's top banner sits on — this
 * is the second time the page reaches for it, not a new treatment invented for
 * the foot. That repetition is what makes it read as a closing plate rather
 * than a section that wandered off the site's own palette.
 *
 * `.closing-banner` layers the artwork over it, seated against the right edge
 * with the copy running clear of it on the left. It replaces the `OrbitMark`
 * SVG that used to occupy that side: the drawing and the plate were two takes
 * on the same object, and the supplied render is the one that was asked for.
 */
export function ClosingBanner() {
  return (
    <Link
      href="/screener"
      /*
       * A floor rather than a fixed height. The artwork is fitted by the card's
       * shorter axis, so the plate's height is what decides how large it reads —
       * and left to the copy alone it came out shorter than the object needs.
       * A floor gives it room without pinning the card, so the copy can still
       * grow the plate past it rather than being clipped by it.
       */
      className="hero closing-banner group relative block overflow-hidden px-8 py-10 sm:min-h-[300px] sm:px-12 sm:py-12"
    >
      {/* Gold, matching the top banner — the default on `.hero-glow` is the
          terminal blue, which is the one colour on this plate that would not
          belong to the artwork above it. */}
      <div
        className="hero-glow"
        style={{ "--hero-glow-light": "rgba(169, 138, 85, 0.22)" } as React.CSSProperties}
      />

      {/*
       * Capped so the lines break where the artwork begins rather than running
       * under it. The cap is the copy's, not the card's — the plate stays full
       * width and the text column sits on its left.
       */}
      <div className="relative max-w-[460px]">
        {/* Broken after "generation" rather than left to wrap: the line is
            longer than the one it replaces, and at the copy column's cap it
            would otherwise break after "next" and strand a word. */}
        <h3 className="text-[30px] font-extrabold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[38px]">
          The next generation<br />of great companies
        </h3>

        {/* The accent rule under the heading, as the reference sets it. */}
        <span className="mt-5 block h-[3px] w-12 rounded-full bg-brand" aria-hidden />

        <p className="mt-5 text-[13.5px] leading-relaxed text-ink2 sm:text-[14px]">
          Discover insights that power better decisions.<br />
          Track what matters. Understand what comes next.
        </p>

        <span className="btn-primary mt-7 inline-flex transition-[filter] duration-150 group-hover:brightness-110">
          Explore now <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}
