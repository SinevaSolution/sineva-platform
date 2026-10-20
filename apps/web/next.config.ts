import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@sineva/shared', '@sineva/ui'],
  reactStrictMode: true,
};

export default nextConfig;
