import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Silicon Streets',
  description: 'A tech-themed, real-time board game running on a deterministic engine.',
};

// Set NEXT_PUBLIC_ADSENSE_CLIENT (e.g. "ca-pub-XXXXXXXX") to serve live ads;
// when unset, AdSlot renders an on-brand "Sponsored System Update" placeholder.
const ADSENSE = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="app-bg">
        {ADSENSE && (
          <Script
            id="adsbygoogle-init"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}`}
          />
        )}
        {children}
      </body>
    </html>
  );
}
