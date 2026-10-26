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
          // The mic has to be allowed on our own origin, or getUserMedia is
          // rejected before the browser ever shows a permission prompt.
          // Camera and geolocation stay locked: the product never looks at
          // either — GPS zones are computed on the phone, never in a browser.
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
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
