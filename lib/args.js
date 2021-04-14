const { Command, Option, InvalidOptionArgumentError, Help } = require ('commander')
Help.prototype.optionDescription = (option) => {
  if (option.negate) {
    return option.description;
  }
  const extraInfo = [];
  if (option.mandatory) {
    extraInfo.push(`REQUIRED`)
  }
  if (option.argChoices) {
    extraInfo.push(
      // use stringify to match the display of the default value
      `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(', ')}`);
  }
  if (option.defaultValue !== undefined) {
    // watcher: changed 'default' to 'currently'
    extraInfo.push(`currently: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
  }
  if (extraInfo.length > 0) {
    return `${option.description} (${extraInfo.join(', ')})`;
  }
  return option.description;
}
Help.prototype.formatHelp = (cmd, helper) => {
  const termWidth = helper.padWidth(cmd, helper);
  const helpWidth = helper.helpWidth || 80;
  const itemIndentWidth = 2;
  const itemSeparatorWidth = 2; // between term and description
  function formatItem(term, description) {
    if (description) {
      const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
      return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
    }
    return term;
  };
  function formatList(textArray) {
    // watcher: doube-space
    return textArray.join('\n\n').replace(/^/gm, ' '.repeat(itemIndentWidth));
  }

  // Usage
  let output = [`Usage: ${helper.commandUsage(cmd)}`, ''];

  // Description
  const commandDescription = helper.commandDescription(cmd);
  if (commandDescription.length > 0) {
    output = output.concat([commandDescription, '']);
  }

  // Arguments
  const argumentList = helper.visibleArguments(cmd).map((argument) => {
    return formatItem(argument.term, argument.description);
  });
  if (argumentList.length > 0) {
    output = output.concat(['Arguments:', formatList(argumentList), '']);
  }

  // Options
  const optionList = helper.visibleOptions(cmd).map((option) => {
    return formatItem(helper.optionTerm(option), helper.optionDescription(option));
  });
  if (optionList.length > 0) {
    output = output.concat(['Options:', formatList(optionList), '']);
  }

  // Commands
  const commandList = helper.visibleCommands(cmd).map((cmd) => {
    return formatItem(helper.subcommandTerm(cmd), helper.subcommandDescription(cmd));
  });
  if (commandList.length > 0) {
    output = output.concat(['Commands:', formatList(commandList), '']);
  }

  return output.join('\n');
}

const version = require("../package.json").version
const fs = require('fs')
const { logger, addConsoleTransport, addFileTransport } = require('./logger')
const dotenv = require('dotenv')

dotenv.config()
const pe = process.env

const logLevelOption = new Option('--log-level <level>', 'Log level for the console (WATCHER_LOG_LEVEL)')
.choices(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
.default(pe.WATCHER_LOG_LEVEL ?? 'info')
const logFileLevelOption = new Option('--log-file-level <level>', 'Log level for the log file (WATCHER_LOG_FILE_LEVEL)')
.choices(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
.default(pe.WATCHER_LOG_FILE_LEVEL ?? 'verbose')

const getBoolean = ( envvar, defaultState = true ) => {
  if (pe[envvar] === undefined) {
    return defaultState
  }
  else {
    return pe[envvar] === '1' || pe[envvar] === 'true'
  }
}
const parseIntegerArg = (value, previous) => {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidOptionArgumentError('Not a number.');
  }
  return parsedValue;
}
const parseIntegerEnv = (value) => {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    return undefined
  }
  return parsedValue;
}

const program = new Command()
program
.usage('[options]\n\nA utility that watches a directory for test result files on behalf of a STIG Manager Collection. Many options can be set with an environment variable prefixed by "WATCHER_" and are documented in the descriptions. The environment can be set by providing an .env file in the current directory.')
.configureHelp({ sortOptions: true })
.version(version, '--version', 'Print the current version and exit')
.option('-p, --path <path>', 'Path to watch (WATCHER_PATH)', pe.WATCHER_PATH || '.')
.requiredOption('-c, --collection-id <id>', 'collectionId to manage (WATCHER_COLLECTION)', pe.WATCHER_COLLECTION)
.option('-s, --silent', 'Disable logging to the console', false)
.option('--prompt', 'Prompt for missing secret or passphrase', false)
.addOption(logLevelOption)
.addOption(logFileLevelOption)
.option('--log-file <path>', 'Path to the log file (WATCHER_LOG_FILE). Will be created if needed. Disable file logging with --no-log-file', pe.WATCHER_NO_LOG_FILE == 1 ? false : pe.WATCHER_LOG_FILE ?? false)
.option('--no-log-file', 'Disable logging to a logfile')
.requiredOption('--api <url>', 'Base URL of the STIG Manager API (WATCHER_API_BASE)', pe.WATCHER_API_BASE)
.requiredOption('--authority <url>', 'Base URL of the OIDC authority (WATCHER_AUTHORITY)', pe.WATCHER_AUTHORITY)
.requiredOption('--client-id <string>', 'OIDC clientId to authenticate (WATCHER_CLIENT_ID). You will be prompted for the client secret if --client-key is not provided and --prompt is provided, unless WATCHER_CLIENT_SECRET is set', pe.WATCHER_CLIENT_ID)
.option('--client-key <path>', 'Path to a PEM encoded private key (WATCHER_CLIENT_KEY). If the key is encrypted, you will be prompted for the passphrase if --prompt is provided, unless WATCHER_CLIENT_KEY_PASSPHRASE is set.',  pe.WATCHER_CLIENT_KEY)
.option('--add-existing', 'Process existing files in the watched path (WATCHER_ADD_EXISTING=1). Negate with --no-add-existing.',  getBoolean('WATCHER_ADD_EXISTING', false))
.option('--no-add-existing', 'Ignore existing files in the watched path (WATCHER_ADD_EXISTING=0).')
.option('--cargo-delay <ms>', 'Milliseconds to delay processing the queue (WATCHER_CARGO_DELAY)',  parseIntegerArg,  parseIntegerEnv(pe.WATCHER_CARGO_DELAY) ?? 2000)
.option('--cargo-size <number>', 'Maximum queue size that triggers processing (WATCHER_CARGO_SIZE)', parseIntegerArg, parseIntegerEnv(pe.WATCHER_CARGO_SIZE) ?? 25)
.option('--create-objects', 'Create Assets or STIG Assignments as needed (WATCHER_CREATE_OBJECTS=1). Negate with --no-create-objects.', getBoolean('WATCHER_CREATE_OBJECTS'))
.option('--no-create-objects', 'Do not create Assets or STIG Assignments (WATCHER_CREATE_OBJECTS=0).')
.option('--ignore-dir [names...]', 'Sub-directory name to ignore. Can be invoked multiple times.(WATCHER_IGNORE_DIRS=<csv>)', pe.WATCHER_IGNORE_DIRS?.split(','))
.option('--use-polling', 'Use file system events with polling (WATCHER_USE_POLLING). Negate with --no-use-polling', getBoolean('WATCHER_USE_POLLING'))
.option('--no-use-polling', 'Use file system events without polling (WATCHER_USE_POLLING=0).')
.option('--stability-threshold <ms>', 'Milliseconds to wait for file size to stabilize. May be helpful when watching network shares. (WATCHER_STABILITY_THRESHOLD)', parseIntegerArg, parseIntegerEnv(pe.WATCHER_STABILITY_THRESHOLD) ?? 0)
.option('--one-shot', 'Process existing files in the watched path and exit. Sets --add-existing.', false)
.option('--log-color', 'Colorize the console log output. Might confound downstream piped processes.', false)
.option('-d, --debug', 'Shortcut for --log-level debug --log-file-level debug', false)

program.parse(process.argv)
const options = program.opts()
// set related options
if (options.oneShot) {
  options.addExisting = true
}
if (options.debug) {
  options.logLevel = 'debug'
  options.logFileLevel = 'debug'
}
addConsoleTransport( options.logLevel, options.logColor, options.silent )
logger.log({
  level: 'debug',
  component: 'watcher',
  message: 'added console',
  logLevel: options.logLevel
})
if (options.logFile) {
  addFileTransport( options.logFileLevel, options.logFile )
  logger.log({
    level: 'debug',
    component: 'watcher',
    message: 'added log file',
    logFile: options.logFile,
    logLevel: options.logFileLevel
  })
}
logger.log({
  level: 'info',
  component: 'watcher',
  message: 'starting',
  version: version
})

// Client auth
const prompt = require('prompt-sync')({ sigint:true })
if (!options.clientKey) {
  options.clientSecret = process.env.WATCHER_CLIENT_SECRET
  if (options.prompt && !options.clientSecret) {
    options.clientSecret = prompt(`Provide the client secret for ${options.clientId}: `, { echo: '*' })
  }
  if (!options.clientSecret) {
    logger.error({
      component: 'watcher',
      message: 'Missing client secret'
    })
    module.exports = false
    return
  }
}
else {
  try {
    options.clientKey = getPrivateKey ( options.clientKey, process.env.WATCHER_CLIENT_KEY_PASSPHRASE, options.prompt)
  }
  catch (e) {
    logger.log({
      level: 'error',
      component: 'watcher',
      message: 'private key error',
      file: options.clientKey,
      error: e
    })
    module.exports = false
    return
  }
}
logger.log({
  level: 'debug',
  component: 'watcher',
  message: 'parsed options',
  options: options
})

function getPrivateKey( pemFile, passphrase, canPrompt) {
  const prompt = require('prompt-sync')({ sigint:true })
  const crypto = require('crypto')
    let pemKey
    try {
      pemKey = fs.readFileSync(pemFile)
    }
    finally {}
    try {
      return crypto.createPrivateKey({ key: pemKey, passphrase: passphrase })
    }
    catch (e) {
      let clientKeyPassphrase
      if (e.code === 'ERR_MISSING_PASSPHRASE' && canPrompt) {
        clientKeyPassphrase = prompt(`Provide passphrase for the client private key: `, { echo: "*" })
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

