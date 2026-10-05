import type { CapacitorConfig } from '@capacitor/cli';

// La app de Android es la misma aplicación web: abre https://barberago.restorago.com dentro de la app,
// así cada publicación web actualiza también la app sin reinstalar el APK.
const config: CapacitorConfig = {
  appId: 'com.noadstudios.barberago',
  appName: 'BarberaGo',
  webDir: 'dist',
  backgroundColor: '#0f0e0c',
  server: {
    url: 'https://barberago.restorago.com',
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
