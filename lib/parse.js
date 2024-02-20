import { cache } from './api.js'
import { XMLParser } from 'fast-xml-parser'
import Queue from 'better-queue'
import { logger } from './logger.js'
import { cargoQueue } from './cargo.js'
import { promises as fs } from 'fs'
import he from 'he'
import { reviewsFromCkl, reviewsFromScc, reviewsFromCklb } from 'stig-manager-client-modules'
import { addToHistory } from './scan.js'
import { options } from './args.js'

const valueProcessor = function (tagName, tagValue, jPath, hasAttributes, isLeafNode) {
  he.decode(tagValue)
}

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
  const component = 'parser'
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
    logger.verbose({component: component, message: `readFile succeeded`, file: file})

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
      valueProcessor,
      XMLParser,
      scapBenchmarkMap,
      sourceRef: file
    })
    logger.debug({component: component, message: `parse results`, results: parseResult})
    
    cargoQueue.push( parseResult )
    
    const checklistInfo = []
    for (const checklist of parseResult.checklists) {
      checklistInfo.push({ 
        benchmarkId: checklist.benchmarkId, 
        stats: checklist.stats
      })
    }
    logger.verbose({component: component, message: `results queued`, file: parseResult.sourceRef, 
      target: parseResult.target.name, checklists: checklistInfo })
    cb(null, parseResult)
  }
  catch (e) {
    logger.warn({component: component, message: e.message, file: file})
    options.mode === 'scan' && addToHistory(file)
    cb(e, null)
  }
}

export const queue = new Queue (parseFileAndEnqueue, {
  concurrent: 8
})




  