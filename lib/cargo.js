const config = require ('./args')
const {logger}  = require('./logger')
const api = require('./api')
const fs = require('fs').promises
const chalk = require('chalk')
class TaskObject {
  constructor ( { apiAssets = [], apiStigs = [], parsedResults = [] } ) {
    this.parsedResults = parsedResults
    this.contextAssets = new Map()
    for ( const asset of apiAssets ) {
      asset.stigs = asset.stigs.map( stig => stig.benchmarkId )
      this.contextAssets.set( asset.name.toLowerCase(), asset )
    }
    this.contextStigs = new Map()
    for ( const stig of apiStigs ) {
      this.contextStigs.set( stig.benchmarkId, stig.revisionStrs )
    }
    this.errors = []
    this._createTargets()
  }

  _createTargets () {
    // targets keyed by assetNameLower, value is
    // {
    //   newAsset: false,
    //   assetProps: parseResult.target,
    //   hasNewBenchmarkIds: false,
    //   stigsIgnored: [],
    //   reviews: []
    // }

    const targets = new Map()
    for (const parsedResult of this.parsedResults) {
      // Use lowercase asset name for keys
      let assetNameLower = parsedResult.target.name.toLowerCase()

      // Bail if the asset doesn't exist and we won't create it
      const contextAsset = this.contextAssets.get( assetNameLower )
      if (! contextAsset && ! config.createObjects) {
        this.errors.push({
          file: parsedResult.file,
          message: `Asset "${parsedResult.target.name}" does not exist`
        })
        continue
      }

      let taskAsset = targets.get( assetNameLower )
      if ( ! taskAsset ) {
        // This is our first encounter with this assetName
        taskAsset = {
          knownAsset: false,
          assetProps: null,
          hasNewAssignment: false,
          checklists: [],
          checklistsIgnored: [],
          reviews: []
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
        targets.set( assetNameLower, taskAsset)
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
            // Checklist for assigned STIG always gets added
            taskAsset.checklists.push( checklist )
          }
          else if ( config.createObjects ) {
            assignStig( checklist.benchmarkId )
            taskAsset.checklists.push( checklist )
          }
          else {
            checklist.ignored = `STIG is not assigned`
            taskAsset.checklistsIgnored.push( checklist )
          }
        }
        else {
          // Ignore checklists of STIG revisions that are not installed
          checklist.ignored = `STIG is not installed`
          taskAsset.checklistsIgnored.push( checklist )
        }
      }
    }
    this.targets = targets
  }
}

async function writer ( target ) {
  const component = 'writer'
  try {
    logger.info({ component: component, message: `${target.assetProps.name} started` })

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

    // Report ignored checklists
    for ( const ignored of target.checklistsIgnored ) {
      logger.info({ 
        component: component, 
        message: `STIG ignored`, 
        asset: { name: target.assetProps.name, id: target.assetProps.assetId }, 
        benchmarkId: ignored.benchmarkId, 
        reason: ignored.ignored
      })
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
  }  
  catch (e) {
    const errorObj = {
      component: e.component ?? component,
      message: error.message,
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
    if (e.name !== 'RequestError' && e.name !== 'HTTPError') {
      errorObj.error = serializeError(e)
    }
    logger.error(errorObj)
  }
}

module.exports.cklsHandler = async function ( parsedResults, cb ) {
  const component = 'batch-ckl'
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
