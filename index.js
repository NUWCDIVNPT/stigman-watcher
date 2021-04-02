#!/usr/bin/env node

require('log-timestamp')
const config = require('./config')
const auth = require('./lib/auth')
const api = require('./lib/api')
const cargo = require('./lib/cargo')
const chokidar = require('chokidar');
const fs = require('fs').promises
const parsers = require('./lib/parsers')
const Queue = require('better-queue')
const chalk = require('chalk')

const cargoQueue = new Queue(cargo.cklsHandler, {
  id: 'file',
  batchSize: config.cargoSize,
  batchDelay: config.cargoDelay,
  // batchDelayTimeout: config.cargoDelay
})
cargoQueue.on('batch_failed', (taskId, err, stats) => {
  console.log( `[QUEUE] ${taskId} : Fail : ${err.message} : ${JSON.stringify(stats)}`)
})

const parseQueue = new Queue (parseFile, {
  concurrent: 3
})

run()

async function parseFile (file, cb) {
  const component = 'PARSE'
  try {
    console.log(`[${component}] ${file}`)
    const extension = file.substring(file.lastIndexOf(".") + 1)
    let parser, type
    if (extension.toLowerCase() === 'ckl') {
      parser = parsers.reviewsFromCkl
      type = 'CKL'
    }
    else if (extension.toLowerCase() === 'xml') {
      parser = parsers.reviewsFromScc
      type = "XCCDF"
    }
    else {
      console.log(`[${component}] ${file}: ignored unknown extension.`)
      return false
    }
    const data = await fs.readFile(file)
    let parseResult = parser(data)
    parseResult.file = file
    cargoQueue.push( parseResult )
    console.log(`[QUEUE] ${file}`)
  }
  catch (e) {
    console.log(`[${component}] ${file} ${e}`)
    cb( e, undefined)
  }
  finally {
    cb()
  }
}

async function run() {
  try {
    console.log(chalk.white(`[AUTH] Keycloak preflight to ${config.authority}`))
    const token = await auth.getToken()
    console.log(chalk.green(`[AUTH] Keycloak preflight succeeded: Got token ${JSON.stringify(token)}`))
    console.log(chalk.white(`[API] STIG Manager API preflight to ${config.apiBase} for Collection ${config.collectionId}`))
    const assets = await api.getCollectionAssets(config.collectionId)
    console.log(chalk.green(`[API] Preflight succeeded: Got Assets in Collection ${config.collectionId}`))
    console.log(chalk.white(`[API] STIG Manager API preflight for installed STIGs`))
    const stigs = await api.getInstalledStigs()
    console.log(chalk.green(`[API] Preflight succeeded: Got installed STIGs`))

    const watcher = chokidar.watch(config.watchDir, {
      ignored: config.ignoreDirs,
      ignoreInitial: !config.addExisting,
      persistent: true,
      usePolling: config.usePolling
    })

    watcher.on('add', file  => {
      const extension = file.substring(file.lastIndexOf(".") + 1)
      if (extension.toLowerCase() === 'ckl') {
        console.log(`[ADDED] ${file}`)
        parseQueue.push( file )
      }
    })
    console.log(`[WATCHER] Watching ${config.watchDir}`)
  }
  catch (error) {
    console.log(chalk.red.bold(`${error.component} ${error.message}`))
    process.exit(1)
  }
}