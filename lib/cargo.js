const config = require ('../config')
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
      if (! contextAsset && ! config.createApiObjects) {
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
          else if ( config.createApiObjects ) {
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
  const component = 'WRITER'
  try {
    console.log(`[${component}] ${target.assetProps.name} started`)
      // Create new asset if necessary
    if ( !target.knownAsset ) {
      const r = await api.createOrGetAsset( target.assetProps )
      // GET projection=stigs is an object, we just need the becnhmarkIds
      r.apiAsset.stigs = r.apiAsset.stigs.map ( stig => stig.benchmarkId )
      console.log(chalk.green(`[${component}] ${target.assetProps.name} ${r.created ? 'created as' : 'found as '} ${JSON.stringify(r.apiAsset)}` ))
      // If created === false, then STIG assignments should be vetted again
      target.assetProps = r.apiAsset
    }

    // Assign new STIGs, if necessary
    if ( target.knownAsset && target.hasNewAssignment ) {
      const r = await api.patchAsset( target.assetProps.assetId, { 
        collectionId: config.collectionId,
        stigs: target.assetProps.stigs 
      } )
      const stigs = r.stigs.map( stig => stig.benchmarkId )
      console.log(chalk.green(`[${component}] ${r.name} (id ${r.assetId}): STIG assignments updated to ${JSON.stringify(stigs)}`))
    }

    // Report ignored checklists
    for ( const ignored of target.checklistsIgnored ) {
      console.log(`[${component}] ${target.assetProps.name} (id ${target.assetProps.assetId}): ignored ${ignored.benchmarkId} ${ignored.ignored}`)
    }

    // POST reviews
    let reviews = []
    for (const checklist of target.checklists) {
      reviews = reviews.concat(checklist.reviews)
    }
    if (reviews.length > 0) {
      const r = await api.postReviews(config.collectionId, target.assetProps.assetId, reviews)
      console.log(chalk.green(`[${component}] ${target.assetProps.name} (id ${target.assetProps.assetId}): posted reviews, permitted: ${r.permitted.length}, rejected: ${r.rejected.length}, errors: ${r.errors.length}`))
    }
    console.log(`[${component}] ${target.assetProps.name} finished`)
  }  
  catch (e) {
    console.log(chalk.red(`[${component}] ${target.assetProps.name} error ${e}`))
  }
}

module.exports.cklsHandler = async function ( parsedResults, cb ) {
  const component = 'BATCH-CKL'
  try {
    console.log( `[${component}] started with ${parsedResults.length} parsed results` )
    const apiAssets = await api.getCollectionAssets(config.collectionId)
    const apiStigs = await api.getInstalledStigs()
    const taskObject = new TaskObject ({ parsedResults, apiAssets, apiStigs })
    for ( const target of taskObject.targets.values() ) {
      await writer( target )
    }
    console.log( `[${component}] finished` ) 
  }
  catch (e) {
    cb( e, undefined)
  }
  finally {
    cb(null, `[${component}] finished`)
  }
}
