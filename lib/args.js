const { Command, Option, addOption } = require ('commander')
const fs = require('fs')
const { logger, addConsole, addLogfile } = require('./logger')
const dotenv = require('dotenv')

dotenv.config()
const pe = process.env

const logLevelOption = new Option('--log-level <level>', 'Log level for the console (LOG_LEVEL)').choices(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default(pe.WATCHER_LOG_LEVEL ?? 'info')

const logFileLevelOption = new Option('--log-file-level <level>', 'Log level for the log file (LOG_FILE_LEVEL)').choices(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default(pe.WATCHER_LOG_FILE_LEVEL ?? 'verbose')

const getBoolean = ( envvar ) => {
  if (pe[envvar] === undefined) {
    return true
  }
  else {
    return pe[envvar] === '1' || pe[envvar] === 'true'
  }
}

const program = new Command()
program
.usage('[options]\n\nA utility that watches a directory for test result files on behalf of\na STIG Manager Collection. Many options can be set with an environment\nvariable prefixed by "WATCHER_" and are documented in the descriptions.')
.configureHelp({ helpWidth: 80, sortOptions: true })
.option('-p, --path <path>', 'Path to watch (DIR)', pe.WATCHER_DIR || '.')
.requiredOption('-c, --collection-id <id>', 'collectionId to manage (COLLECTION)', pe.WATCHER_COLLECTION)
.option('-s, --silent', 'Disable logging to the console', false)
.addOption(logLevelOption)
.addOption(logFileLevelOption)
.option('--log-file <path>', 'Path to the log file (LOG_FILE). Disable file logging with --no-log-file', pe.WATCHER_NO_LOG_FILE == 1 ? false : pe.WATCHER_LOG_FILE ?? './watcher.log')
.option('--no-log-file', 'Disable logging to a logfile')
.requiredOption('--api <url>', 'Base URL of the STIG Manager API (API_BASE)', pe.WATCHER_API_BASE)
.requiredOption('--authority <url>', 'Base URL of the OIDC authority (AUTHORITY)', pe.WATCHER_AUTHORITY)
.requiredOption('--client-id <string>', 'OIDC clientId to authenticate (CLIENT_ID). If --client-key is not present, you will be prompted for the client secret unless WATCHER_CLIENT_SECRET is set or the --silent option is present', pe.WATCHER_CLIENT_ID)
.option('--client-key <path>', 'Path to a PEM encoded private key (CLIENT_KEY). You will be prompted for the passphrase (if needed) unless WATCHER_CLIENT_KEY_PASSPHRASE is set or the --silent option is present.',  pe.WATCHER_CLIENT_KEY)
.option('--add-existing', 'Process existing files in the watched path.',  pe.WATCHER_ADD_EXISTING == '1')
.option('--cargo-delay <ms>', 'Milliseconds to delay processing the queue (CARGO_DELAY)',  pe.WATCHER_CARGO_DELAY ?? '2000')
.option('--cargo-size <number>', 'Maximum queue size that triggers processing (CARGO_SIZE)',  pe.WATCHER_CARGO_SIZE ?? '25')
.option('--create-objects', 'Create Assets or STIG Assignments as needed (CREATE_OBJECTS). Negate with --no-create-objects.', getBoolean('WATCHER_CREATE_OBJECTS'))
.option('--no-create-objects', 'Do not create Assets or STIG Assignments.')
.option('--ignore-dir [names...]', 'Sub-directory name to ignore. Can be invoked multiple times.(IGNORE_DIRS=<csv>)', pe.WATCHER_IGNORE_DIRS?.split(','))
.option('--use-polling', 'Use file system events with polling. Negate with --no-use-polling', getBoolean('WATCHER_USE_POLLING'))
.option('--no-use-polling', 'Use file system events without polling.')
.option('--stability-threshold <ms>', 'Milliseconds to allow file size to stabilize\nbefore processing', '0')


program.parse(process.argv)
const options = program.opts()
if (!options.silent) {
  addConsole( options.logLevel )
  logger.log({
    level: 'debug',
    component: 'watcher',
    message: 'added console',
    logLevel: options.logLevel
  })
}
if (options.logFile) {
  addLogfile( options.logFileLevel, options.logFile )
  logger.log({
    level: 'debug',
    component: 'watcher',
    message: 'added log file',
    logFile: options.logFile,
    logLevel: options.logFileLevel
  })
}
logger.log({
  level: 'debug',
  component: 'watcher',
  message: 'parsed options',
  options: options
})

// Client auth
const readlineSync = require('readline-sync')
if (!options.clientKey) {
  options.clientSecret = process.env.WATCHER_CLIENT_SECRET ?? readlineSync.question(`Provide the client secret for ${options.clientId}: `, { hideEchoBack: true })
}
else {
  try {
    options.clientKey = getPrivateKey ( options.clientKey, process.env.WATCHER_CLIENT_KEY_PASSPHRASE)
  }
  catch (e) {
    logger.log({
      level: 'error',
      component: 'watcher',
      message: 'private key error',
      file: options.clientKey,
      error: e
    })
    return
  }
}
logger.log({
  level: 'debug',
  component: 'watcher',
  message: 'parsed options',
  options: options
})

function getPrivateKey( pemFile, passphrase) {
  const readlineSync = require('readline-sync')
  const crypto = require('crypto')
    let pemKey, privateKey
    try {
      pemKey = fs.readFileSync(pemFile)
    }
    finally {}
    try {
      return crypto.createPrivateKey({ key: pemKey, passphrase: passphrase })
    }
    catch (e) {
      let clientKeyPassphrase
      if (e.code === 'ERR_MISSING_PASSPHRASE') {
        clientKeyPassphrase = readlineSync.question(`Provide passphrase for the client private key: `, { hideEchoBack: true })
        try {
          return crypto.createPrivateKey({ key: pemKey, passphrase: clientKeyPassphrase })
        }
        finally {}
      }
      else {
        throw (e)
      }
    } 
}

module.exports = options

