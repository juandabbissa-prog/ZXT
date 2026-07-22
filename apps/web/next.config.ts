import type { NextConfig } from 'next';
const nextConfig: NextConfig = { transpilePackages: ['@re-agent/shared', '@re-agent/database'] };
export default nextConfig;
