import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native modules skal eksternaliseres så Next ikke bundler dem
  serverExternalPackages: ["better-sqlite3", "systeminformation", "node-pty", "ws"],
};

export default nextConfig;
