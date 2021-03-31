const yargs = require("yargs")
const fs = require('fs')
const options = yargs
 .usage("Usage: -e <environment_file>")
 .option("e", { alias: "env", describe: "Environment file", type: "string", demandOption: false })
 .argv

 if (options.env && !fs.existsSync(options.env)) {
   console.error(`Environment file ${options.env} not found`)
 }
 else if (options.env) {
  const dotenv = require('dotenv')
  dotenv.config({ path: options.env }); 
 }

module.exports = {
  addExisting: process.env.WATCHER_ADD_EXISTING !== undefined ? process.env.WATCHER_ADD_EXISTING === 'true' : false,
  collectionId: process.env.WATCHER_COLLECTION || '18',
  authority: process.env.WATCHER_AUTHORITY || 'http://localhost:8080/auth/realms/stigman',
  clientId:  process.env.WATCHER_CLIENTID || 'stigman-watcher',
  secret:  process.env.WATCHER_SECRET || '954fd71a-dad6-47ab-8035-060268f3d396',
  watchDir: process.env.WATCHER_DIR || './watched',
  apiBase: process.env.WATCHER_API_BASE || 'http://localhost:64001/api',
  createApiObjects: process.env.WATCHER_CREATE_OBJECTS !== undefined ? process.env.WATCHER_CREATE_OBJECTS === 'true' : true,
  cargoDelay: parseInt(process.env.WATCHER_CARGO_DELAY) || 2000,
  cargoSize: parseInt(process.env.WATCHER_CARGO_SIZE) || 25
}