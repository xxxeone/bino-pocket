import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bino Pocket",
    short_name: "Bino Pocket",
    description: "Trip petty cash — scan it, submit it, done.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f7fa",
    theme_color: "#1f86cc",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android Chrome: share screenshots straight from the Photos app into the scanner.
    // (iOS Safari does not support Web Share Target; there the user picks from the library.)
    share_target: {
      action: "/scan",
      method: "POST",
      enctype: "multipart/form-data",
      params: { files: [{ name: "screenshots", accept: ["image/*"] }] },
    },
    shortcuts: [{ name: "Scan receipt", url: "/scan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  } as MetadataRoute.Manifest;
}
