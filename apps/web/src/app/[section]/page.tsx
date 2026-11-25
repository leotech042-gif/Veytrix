import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SectionPage } from "@/components/section-pages";

// This route is intentionally gated until the client-side session check completes.
export const instant = false;

const sections = new Set([
  "markets",
  "terminal",
  "charts",
  "signals",
  "fundamentals",
  "history",
  "assistant",
  "settings",
  "faq",
  "privacy",
  "terms",
  "risk-disclosure",
]);

export default function WorkspaceSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="workspace-loading" role="status">
          Loading section…
        </div>
      }
    >
      <WorkspaceSectionContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function WorkspaceSectionContent({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { section } = await params;
  if (!sections.has(section)) notFound();

  const sp = await searchParams;
  const symbolRaw = sp?.symbol;
  const symbol = Array.isArray(symbolRaw) ? symbolRaw[0] ?? "" : symbolRaw ?? "";

  return <SectionPage section={section} symbol={symbol} />;
}
