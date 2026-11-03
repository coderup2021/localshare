import type { ElectrobunConfig } from 'electrobun'

export default {
  app: {
    name: 'LocalShare Desktop',
    identifier: 'dev.localshare.desktop',
    version: '0.1.0',
  },
  build: {
    mainProcess: 'bun',
    bun: {
      entrypoint: 'src/bun/index.ts',
    },
    copy: {
      'dist/index.html': 'views/mainview/index.html',
      'dist/assets': 'views/mainview/assets',
      'dist/brand-icon.svg': 'views/mainview/brand-icon.svg',
    },
    watchIgnore: ['dist/**'],
    mac: {
      bundleCEF: false,
      icons: 'assets/icon.iconset',
    },
    linux: {
      bundleCEF: false,
      icon: 'assets/icon.png',
    },
    win: {
      bundleCEF: false,
      icon: 'assets/icon.ico',
    },
  },
} satisfies ElectrobunConfig
