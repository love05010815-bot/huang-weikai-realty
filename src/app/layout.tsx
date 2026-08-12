import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "黃瑋凱｜台中海線房仲・線上預約",
  description: "台中海線房仲黃瑋凱。資產配置、稅務諮詢、簡易裝潢，線上預約諮詢。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
