import type { CapacitorConfig } from '@capacitor/cli';

// Enveloppe native iOS (Capacitor) : le dossier ios/ est généré à la volée par le workflow
// .github/workflows/ios-ipa.yml sur un runner macOS ; il n'est pas versionné.
const config: CapacitorConfig = {
  appId: 'fr.bertrand.optcg',
  appName: 'OPTCG FR',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0b1020',
  },
};

export default config;
