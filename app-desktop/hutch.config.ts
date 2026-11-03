// @hutch cli=0.28.2

export default {
  packageManager: 'bun',
  electrobun: {
    version: '2.0.5',
  },
  scripts: {
    install: ['hutch', 'install', '--frozen-lockfile'],
    dev: ['hutch', 'electrobun', 'dev', '--watch'],
    build: ['hutch', 'electrobun', 'build', '--env=canary'],
  },
}
