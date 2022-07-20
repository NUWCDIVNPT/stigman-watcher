const config = require('./args')
const { logger } = require('./logger')
const parse = require('./parse')
const { serializeError } = require('serialize-error')
const { resolve } = require('path')
const chokidar = require('chokidar')

const component = 'events'
module.exports.startFsEventWatcher = () => {
  const awaitWriteFinishVal = config.stabilityThreshold ? { stabilityThreshold: config.stabilityThreshold } : false
  const ignored = config.ignoreGlob ?? []
  if (config.ignoreDot) ignored.push(/(^|[\/\\])\../)
  const watcher = chokidar.watch(config.path, {
    ignored,
    ignoreInitial: !config.addExisting,
    persistent: true,
    usePolling: config.usePolling,
    awaitWriteFinish: awaitWriteFinishVal
  })
  logger.info({component: component, message: `watching`, path: config.path})
  
  watcher.on('ready', e => {
    if (config.oneShot) {
      watcher.close()
    }
  })
  
  watcher.on('error', e => {
    logger.error({
      component: component,
      error: serializeError(e)
    })
  })
  
  watcher.on('add', file  => {
    // chokidar glob argument doesn't work for UNC Windows, so we check file extension here
    const extension = file.substring(file.lastIndexOf(".") + 1)
    if (extension.toLowerCase() === 'ckl' || extension.toLowerCase() === 'xml') {
      logger.info({
        component: component,
        message: 'file system event',
        event:  'add',
        file: file
      })
      parse.queue.push( file )
    }
  })
}




