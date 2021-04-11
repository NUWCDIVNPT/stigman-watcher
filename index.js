#!/usr/bin/env node

const {logger} = require('./lib/logger')
const config = require('./lib/args')
if (!config) {
  logger.end()
}
// const logger  = require('./lib/logger')
// const auth = require('./lib/auth')
// const api = require('./lib/api')
// const cargo = require('./lib/cargo')
// const chokidar = require('chokidar');
// const fs = require('fs').promises
// const parsers = require('./lib/parsers')
// const Queue = require('better-queue')
// const {serializeError} = require('serialize-error') 

// const cargoQueue = new Queue(cargo.cklsHandler, {
//   id: 'file',
//   batchSize: config.cargoSize,
//   batchDelay: config.cargoDelay,
//   // batchDelayTimeout: config.cargoDelay
// })
// cargoQueue.on('batch_failed', (taskId, err, stats) => {
//   logger.error( {
//     component: 'queue',
//     message: err.message,
//     taskId: taskId,
//     stats: stats
//   })
// })

// const parseQueue = new Queue (parseFile, {
//   concurrent: 3
// })

// run()

// async function parseFile (file, cb) {
//   const component = 'parser'
//   try {
//     const extension = file.substring(file.lastIndexOf(".") + 1)
//     let parser, type
//     if (extension.toLowerCase() === 'ckl') {
//       parser = parsers.reviewsFromCkl
//       type = 'CKL'
//     }
//     else if (extension.toLowerCase() === 'xml') {
//       parser = parsers.reviewsFromScc
//       type = "XCCDF"
//     }
//     else {
//       logger.error({
//         component: component,
//         message: `Ignored unknown extension`,
//         file: file
//       })
//       return false
//     }
//     const data = await fs.readFile(file)
//     logger.info({
//       component: component,
//       message: `Start parse`,
//       file: file
//     })
//     let parseResult = parser(data)
//     parseResult.file = file
//     logger.info({
//       component: component,
//       message: `Queue parsed results`,
//       file: file
//     })
//     cargoQueue.push( parseResult )
//   }
//   catch (e) {
//     logger.error({
//       component: component,
//       message: e.message,
//       file: file
//     })
//     cb( e, undefined)
//   }
//   finally {
//     cb()
//   }
// }


// async function run() {
//   try {
//     const token = await auth.getToken( true )
//     logger.info({ component: 'api', message: `STIG Manager API preflight to ${config.apiBase} for Collection ${config.collectionId}`})
//     const assets = await api.getCollectionAssets(config.collectionId)
//     logger.info({ component: 'api', message: `Preflight succeeded, got Assets in Collection ${config.collectionId}`})
//     logger.info({ component: 'api', message: `STIG Manager API preflight for installed STIGs`})
//     const stigs = await api.getInstalledStigs()
//     logger.info({ component: 'api', message: `Preflight succeeded, got installed STIGs`})

//     const watcher = chokidar.watch(config.watchDir, {
//       ignored: config.ignoreDirs,
//       ignoreInitial: !config.addExisting,
//       persistent: true,
//       usePolling: config.usePolling
//     })

//     watcher.on('error', e => {
//       logger.error({
//         component: 'watcher',
//         error: serializeError(e)
//       })
//     })

//     watcher.on('add', file  => {
//       // chokidar glob argument doesn't work for UNC Windows, so we check file extension here
//       const extension = file.substring(file.lastIndexOf(".") + 1)
//       if (extension.toLowerCase() === 'ckl') {
//         logger.info({
//           component: 'watcher',
//           message: 'File system event',
//           event:  'add',
//           file: file
//         })
//         parseQueue.push( file )
//       }
//     })
//     logger.info({ component: 'watcher', message: `Starting to watch ${config.watchDir}` })
//   }
//   catch (e) {
//     const errorObj = {
//       component: e.component || 'watcher',
//       message: e.message,
//     }
//     if (e.request) {
//       errorObj.request = {
//         method: e.request.options?.method,
//         url: e.request.requestUrl
//       }
//     }
//     if (e.response) {
//       errorObj.response = {
//         status: e.response.statusCode,
//         body: e.response.body
//       }
//     }
//     if (e.name !== 'RequestError' && e.name !== 'HTTPError') {
//       errorObj.error = serializeError(e)
//     }
//     logger.error(errorObj)
//     process.exit(1)
//   }
// }