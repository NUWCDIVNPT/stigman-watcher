const chokidar = require('chokidar');
const fs = require('fs').promises
const config = require('./config')
const parsers = require('./parsers')
const auth = require('./auth')
const api = require('./api')

async function onFile (file) {
  try {
    console.log(`[WATCHER] ${file}: added or changed`)
    const apiAssets = await api.getCollectionAssets(config.collectionId)
    const apiInstalledStigs = await api.getInstalledStigs()

    const extension = file.substring(file.lastIndexOf(".") + 1)
    const data = await fs.readFile(file)
    let parseResult
    if (extension === 'ckl') {
      parseResult = parsers.reviewsFromCkl(data)
      console.log(`[WATCHER] ${file}: parsed as CKL.`)
    }
    else if (extension === 'xml') {
      parseResult = parsers.reviewsFromScc(data)
      console.log(`[WATCHER] ${file}: parsed as XCCDF.`)
    }
    else {
      console.log(`[WATCHER] ${file}: ignored unknown extension.`)
      return false
    }
    parseResult.file = file

    // Try to find this asset by name
    let apiAsset = apiAssets.find(apiAsset => apiAsset.name.toUpperCase() === parseResult.target.name.toUpperCase()) 
    // Bail if the asset does not exist and we aren't supposed to create it
    if (!apiAsset && !config.createApiObjects) {
        console.log (`[WATCHER] ${file}: ignoring ${parseResult.target.name}, which is not a member of collection ${collectionId}`)
        return
    }
    // Ignore checklists for STIG revisions that are not installed
    for (const checklist of parseResult.checklists) {
      if (!apiInstalledStigs.some( element => element.benchmarkId === checklist.benchmarkId && element.revisionStrs.includes(checklist.revisionStr))) {
        checklist.ignore = true 
        console.log (`[WATCHER] ${file}: ignoring ${checklist.benchmarkId} ${checklist.revisionStr}, which is not installed`)
      }
    }
    // Create the asset if necessary
    if (!apiAsset) {
      const assetProps = {
        collectionId: config.collectionId,
        name: parseResult.target.name,
        fqdn: parseResult.target.fqdn || '',
        description: `Created by ${config.clientId}`,
        ip: parseResult.target.ip || '',
        mac: parseResult.target.mac || '',
        noncomputing: parseResult.target.noncomputing || false,
        metadata: parseResult.target.metadata,
        stigs: parseResult.checklists.filter( checklist => !checklist.ignore ).map( checklist => checklist.benchmarkId )
      }
      apiAsset = await api.createAsset( assetProps )
      console.log(`[WATCHER] ${file}: created "${apiAsset.name}" as assetId ${apiAsset.assetId}`)
    }
    else {
      // Look for new STIG assignments on existing asset
      let stigAssignments = apiAsset.stigs.map ( stig => stig.benchmarkId)
      let originalLength = stigAssignments.length
      for (const checklist of parseResult.checklists) {
        if (!checklist.ignore && !stigAssignments.includes(checklist.benchmarkId)) {
          stigAssignments.push(checklist.benchmarkId)
        }
      }
      if (originalLength !== stigAssignments.length) {
        apiAsset = await api.patchAsset( {stigs: stigAssignments} )
        console.log(`[WATCHER] ${file}: updated STIG assignments for "${apiAsset.name}"`)

      }
    }
    // POST the parsed results
    if ( apiAsset ) {
      let reviews = []
      for (const checklist of parseResult.checklists) {
        if (!checklist.ignore) {
          reviews = reviews.concat(checklist.reviews)
        }
      }
      let result = await api.postReviews( config.collectionId, apiAsset.assetId, reviews)
      console.log(`[WATCHER] ${file}: posted reviews for "${apiAsset.name}"`)
    }
  }
  catch (err) {
      console.log(err)
  }
}

async function run() {
    try {
      const tokens = await auth.getTokens()
      tokens.access_token_parsed = auth.decodeToken(tokens.access_token)
      console.log(`[AUTH] Preflight succeeded: Got OIDC token`)
      const assets = await api.getCollectionAssets(config.collectionId)
      console.log(`[API] Preflight succeeded: Got Assets in Collection ${config.collectionId}`)
      const stigs = await api.getInstalledStigs()
      console.log(`[API] Preflight succeeded: Got installed STIGs`)

      const watcher = chokidar.watch(config.watchDir, {
        ignored: /(^|[\/\\])\../,
        ignoreInitial: !config.addExisting,
        persistent: true
      })

      watcher
        .on('add', path => onFile(path))
        .on('change', path => onFile(path))

      console.log(`[WATCHER] Watching ${config.watchDir}`)
    }
    catch (error) {
      console.log(error.message)
    }
  }

run()

