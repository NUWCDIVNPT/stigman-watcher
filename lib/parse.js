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
  const userGrant = cache.user.collectionGrants.find( i => i.collection.collectionId === apiCollection.collectionId )?.accessLevel
  return apiCollection.settings.status.canAccept && (userGrant >= apiCollection.settings.status.minAcceptGrant)
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
    const importOptions = safeJSONParse(apiCollection.metadata?.importOptions) ?? defaultImportOptions
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





  