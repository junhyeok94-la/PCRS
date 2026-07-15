import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { PwaRegister } from "./PwaRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Thermal Guide | 개인 맞춤형 체감 열 부하 데이터 서비스",
  description: "개인 신체 스펙(키, 몸무게, 체지방률)과 실시간 기상 데이터를 융합해 최적의 체감 온도 및 의류 가이드를 추천하는 대국민 헬스케어 프로덕트",
  keywords: ["체감온도", "의류 추천", "열부하", "기상 데이터", "PMV 지수", "맞춤형 패션", "개인 헬스케어"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}

