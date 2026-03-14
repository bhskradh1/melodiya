import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.melodiya',
  appName: 'melodiya-your-sound',
  webDir: 'dist',
  server: {
    url: 'https://937e166c-0acc-4c6c-a6d2-7fd952f28593.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
