const yargs = require('yargs')
const fs = require('fs')
const log = require('./lib/logger')

const options = yargs
  .usage('\nUsage: $0 [options]')
  .option('e', {
    alias: 'env',
    describe: 'Path to an environment file (default: ./.env)\n'
  })
  .option('p', {
    alias: 'path',
    describe: 'The path to watch'
  })
  .option('c', {
    alias: 'collection-id',
    describe: 'The STIG Manager collectionId to manage\n'
  })
  .option('s', {
    alias: 'silent',
    describe: 'Disable logging to the console'
  })
  .option('log-level', {
    describe: 'Log level (0-5) for the console\n0 = error\n1 = warn\n2 = info (default)\n3 = http\n4 = verbose\n5 = debug'
  })
  .option('log-file', {
    describe: 'Path to the log file (default: ./watcher.log)'
  })
  .option('log-file-level', {
    describe: 'Log level (0-5) for the log file (default: 4)'
  })
  .option('no-log-file', {
    describe: 'Disable logging to a logfile\n'
  })
  .option('api', {
    describe: 'The base URL of the STIG Manager API.'
  })
  .option('authority', {
    describe: 'The base URL of the OIDC authority.'
  })
  .option('client-id', {
    describe: 'OIDC clientId to authenticate'
  })
  .option('client-key', {
    describe: 'Path to a PEM encoded private key\n'
  })
  .option('add-existing', {
    describe: 'Existing files are processed first'
  })
  .option('cargo-delay', {
    describe: 'Milliseconds to delay processing the queue\n(default: 2000)'
  })
  .option('cargo-size', {
    describe: 'Maximum queue size that triggers processing\n(default: 25)'
  })
  .option('no-create', {
    describe: 'Disable creating Assets or STIG Assignments'
  })
  .option('ignored-dirs', {
    describe: 'CSV of directory names to ignore'
  })
  .option('disable-polling', {
    describe: 'Use file system events without polling'
  })
  .option('stability-threshold', {
    describe: 'Milliseconds to allow file size to stabilize\nbefore processing'
  })
  .argv

if (options.env && !fs.existsSync(options.env)) {
  log('error', {
    component: 'watcher',
    message: `Environment file not found`,
    path: options.env
  })
}
else if (!options.env && fs.existsSync('.env')) {
  options.env = '.env'
}
if (options.env) {
  const dotenv = require('dotenv')
  dotenv.config({ path: options.env });
}

let logLevel = 'info'
if (options.verbose) {
  if (options.verbose >= 3) {
    logLevel = 'silly'
  }
  else if (options.verbose == 2) {
    logLevel = 'verbose'
  }
  console.log(`Verbosity: ${options.verbose}`)
}

let ignoreDirs
if (process.env.WATCHER_IGNORE_DIRS) {
  ignoreDirs = process.env.WATCHER_IGNORE_DIRS.split(',').map(dir => `**/${dir}/**/*`)
}

module.exports = {
  addExisting: process.env.WATCHER_ADD_EXISTING !== undefined ? process.env.WATCHER_ADD_EXISTING === 'true' : false,
  collectionId: process.env.WATCHER_COLLECTION ?? '1',
  authority: process.env.WATCHER_AUTHORITY || 'http://localhost:8080/auth/realms/stigman',
  clientId: process.env.WATCHER_CLIENT_ID || 'stigman-watcher',
  secret: process.env.WATCHER_CLIENT_SECRET || process.env.WATCHER_SECRET,
  clientKey: process.env.WATCHER_CLIENT_KEY,
  clientKeyPassphrase: process.env.WATCHER_CLIENT_KEY_PASSPHRASE,
  watchDir: process.env.WATCHER_DIR || '.',
  apiBase: process.env.WATCHER_API_BASE || 'http://localhost:64001/api',
  createApiObjects: process.env.WATCHER_CREATE_OBJECTS !== undefined ? process.env.WATCHER_CREATE_OBJECTS === 'true' : true,
  cargoDelay: parseInt(process.env.WATCHER_CARGO_DELAY) || 2000,
  cargoSize: parseInt(process.env.WATCHER_CARGO_SIZE) || 25,
  ignoreDirs: ignoreDirs,
  usePolling: process.env.WATCHER_USE_POLLING !== undefined ? process.env.WATCHER_USE_POLLING === 'true' : false,
  logLevel: process.env.WATCHER_CONSOLE_LOG_LEVEL || 'info'
}