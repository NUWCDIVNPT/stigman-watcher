import {options} from './args.js'
import { logger } from './logger.js'
import { parseQueue } from './parse.js'
import { serializeError } from 'serialize-error'
import { watch } from 'chokidar'
import * as CONSTANTS from './consts.js'

const component = 'events'
let filesFound = false

function startFsEventWatcher () {
  const awaitWriteFinish = options.stabilityThreshold ? { stabilityThreshold: options.stabilityThreshold } : false
  const ignored = options.ignoreGlob ?? []
  if (options.ignoreDot) ignored.push(/(^|[/\\])\../)

  const watcher = watch(options.path, {
    ignored,
    ignoreInitial: !options.addExisting,
    persistent: true,
    usePolling: options.usePolling,
    awaitWriteFinish
  })
  logger.info({component, message: `watching`, path: options.path})
  
  watcher.on('ready', () => {
    if (options.oneShot) {
      watcher.close()
      // If no relevant files were found during initial scan, exit immediately. Otherwise, let the cargo queue drain event handle the exit
      if (!filesFound) {
        logger.info({component, message: 'finished one shot mode - no files found'})
        process.exit(CONSTANTS.ONESHOTEXIT)
      }
    }
  })
  watcher.on('error', onError )
  watcher.on('add', onAdd )
}

function onAdd (file) {
  // chokidar glob argument doesn't work for UNC Windows, so we check file extension here
  const extension = file.substring(file.lastIndexOf(".") + 1)
  if (extension.toLowerCase() === 'ckl' || extension.toLowerCase() === 'xml' || extension.toLowerCase() === 'cklb') {
    filesFound = true
    logger.info({
      component,
      message: 'file system event',
      event:  'add',
      file
    })
    parseQueue.push( file )
  }
}

function onError (e) {
  logger.error({
    component,
    error: serializeError(e)
  })
}

export default startFsEventWatcher