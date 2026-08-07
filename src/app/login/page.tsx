import { redirect } from "next/navigation";
import { currentAddress } from "@/lib/session";
import { LoginPanel } from "@/components/LoginPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in — OwnTmrw" };

/**
 * Where `proxy.ts` sends a request with no session.
 *
 * `next` is validated rather than trusted: it arrives in the URL, and an
 * absolute one would turn this page into an open redirect that borrows the
 * site's name to send people elsewhere.
 */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(next);

  // Already signed in — nothing to ask for.
  if (await currentAddress()) redirect(dest);

  return (
    <div className="mx-auto w-full max-w-[420px] py-12 sm:py-16">
      <LoginPanel next={dest} />
    </div>
  );
}
