import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "GovEntry Support",
  description: "Support tooling for GovEntry / GovSupply / GovRewards",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-x-auto px-8 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
