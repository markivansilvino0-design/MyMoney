import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyMoney",
    short_name: "MyMoney",
    description: "Personal savings, income and expense tracker",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#061b4f",
    theme_color: "#0b5cff",
    icons: [
      {
        src: "/mymoney-icon-v20260918-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/mymoney-icon-v20260918-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/mymoney-icon-v20260918-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
