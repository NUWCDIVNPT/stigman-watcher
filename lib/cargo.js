import { options } from './args.js'
import { logger, getSymbol } from './logger.js'
import Queue from 'better-queue'
import * as api from './api.js'
import { serializeError } from 'serialize-error'
import { TaskObject } from '@nuwcdivnpt/stig-manager-client-modules'
import { addToHistory } from './scan.js'
import Alarm from './alarm.js'


const component = 'cargo'
let batchId = 0

async function writer ( taskAsset ) {
  try {
    logger.debug({ 
      component,
      message: `${taskAsset.assetProps.name} started`
    })

    // Create new asset if necessary
    if ( !taskAsset.knownAsset ) {
      const r = await api.createOrGetAsset( taskAsset.assetProps )
      // GET projection=stigs is an object, we just need the benchmarkIds
      r.apiAsset.stigs = r.apiAsset.stigs.map ( stig => stig.benchmarkId )
      logger.info({ component, message: `asset ${r.created ? 'created' : 'found'}`, asset: r.apiAsset })
      // Iterate: If created === false, then STIG assignments should be vetted again
      taskAsset.assetProps = r.apiAsset
    }

    // Assign new STIGs, if necessary
    if ( taskAsset.knownAsset && taskAsset.hasNewAssignment ) {
      const r = await api.patchAsset(taskAsset.assetProps.assetId, {
        // remove collectionId when https://github.com/NUWCDIVNPT/stig-manager/issues/259 is closed 
        collectionId: options.collectionId,
        stigs: taskAsset.assetProps.stigs
      })
      r.stigs = r.stigs.map( stig => stig.benchmarkId )
      logger.info({ component, message: `STIG assignments updated`, 
        asset: { assetId: r.assetId, name: r.name, stigs: r.stigs } })
    }

    // POST reviews
    let reviews = []
    for (const assetStigChecklists of taskAsset.checklists.values()) {
      // Since the parsed files were sorted by ascending date order, the last
      // item in each checklists array was parsed from the most recently dated checklist file and we will choose this item.
      const checklist = assetStigChecklists.slice(-1)[0]
      reviews = reviews.concat(checklist.reviews)
    }
    if (reviews.length > 0) {
      const r = await api.postReviews(options.collectionId, taskAsset.assetProps.assetId, reviews)
      logger.info({
        component, 
        message: `posted reviews`,
        asset: { name: taskAsset.assetProps.name, id: taskAsset.assetProps.assetId }, 
        rejected: r.rejected,
        affected: r.affected
      })
    }
    else {
      logger.warn({
        component, 
        message: `no reviews to post`,
        asset: { name: taskAsset.assetProps.name, id: taskAsset.assetProps.assetId }, 
      })

    }
    return true
  }  
  catch (error) {
    const errorObj = {
      component,
      message: error?.message,
    }
    if (error.request) {
      errorObj.request = {
        method: error.request.options?.method,
        url: error.request.requestUrl,
        body: getSymbol(error.request, 'body')
      }
    }
    if (error.response) {
      errorObj.response = {
        status: error.response.statusCode,
        body: error.response.body
      }
    }
    if (error.name !== 'RequestError' && error.name !== 'HTTPError') {
      errorObj.error = serializeError(error)
    }
    logger.error(errorObj)
    return false
  }
}

async function resultsHandler( parsedResults, cb ) {
  try {
    batchId++
    const isModeScan = options.mode === 'scan'
    logger.info({component, message: `batch started`, batchId, size: parsedResults.length})
    const apiAssets = await api.getCollectionAssets({collectionId: options.collectionId})
    logger.info({component, message: `asset data received`, batchId, size: apiAssets.length})
    const apiStigs = await api.getInstalledStigs()
    logger.info({component, message: `stig data received`, batchId, size: apiStigs.length})
    const tasks = new TaskObject ({ parsedResults, apiAssets, apiStigs, options })
    isModeScan && tasks.errors.length && addToHistory(tasks.errors.map(e => e.sourceRef))
    for ( const taskAsset of tasks.taskAssets.values() ) {
      if (!Alarm.isAlarmed()) {
        const success = await writer( taskAsset )
        isModeScan && success && addToHistory(taskAsset.sourceRefs)
      }
    }
    logger.info({component, message: 'batch ended', batchId})
    cb()
  }
  catch (e) {
    logger.error({component, message: 'batch ended', error: serializeError(e), batchId})
    cb( e, undefined)
  }
}

const cargoQueue = new Queue(resultsHandler, {
  id: 'file',
  batchSize: options.cargoSize,
  batchDelay: options.oneShot ? 0 : options.cargoDelay,
})
cargoQueue
.on('batch_failed', (err) => {
  logger.error( {
    component,
    message: err?.message,
  })
})
.on('batch_finish', (a, b, c) => {
  // console.log(`waiting ${cargoQueue._store._queue.length}`)
})
.on('drain', () => {
  if (options.oneShot) {
    logger.info({component, message: 'finished one shot mode'})
    process.exit()
  }
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
  cargoQueue.pause()
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
  cargoQueue.resume()
}


export { cargoQueue }
