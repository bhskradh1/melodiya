import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.melodiya.melodiya_app',
  appName: 'Melodiya',
  webDir: 'dist',
  backgroundColor: '#0A0A0A',
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
