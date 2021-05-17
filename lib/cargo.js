const config = require ('./args')
const { logger, getSymbol }  = require('./logger')
const Queue = require('better-queue')
const api = require('./api')
const { serializeError } = require('serialize-error')

const component = 'cargo'
let batchId = 0

class TaskObject {
  constructor ( { apiAssets = [], apiStigs = [], parsedResults = [] } ) {
    // An array of results from the parsers
    this.parsedResults = parsedResults

    // An array of assets from the API
    this.apiAssets = apiAssets
    // Create Maps of the assets by assetName and metadata.cklHostName
    this.mappedAssetNames = new Map()
    this.mappedCklHostnames = new Map()
    for ( const apiAsset of apiAssets ) {
      // Update .stigs to an array of benchmarkId strings
      apiAsset.stigs = apiAsset.stigs.map( stig => stig.benchmarkId )
      this.mappedAssetNames.set( apiAsset.name.toLowerCase(), apiAsset )
      if (apiAsset.metadata?.cklHostName) {
        const v = this.mappedCklHostnames.get(apiAsset.metadata.cklHostName.toLowerCase())
        if (v) {
          v.push(apiAsset)
        }
        else {
          this.mappedCklHostnames.set(apiAsset.metadata.cklHostName.toLowerCase(), [apiAsset])
        }
      }
    }

    // A Map() of the installed benchmarkIds return by the API
    // key: benchmarkId, value: array of revisionStr
    this.mappedStigs = new Map()
    for ( const apiStig of apiStigs ) {
      this.mappedStigs.set( apiStig.benchmarkId, apiStig.revisionStrs )
    }

    // An array of accumulated errors
    this.errors = []

    // A Map() of assets to be processed by the writer
    this.taskAssets = this._createTaskAssets()
  }

  _findAssetFromParsedTarget( target ) {
    if (!target.metadata.cklHostName) {
      return this.mappedAssetNames.get(target.name.toLowerCase())
    }
    const matchedByCklHostname = this.mappedCklHostnames.get(target.metadata.cklHostName.toLowerCase())
    if (!matchedByCklHostname) return null
    const matchedByAllCklMetadata = matchedByCklHostname.find( 
      asset => asset.metadata.cklWebDbInstance === target.metadata.cklWebDbInstance
      && asset.metadata.cklWebDbSite === target.metadata.cklWebDbSite)
    if (!matchedByAllCklMetadata) return null
    return matchedByAllCklMetadata
  }

  _createTaskAssets() {
    // taskAssets is a Map() keyed by mapKey, the values are
    // {
    //   newAsset: false, // does the asset need to be created?
    //   assetProps: parseResult.target, // asset properties from the parsed results
    //   hasNewBenchmarkIds: false, //  are there new STIG assignments?
    //   stigsIgnored: [], // benchmarkIds ignored because no updates allowed
    //   reviews: [] // the reviews to be posted
    // }

    const taskAssets = new Map()
    for (const parsedResult of this.parsedResults) {
      // Generate mapping key
      let mapKey, tMeta = parsedResult.target.metadata
      if (!tMeta.cklHostName) {
        mapKey = parsedResult.target.name.toLowerCase()
      }
      else {
        const appends = [tMeta.cklHostName]
        appends.push(tMeta.cklWebDbSite ?? 'NA')
        appends.push(tMeta.cklWebDbInstance ?? 'NA')
        mapKey = appends.join('-')
      }
      
      // Try to find the asset in the API response
      const apiAsset = this._findAssetFromParsedTarget( parsedResult.target )
      if (! apiAsset && ! config.createObjects) {
        // Bail if the asset doesn't exist and we won't create it
        this.errors.push({
          file: parsedResult.file,
          message: `asset does not exist for target`,
          target: parsedResult.target
        })
        logger.warn({
          component: 'taskbuilder',
          message: 'target ignored',
          reason: 'asset does not exist for target and options.createObjects == false',
          file: parsedResult.file,
          target: parsedResult.target
        })
        continue
      }
      // Try to find the target in our Map()
      let taskAsset = taskAssets.get( mapKey )

      if ( !taskAsset ) {
        // This is our first encounter with this assetName, initialize Map() value
        taskAsset = {
          knownAsset: false,
          assetProps: null, // an object suitable for put/post to the API 
          hasNewAssignment: false,
          checklists: [], // the vetted result checklists
          checklistsIgnored: [], // the ignored checklists
          reviews: [] // the vetted reviews
        }  
        if ( !apiAsset ) {
          // The asset does not exist in the API. Set assetProps from this parseResult.
          if (!tMeta.cklHostName) {
            taskAsset.assetProps = { ...parsedResult.target, collectionId: config.collectionId, stigs: [] }
          }
          else {
            taskAsset.assetProps = { ...parsedResult.target, name: mapKey, collectionId: config.collectionId, stigs: [] }
          }
        }
        else {
          // The asset exists in the API. Set assetProps from the apiAsset.
          taskAsset.knownAsset = true
          taskAsset.assetProps = apiAsset
        }
        // Insert the asset into taskAssets
        taskAssets.set( mapKey, taskAsset )
      }

      // Helper functions
      const stigIsInstalled = ( { benchmarkId, revisionStr } ) => {
        const revisionStrs = this.mappedStigs.get( benchmarkId )
        if ( revisionStrs ) {
          return revisionStr && config.strictRevisionCheck ? revisionStrs.includes( revisionStr ) : true
        }
        else {
          return false
        }
      }
      const stigIsAssigned = ( { benchmarkId } ) => {
       return taskAsset.assetProps.stigs.includes( benchmarkId )
      }
      const assignStig = ( benchmarkId ) => {
        if (!stigIsAssigned( benchmarkId )) {
          taskAsset.hasNewAssignment = true
          taskAsset.assetProps.stigs.push( benchmarkId )
        }
      }

      // Vet the checklists in this parseResult 
      for (const checklist of parsedResult.checklists) {
        checklist.file = parsedResult.file
        if ( stigIsInstalled( checklist ) ) {
          if ( stigIsAssigned( checklist ) ) {
            taskAsset.checklists.push( checklist )
            logger.debug({
              component: 'taskobject',
              message: 'checklist included',
              file: parsedResult.file,
              assetName: parsedResult.target.name,
              benchmarkId: checklist.benchmarkId,
            })       
          }
          else if ( config.createObjects ) {
            assignStig( checklist.benchmarkId )
            taskAsset.checklists.push( checklist )
            logger.debug({
              component: 'taskobject',
              message: 'checklist assigned and included',
              file: parsedResult.file,
              assetName: parsedResult.target.name,
              benchmarkId: checklist.benchmarkId,
            })       

          }
          else {
            checklist.ignored = `STIG is not assigned`
            taskAsset.checklistsIgnored.push( checklist )
            logger.warn({
              component: 'taskobject',
              message: 'checklist ignored',
              file: parsedResult.file,
              assetName: parsedResult.target.name,
              benchmarkId: checklist.benchmarkId,
              reason: 'stig is not assigned'
            })       
          }
        }
        else {
          checklist.ignored = `STIG is not installed`
          taskAsset.checklistsIgnored.push( checklist )
          logger.warn({
            component: 'taskobject',
            message: 'checklist ignored',
            file: parsedResult.file,
            assetName: parsedResult.target.name,
            benchmarkId: checklist.benchmarkId,
            reason: 'stig is not installed'
          })

        }
      }

    }
    return taskAssets
  }
}

async function writer ( taskAsset ) {
  const component = 'writer'
  try {
    logger.debug({ 
      component: component,
      message: `${taskAsset.assetProps.name} started`
    })

    // Create new asset if necessary
    if ( !taskAsset.knownAsset ) {
      const r = await api.createOrGetAsset( taskAsset.assetProps )
      // GET projection=stigs is an object, we just need the benchmarkIds
      r.apiAsset.stigs = r.apiAsset.stigs.map ( stig => stig.benchmarkId )
      logger.info({ component: component, message: `asset ${r.created ? 'created' : 'found'}`, asset: r.apiAsset })
      // TODO: If created === false, then STIG assignments should be vetted again
      taskAsset.assetProps = r.apiAsset
    }

    // Assign new STIGs, if necessary
    if ( taskAsset.knownAsset && taskAsset.hasNewAssignment ) {
      const r = await api.patchAsset(taskAsset.assetProps.assetId, {
        // remove collectionId when https://github.com/NUWCDIVNPT/stig-manager/issues/259 is closed 
        collectionId: config.collectionId,
        stigs: taskAsset.assetProps.stigs
      })
      r.stigs = r.stigs.map( stig => stig.benchmarkId )
      logger.info({ component: component, message: `STIG assignments updated`, 
      asset: { assetId: r.assetId, name: r.name, stigs: r.stigs } })
    }

    // POST reviews
    let reviews = []
    for (const checklist of taskAsset.checklists) {
      reviews = reviews.concat(checklist.reviews)
    }
    if (reviews.length > 0) {
      const r = await api.postReviews(config.collectionId, taskAsset.assetProps.assetId, reviews)
      logger.info({
        component: component, 
        message: `posted reviews`,
        asset: { name: taskAsset.assetProps.name, id: taskAsset.assetProps.assetId }, 
        permitted: r.permitted.length,
        rejected: r.rejected.length,
        errors: r.errors.length
      })
    }
    else {
      logger.warn({
        component: component, 
        message: `no reviews to post`,
        asset: { name: taskAsset.assetProps.name, id: taskAsset.assetProps.assetId }, 
      })

    }
  }  
  catch (error) {
    const errorObj = {
      component: error.component ?? component,
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
  }
}

async function resultsHandler( parsedResults, cb ) {
  const component = 'batch'
  try {
    batchId++
    logger.info({component: component, message: `batch started`, batchId: batchId, size: parsedResults.length})
    const apiAssets = await api.getCollectionAssets(config.collectionId)
    const apiStigs = await api.getInstalledStigs()
    const tasks = new TaskObject ({ parsedResults, apiAssets, apiStigs })
    for ( const taskAsset of tasks.taskAssets.values() ) {
      await writer( taskAsset )
    }
    logger.info({component: component, message: 'batch ended', batchId: batchId})
    cb()
  }
  catch (e) {
    logger.error({component: component, message: e.message, error: serializeError(e)})
    cb( e, undefined)
  }
}

const cargoQueue = new Queue(resultsHandler, {
  id: 'file',
  batchSize: config.cargoSize,
  batchDelay: config.oneShot ? 0 : config.cargoDelay,
  // batchDelayTimeout: config.cargoDelay
})
cargoQueue
.on('batch_failed', (err) => {
  logger.error( {
    component: 'cargo',
    message: err?.message,
  })
})
.on('batch_finish', (a, b, c) => {
  // console.log(`waiting ${cargoQueue._store._queue.length}`)
})
.on('drain', () => {
  if (config.oneShot) {
    logger.info({component: 'cargo', message: 'finished one shot mode'})
    process.exit()
  }
})

module.exports.queue = cargoQueue
