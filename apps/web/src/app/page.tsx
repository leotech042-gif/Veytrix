import { Dashboard } from "@/components/dashboard";

// This page is intentionally gated until the client-side session check completes.
export const instant = false;

export default function Home() {
  return <Dashboard />;
}
