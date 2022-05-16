
const got = require('got')
const config = require('./args')
const auth = require('./auth')
const { logger, getSymbol } = require('./logger')
const { serializeError } = require('serialize-error')

const cache = {
  collection: null,
  assets: null,
  user: null,
  definition: null,
  scapBenchmarkMap: null,
  stigs: null
}

module.exports.cache = cache

async function apiGet(endpoint, authenticate = true) {
  try {
    const options = {
      responseType: 'json'
    }
    if (authenticate) {
      await auth.getToken()
      options.headers = {
        Authorization: `Bearer ${auth.tokens.access_token}`
      }
    }
    const response = await got.get(`${config.api}${endpoint}`, options)
    logResponse (response )
    return response.body
  }
  catch (e) {
    e.component = 'api'
    logError(e)
    throw (e)
  }
} 

module.exports.getScapBenchmarkMap = async function () {
  const response = await apiGet('/stigs/scap-maps')
  cache.scapBenchmarkMap = new Map(response.map(apiScapMap => [apiScapMap.scapBenchmarkId, apiScapMap.benchmarkId]))
  return cache.scapBenchmarkMap
}

module.exports.getDefinition = async function (jsonPath) {
  cache.definition = await apiGet(`/op/definition${jsonPath ? '?jsonpath=' + encodeURIComponent(jsonPath) : ''}`, false) 
  return cache.definition
}

module.exports.getCollection = async function (collectionId) {
  cache.collection = await apiGet(`/collections/${collectionId}`)
  return cache.collection
}

module.exports.getCollectionAssets = async function (collectionId) {
  cache.assets = await apiGet(`/assets?collectionId=${collectionId}&projection=stigs`)
  return cache.assets
}

module.exports.getInstalledStigs = async function () {
  cache.stigs = await apiGet('/stigs')
  return cache.stigs
}

module.exports.createOrGetAsset = async function (asset) {
  try {
    await auth.getToken()
    const response = await got.post(`${config.api}/assets?projection=stigs`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      json: asset,
      responseType: 'json'
    })
    logResponse(response)
    return { created: true, apiAsset: response.body }
  }
  catch (e) {
    if (e.response.statusCode === 400 && e.response.body.message === 'Duplicate name') {
      logResponse(e.response)
      return { created: false, apiAsset: e.response.body.data }
    }
    e.component = 'api'
    throw (e)
  }
}

module.exports.patchAsset = async function (assetId, body) {
  try {
    await auth.getToken()
    const response = await got.patch(`${config.api}/assets/${assetId}?projection=stigs`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      json: body,
      responseType: 'json'
    })
    logResponse(response)
    return response.body
  }
  catch (e) {
    e.component = 'api'
    throw (e)
  }
}

module.exports.postReviews = async function (collectionId, assetId, reviews) {
  try {
    await auth.getToken()
    const response = await got.post(`${config.api}/collections/${collectionId}/reviews/${assetId}`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      json: reviews,
      responseType: 'json'
    })
    logResponse(response)
    return response.body
  }
  catch (e) {
    e.component = 'api'
    throw (e)
  }
}

module.exports.getUser = async function () {
  cache.user = await apiGet('/user')
  return cache.user
}

module.exports.canUserAccept = function () {
  const curUser = cache.user
  const apiCollection = cache.collection
  const userGrant = curUser.collectionGrants.find( i => i.collection.collectionId === apiCollection.collectionId )?.accessLevel
  const allowAccept = apiCollection.settings.status.canAccept && (userGrant >= apiCollection.settings.status.minAcceptGrant)
  return allowAccept
}

function logResponse (response) {
  logger.http({
    component: 'api',
    message: 'query',
    request: {
      method: response.request.options?.method,
      url: response.request.requestUrl
    } ,
    response: {
      status: response.statusCode
    }
  })
  logger.debug({
    component: 'api',
    message: 'query bodies',
    request: {
      method: response.request.options?.method,
      url: response.request.requestUrl,
      body: getSymbol(response.request, 'body')
    },
    response: {
      status: response.statusCode,
      body: response.body
    }
  })
}

function logError (e) {
  logger.error({
    component: 'api',
    message: 'query error',
    request: {
      method: e.request?.options?.method,
      url: e.request?.requestUrl
    } ,
    response: {
      status: e.response?.statusCode,
      body: e.response?.body
    }
  })
}

