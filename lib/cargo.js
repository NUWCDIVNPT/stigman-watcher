const config = require ('./args')
const {logger}  = require('./logger')
const api = require('./api')
const fs = require('fs').promises
const chalk = require('chalk')
class TaskObject {
  constructor ( { apiAssets = [], apiStigs = [], parsedResults = [] } ) {
    // An array of results from the parsers
    this.parsedResults = parsedResults

    // A Map() of the collection's current assets returned by the API
    // key: asset lc name, value: asset object from API
    this.contextAssets = new Map()
    for ( const apiAsset of apiAssets ) {
      // Update .stigs to an array of benchmarkId strings
      apiAsset.stigs = apiAsset.stigs.map( stig => stig.benchmarkId )
      this.contextAssets.set( apiAsset.name.toLowerCase(), apiAsset )
    }
    // A Map() of the installed benchmarkIds return by the API
    // key: benchmarkId, value: array of revisionStr
    this.contextStigs = new Map()
    for ( const apiStig of apiStigs ) {
      this.contextStigs.set( apiStig.benchmarkId, apiStig.revisionStrs )
    }

    // An array of accumulated errors
    this.errors = []

    // A Map() of assets to be processed by the writer
    this.targets = this._createTargets()
  }

  _createTargets () {
    // targets is a Map() keyed by assetNameLower, the values are
    // {
    //   newAsset: false, // does the asset need to be created?
    //   assetProps: parseResult.target, // asset properties from the parsed results
    //   hasNewBenchmarkIds: false, //  are there new STIG assignments?
    //   stigsIgnored: [], // benchmarkIds ignored because no updates allowed
    //   reviews: [] // the reviews to be posted
    // }

    const targets = new Map()
    for (const parsedResult of this.parsedResults) {
      // Use lowercase asset name for keys
      let assetNameLower = parsedResult.target.name.toLowerCase()

      // Find the asset in the Map() of collection assets from the API
      const contextAsset = this.contextAssets.get( assetNameLower )
      if (! contextAsset && ! config.createObjects) {
        // Bail if the asset doesn't exist and we won't create it
        this.errors.push({
          file: parsedResult.file,
          message: `Asset "${parsedResult.target.name}" does not exist`
        })
        logger.warn({
          component: 'taskobject',
          message: 'asset ignored',
          file: parsedResult.file,
          assetName: parsedResult.target.name,
          reason: 'asset does not exist and options.createObjects == false'
        })
        continue
      }

      // Try to find the asset in our Map()
      let taskAsset = targets.get( assetNameLower )

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
        if ( !contextAsset ) {
          // The asset does not exist in contextAssets. Set assetProps from this parseResult.
          taskAsset.assetProps = { ...parsedResult.target, collectionId: config.collectionId, stigs: [] }
        }
        else {
          // The asset exists in contextAssets. Set assetProps from the contextAsset.
          taskAsset.knownAsset = true
          taskAsset.assetProps = contextAsset
        }
        // Insert the asset into targets
        targets.set( assetNameLower, taskAsset )
      }

      // Helper functions
      const stigIsInstalled = ( { benchmarkId, revisionStr } ) => {
        const revisionStrs = this.contextStigs.get( benchmarkId )
        if ( revisionStrs ) {
          return revisionStrs.includes( revisionStr )
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
    return targets
  }
}

async function writer ( target ) {
  const component = 'writer'
  try {
    logger.debug({ 
      component: component,
      message: `${target.assetProps.name} started`
    })

      // Create new asset if necessary
    if ( !target.knownAsset ) {
      const r = await api.createOrGetAsset( target.assetProps )
      // GET projection=stigs is an object, we just need the becnhmarkIds
      r.apiAsset.stigs = r.apiAsset.stigs.map ( stig => stig.benchmarkId )
      logger.info({ component: component, message: `Asset ${r.created ? 'created' : 'found'}`, asset: r.apiAsset })
      // TODO: If created === false, then STIG assignments should be vetted again
      target.assetProps = r.apiAsset
    }

    // Assign new STIGs, if necessary
    if ( target.knownAsset && target.hasNewAssignment ) {
      const r = await api.patchAsset( target.assetProps.assetId, { 
        collectionId: config.collectionId,
        stigs: target.assetProps.stigs 
      } )
      r.stigs = r.stigs.map( stig => stig.benchmarkId )
      logger.info({ component: component, message: `STIG assignments updated`, asset: r })
    }

    // POST reviews
    let reviews = []
    for (const checklist of target.checklists) {
      reviews = reviews.concat(checklist.reviews)
    }
    if (reviews.length > 0) {
      const r = await api.postReviews(config.collectionId, target.assetProps.assetId, reviews)
      logger.info({
        component: component, 
        message: `Posted reviews`,
        asset: { name: target.assetProps.name, id: target.assetProps.assetId }, 
        permitted: r.permitted.length,
        rejected: r.rejected.length,
        errors: r.errors.length
      })
    }
    else {
      logger.warn({
        component: component, 
        message: `no reviews to post`,
        asset: { name: target.assetProps.name, id: target.assetProps.assetId }, 
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
        url: error.request.requestUrl
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

module.exports.cklsHandler = async function ( parsedResults, cb ) {
  const component = 'batch'
  try {
    logger.info({
      component: component,
      message: `Started batch with ${parsedResults.length} parsed results`
    })
    const apiAssets = await api.getCollectionAssets(config.collectionId)
    const apiStigs = await api.getInstalledStigs()
    const taskObject = new TaskObject ({ parsedResults, apiAssets, apiStigs })
    for ( const target of taskObject.targets.values() ) {
      await writer( target )
    }
    logger.info({
      component: component,
      message: `Finished batch with ${parsedResults.length} parsed results`
    })
  }
  catch (e) {
    cb( e, undefined)
  }
  finally {
    cb(null, `[${component}] finished`)
  }
}
