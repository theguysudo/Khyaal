/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@khayaal/shared', '@khayaal/engine'],
  outputFileTracingRoot: process.cwd() + '/../..',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://db.onlinewebfonts.com https://fonts.googleapis.com; font-src 'self' data: https://db.onlinewebfonts.com https://fonts.gstatic.com; connect-src 'self' https:; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
