import { redirect } from "next/navigation";

/** Chart is the core landing page */
export default function Home() {
  redirect("/charts");
}
