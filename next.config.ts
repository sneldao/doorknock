import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Model calls go through the Bifrost gateway (OpenAI-compatible), so no
  // server-external packages are needed; everything else is plain fetch.
};

export default nextConfig;
