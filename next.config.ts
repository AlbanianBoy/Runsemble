import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // No `typescript.ignoreBuildErrors` here on purpose. It used to be on, and it
  // hid a real one: the GDPR export route kept calling a Prisma model that a
  // migration had deleted, so it threw on every request while the build stayed
  // green. The tree typechecks clean — keep it that way.
  reactStrictMode: false,
};

export default nextConfig;
