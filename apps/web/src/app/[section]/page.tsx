import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SectionPage } from "@/components/section-pages";

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
  const [{ section }, { symbol }] = await Promise.all([params, searchParams]);
  if (!sections.has(section)) notFound();
  return (
    <SectionPage
      section={section}
      symbol={typeof symbol === "string" ? symbol : ""}
    />
  );
}
