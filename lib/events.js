import {options} from './args.js'
import { logger } from './logger.js'
import { parseQueue } from './parse.js'
import { serializeError } from 'serialize-error'
import { watch } from 'chokidar'

const component = 'events'

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
    }
  })
  watcher.on('error', onError )
  watcher.on('add', onAdd )
}

function onAdd (file) {
  // chokidar glob argument doesn't work for UNC Windows, so we check file extension here
  const extension = file.substring(file.lastIndexOf(".") + 1)
  if (extension.toLowerCase() === 'ckl' || extension.toLowerCase() === 'xml' || extension.toLowerCase() === 'cklb') {
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