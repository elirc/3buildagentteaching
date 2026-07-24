import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  transpilePackages: [
    "@agentic-edu/agents",
    "@agentic-edu/application",
    "@agentic-edu/db",
    "@agentic-edu/domain",
    "@agentic-edu/observability",
    "@agentic-edu/shared",
    "@agentic-edu/ui"
  ]
};

export default nextConfig;
