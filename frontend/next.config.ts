import type { NextConfig } from "next";

/* The browser only calls /api/*. Next forwards it to the FastAPI backend, so there is no CORS
   and the backend URL lives in one place. */
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8600";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  output: "standalone", // small self-contained server for the Docker image
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
