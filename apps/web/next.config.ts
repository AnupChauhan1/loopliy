import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost', '0.0.0.0'],
  experimental: {
    agentUpgrade: 'security',
  },
  async headers() {
    return [
      {
        // PWA assets must always be public and correctly typed for iOS Safari
        source: '/:path(manifest.webmanifest|manifest.json|sw.js|apple-touch-icon.png|icons/:path*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
  },
};

export default nextConfig;
