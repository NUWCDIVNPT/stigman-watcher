import { cache } from './api.js'
import Queue from 'better-queue'
import { logger } from './logger.js'
import { cargoQueue } from './cargo.js'
import { promises as fs } from 'fs'
import { reviewsFromCkl, reviewsFromScc, reviewsFromCklb } from '@nuwcdivnpt/stig-manager-client-modules'
import { addToHistory } from './scan.js'
import { options } from './args.js'
import Alarm from './alarm.js'

const component = 'parser'
const cargoHighWaterMark = 2 * options.cargoSize

const defaultImportOptions = {
  autoStatus: 'saved',
  unreviewed: 'commented',
  unreviewedCommented: 'informational',
  emptyDetail: 'replace',
  emptyComment: 'ignore',
  allowCustom: true
}

function safeJSONParse (value) {
  try {
    return JSON.parse(value)
  }
  catch (e) {
    return undefined
  }
}

function canUserAccept () {
  if (!cache.user) return false

  const apiCollection = cache.collection
  const userGrant = cache.user.collectionGrants.find( i => i.collection.collectionId === apiCollection.collectionId )?.roleId
  return apiCollection.settings.status.canAccept && (userGrant >= apiCollection.settings.status.minAcceptGrant)
}

/**
 * Returns the current number of tasks queued in the cargoQueue.
 */
function getCargoDepth () {
  return cargoQueue.length
}

/**
 * Returns a Promise that resolves when cargoQueue depth drops at or below
 * the threshold, or when an alarm is raised (to avoid deadlock).
 */
function waitForCargoBelow (threshold) {
  return new Promise((resolve) => {
    const cleanup = () => {
      cargoQueue.removeListener('batch_finish', onBatch)
      cargoQueue.removeListener('batch_failed', onBatch)
      cargoQueue.removeListener('drain', onDrain)
      Alarm.removeListener('alarmRaised', onAlarm)
    }
    const checkDepth = () => {
      if (getCargoDepth() <= threshold) {
        cleanup()
        resolve()
      }
    }
    const onBatch = () => {
      checkDepth()
    }
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onAlarm = () => {
      cleanup()
      resolve()
    }
    cargoQueue.on('batch_finish', onBatch)
    cargoQueue.on('batch_failed', onBatch)
    cargoQueue.on('drain', onDrain)
    Alarm.on('alarmRaised', onAlarm)
    checkDepth()
  })
}

async function parseFileAndEnqueue (file, cb) {
  try {
    const extension = file.substring(file.lastIndexOf(".") + 1)
    let parseFn
    if (extension.toLowerCase() === 'ckl') {
      parseFn = reviewsFromCkl
    }
    else if (extension.toLowerCase() === 'xml') {
      parseFn = reviewsFromScc
    }
    else if (extension.toLowerCase() === 'cklb') {
      parseFn = reviewsFromCklb
    }
    else {
      throw new Error('Ignored unknown extension')
    }
    // ReviewParser params
    const data = await fs.readFile(file)
    logger.verbose({component, message: `readFile succeeded`, file: file})

    const apiCollection = cache.collection
    const importOptions = apiCollection.settings?.importOptions ?? safeJSONParse(apiCollection.metadata?.importOptions) ?? defaultImportOptions
    const fieldSettings = apiCollection.settings.fields
    const allowAccept = canUserAccept()
    const scapBenchmarkMap = cache.scapBenchmarkMap

    let parseResult = parseFn({
      data,
      importOptions,
      fieldSettings,
      allowAccept,
      scapBenchmarkMap,
      sourceRef: file
    })
    logger.debug({component, message: `parse results`, results: parseResult})
    
    cargoQueue.push( parseResult )
    
    const checklistInfo = []
    for (const checklist of parseResult.checklists) {
      checklistInfo.push({ 
        benchmarkId: checklist.benchmarkId, 
        stats: checklist.stats
      })
    }
    logger.verbose({component, message: `results queued`, file: parseResult.sourceRef,
      target: parseResult.target.name, checklists: checklistInfo })

    // Backpressure: if cargoQueue depth exceeds the high-water mark,
    // wait for it to drain before signaling completion to parseQueue.
    if (getCargoDepth() > cargoHighWaterMark) {
      logger.verbose({component, message: `backpressure active, waiting for cargo to drain`,
        cargoDepth: getCargoDepth(), cargoHighWaterMark})
      await waitForCargoBelow(cargoHighWaterMark)
      logger.verbose({component, message: `backpressure released`,
        cargoDepth: getCargoDepth()})
    }
    cb(null, parseResult)
  }
  catch (e) {
    logger.warn({component, message: e.message, file})
    options.mode === 'scan' && addToHistory(file)
    cb(e, null)
  }
}

export const parseQueue = new Queue (parseFileAndEnqueue, {
  concurrent: 8
})

Alarm.on('alarmRaised', onAlarmRaised)
Alarm.on('alarmLowered', onAlarmLowered)

/**
 * @typedef {import('./alarm.js').AlarmType} AlarmType
 */

/**
 * Handles raised alarms
 * @param {AlarmType} alarmType - The type of alarm.
 * Intended to be a callback function of Alarm.on('alarmRaised')
 */
function onAlarmRaised (alarmType) {
  logger.info({
    component,
    message: `pausing queue on alarm raised`,
    alarmType
  })
  parseQueue.pause()
}

/**
 * Handles lowered alarms
 * @param {AlarmType} alarmType - The type of alarm.
 * Intended to be a callback function of Alarm.on('alarmRaised')
 */
function onAlarmLowered (alarmType) {
  logger.info({
    component,
    message: `resuming queue on alarm lowered`,
    alarmType
  })
  parseQueue.resume()
}
