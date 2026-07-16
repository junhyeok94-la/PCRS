import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Thermal Guide",
    short_name: "Thermal Guide",
    description: "개인 체감과 날씨를 반영한 의류·활동 가이드",
    start_url: "/app",
    display: "standalone",
    background_color: "#f7faff",
    theme_color: "#09265f",
    lang: "ko",
    icons: [
      { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/thermal-guide-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
