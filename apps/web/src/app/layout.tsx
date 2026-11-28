import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { ThemeProvider, themeBootstrapScript } from "@/components/theme-provider";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AuthGate } from "@/components/auth-gate";
import "./globals.css";
import "./theme-black-gold.css";
import "./news-ui.css";
import "./chart-ui.css";
import "./loader-ui.css";
import "./shell-ui.css";

export const metadata: Metadata = {
  title: {
    default: "Veytrix | Forex workspace",
    template: "%s | Veytrix",
  },
  description:
    "A transparent forex workspace for market data, charts, and trading tools.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <ThemeProvider>
          <Suspense
            fallback={
              <div className="workspace-loading" role="status">
                Loading…
              </div>
            }
          >
            <AuthGate>
              <WorkspaceShell>{children}</WorkspaceShell>
            </AuthGate>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
