const yargs = require("yargs")
const fs = require('fs')
const log = require("./lib/logger")

const options = yargs
 .usage("Usage: -e <environment_file>")
 .option("e", { alias: "env", describe: "Environment file", type: "string", demandOption: false })
 .argv

if (options.env && !fs.existsSync(options.env)) {
  log( 'error', {
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

let ignoreDirs
if (process.env.WATCHER_IGNORE_DIRS) {
  ignoreDirs = process.env.WATCHER_IGNORE_DIRS.split(',').map( dir => `**/${dir}/**/*`)
}

module.exports = {
  addExisting: process.env.WATCHER_ADD_EXISTING !== undefined ? process.env.WATCHER_ADD_EXISTING === 'true' : false,
  collectionId: process.env.WATCHER_COLLECTION || '1',
  authority: process.env.WATCHER_AUTHORITY || 'http://localhost:8080/auth/realms/stigman',
  clientId:  process.env.WATCHER_CLIENT_ID || 'stigman-watcher',
  secret:  process.env.WATCHER_CLIENT_SECRET || process.env.WATCHER_SECRET,
  clientKey: process.env.WATCHER_CLIENT_KEY,
  clientKeyPassphrase: process.env.WATCHER_CLIENT_KEY_PASSPHRASE,
  watchDir: process.env.WATCHER_DIR || '.',
  apiBase: process.env.WATCHER_API_BASE || 'http://localhost:64001/api',
  createApiObjects: process.env.WATCHER_CREATE_OBJECTS !== undefined ? process.env.WATCHER_CREATE_OBJECTS === 'true' : true,
  cargoDelay: parseInt(process.env.WATCHER_CARGO_DELAY) || 2000,
  cargoSize: parseInt(process.env.WATCHER_CARGO_SIZE) || 25,
  ignoreDirs: ignoreDirs,
  usePolling: process.env.WATCHER_USE_POLLING !== undefined ? process.env.WATCHER_USE_POLLING === 'true' : false
}