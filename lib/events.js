import {options} from './args.js'
import { logger } from './logger.js'
import { queue } from './parse.js'
import { serializeError } from 'serialize-error'
import { watch } from 'chokidar'
import Alarm from './alarm.js'

const component = 'events'

function startFsEventWatcher () {
  const awaitWriteFinish = options.stabilityThreshold ? { stabilityThreshold: options.stabilityThreshold } : false
  const ignored = options.ignoreGlob ?? []
  if (options.ignoreDot) ignored.push(/(^|[\/\\])\../)

  const watcher = watch(options.path, {
    ignored,
    ignoreInitial: !options.addExisting,
    persistent: true,
    usePolling: options.usePolling,
    awaitWriteFinish
  })
  logger.info({component: component, message: `watching`, path: options.path})
  
  watcher.on('ready', () => {
    if (options.oneShot) {
      watcher.close()
    }
  })
  watcher.on('error', onError )
  watcher.on('add', onAdd )
  Alarm.on('alarmRaised', onAlarmRaised)
  Alarm.on('alarmLowered', onAlarmLowered)
}

function onAdd (file) {
  // chokidar glob argument doesn't work for UNC Windows, so we check file extension here
  const extension = file.substring(file.lastIndexOf(".") + 1)
  if (extension.toLowerCase() === 'ckl' || extension.toLowerCase() === 'xml' || extension.toLowerCase() === 'cklb') {
    logger.info({
      component: component,
      message: 'file system event',
      event:  'add',
      file
    })
    queue.push( file )
  }
}

function onError (e) {
  logger.error({
    component: component,
    error: serializeError(e)
  })
}

function onAlarmRaised (alarmType) {
  logger.info({
    component,
    message: `pausing parse queue on alarm raised`,
    alarmType
  })
  queue.pause()
}

function onAlarmLowered (alarmType) {
  logger.info({
    component,
    message: `resuming parse queue on alarm lowered`,
    alarmType
  })
  queue.resume()
}

export default startFsEventWatcher