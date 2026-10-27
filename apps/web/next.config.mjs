/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@khayaal/shared', '@khayaal/engine'],
  outputFileTracingRoot: process.cwd() + '/../..',
};
export default nextConfig;
