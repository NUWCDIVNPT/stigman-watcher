import got from 'got'
import { options } from './args.js'
import { getToken, tokens } from './auth.js'
import { logger, getSymbol } from './logger.js'
import Alarm from './alarm.js'
import * as CONSTANTS from './consts.js'

const cache = {
  collection: null,
  assets: null,
  user: null,
  definition: null,
  scapBenchmarkMap: null,
  stigs: null
}
export {cache}

/**
 * Sends requests to the STIG Manager API and returns the response
 * @async
 * @function apiRequest
 * @param {Object} options
 * @property {'GET'|'POST'|'PATCH'} [options.method='GET'] optional, HTTP method
 * @property {string} options.endpoint required, API endpoint
 * @property {Object=} options.json optional, object to be stringified into request body
 * @property {boolean} [options.authorize=true] optional, whether the request should be authorized with a JWT
 * @property {boolean} [options.fullResponse=false] optional, whether to return the response body or the got response object
 * @returns {Promise<Object>} the response body as a JS object or the got response object
 * @throws {Error} If there was an error making the request
 */
async function apiRequest({method = 'GET', endpoint, json, authorize = true, fullResponse = false}) {
  const requestOptions = {
    method,
    url: `${options.api}${endpoint}`,
    responseType: 'json',
    timeout: {
      response: options.responseTimeout
    }  
  }
  
  if (authorize) {
    try {
      await getToken()
    }
    catch (e) {
      e.component = 'api'
      logError(e)
      throw(e)
    }
    requestOptions.headers = {
      Authorization: `Bearer ${tokens.access_token}`
    }
  }

  if (json) requestOptions.json = json

  try {
    const response = await got(requestOptions)
    logResponse (response )
    return fullResponse ? response : response.body
  }
  catch (e) {
    // accept a client error for POST /assets if it reports a duplicate name
    if (e.response?.statusCode === 400 && e.response?.body?.message === 'Duplicate name') {
      logResponse(e.response)
      return fullResponse ? e?.response : e?.response?.body
    }
    e.component = 'api'
    logError(e)
    // grant problem
    if (e.response?.statusCode === 403) {
      Alarm.noGrant(true)
    }
    else {
      Alarm.apiOffline(true)
    }
    throw (e)
  }
}

export async function getScapBenchmarkMap() {
  const body = await apiRequest({endpoint: '/stigs/scap-maps'})
  cache.scapBenchmarkMap = new Map(body.map(apiScapMap => [apiScapMap.scapBenchmarkId, apiScapMap.benchmarkId]))
  return cache.scapBenchmarkMap
}

async function getDefinition(jsonPath) {
  cache.definition = await apiRequest({
    endpoint: `/op/definition${jsonPath ? '?jsonpath=' + encodeURIComponent(jsonPath) : ''}`,
    authorize: false
  }) 
  return cache.definition
}
export {getDefinition}

export async function getCollection(collectionId) {
  cache.collection = await apiRequest({endpoint: `/collections/${collectionId}`})
  return cache.collection
}

export async function getCollectionAssets(collectionId) {
  cache.assets = await apiRequest({endpoint: `/assets?collectionId=${collectionId}&projection=stigs`})
  return cache.assets
}

export async function getInstalledStigs() {
  cache.stigs = await apiRequest({endpoint: '/stigs'})
  return cache.stigs
}

export async function createOrGetAsset(asset) {
  const response = await apiRequest({
    method: 'POST',
    endpoint: '/assets?projection=stigs',
    json: asset,
    fullResponse: true
  })
  const created = response.statusCode === 201
  return { created, apiAsset: response.body }
}

export function patchAsset(assetId, assetProperties) {
  return apiRequest({
    method: 'PATCH',
    endpoint: `/assets/${assetId}?projection=stigs`,
    json: assetProperties
  })
}

export function postReviews(collectionId, assetId, reviews) {
  return apiRequest({
    method: 'POST',
    endpoint: `/collections/${collectionId}/reviews/${assetId}`,
    json: reviews
  })
}

export async function getUser() {
  cache.user = await apiRequest({endpoint: '/user'})
  return cache.user
}

export function canUserAccept() {
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
    message: e.message,
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

/**
 * interval between API connectivity tests when in alarm condition
 * @type {number} 
 */
const alarmRetryDelay = 5000
/**
 * max number of API connectivity tests when in alarm condition
 * @type {number}
 */
const alarmRetryLimit = 5

/**
 * count of API connectivity tests when in alarm condition
 * @type {number} 
 */
let alarmRetryCount = 0

/**
 * Handler for when 'apiOffline' alarm is raised.
 * Tests for API connectivity by calling the /op/defintion endpoint
 * and increments alarmRetryCount until reaching the alarmRetryLimit
 */
function offlineRetryHandler() {
  logger.info({
    component: 'api',
    message: 'Testing if API is online'
  })
  alarmRetryCount++
  getDefinition('$.info.version')
  .then(() => {
    alarmRetryCount = 0
    Alarm.apiOffline(false)
  })
  .catch(() => {
    if (alarmRetryCount >= alarmRetryLimit) {
      logger.info({
        component: 'api',
        message: 'API connectivity maximum tries reached, requesting shutdown'
      })
      Alarm.shutdown(CONSTANTS.ERR_APIOFFLINE)
    }
    else {
      setTimeout(offlineRetryHandler, alarmRetryDelay)
    }
  })
}
export {offlineRetryHandler}

