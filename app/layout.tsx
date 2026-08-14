import type { ReactNode } from "react";

export const metadata = {
  title: "TTB Label Check",
  description: "AI-powered alcohol label verification",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", fontSize: 18, margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
