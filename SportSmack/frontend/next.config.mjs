/** @type {import('next').NextConfig} */
const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Normalize the API origin once at build time so every frontend request
// uses the same slash-free base URL (e.g. avoid "//api/auth/login").
const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, '');

const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: normalizedApiUrl
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
