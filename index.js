#!/usr/bin/env node
import { logger, getSymbol } from './lib/logger.js'
import { options, configValid }  from './lib/args.js'
import * as CONSTANTS from './lib/consts.js'
const minApiVersion = CONSTANTS.MIN_API_VERSION
const component = 'index'
let currentApiMode
if (!configValid) {
  logger.error({ component, message: 'invalid configuration... Exiting'})
  logger.end()
  process.exit(1)
}
import startFsEventWatcher from './lib/events.js'
import * as auth from './lib/auth.js'
import * as api from './lib/api.js'
import { serializeError } from 'serialize-error'
import { initScanner } from './lib/scan.js'
import semverGte from 'semver/functions/gte.js'
import Alarm from './lib/alarm.js'


process.on('SIGINT', () => {
  logger.info({
    component,
    message: 'received SIGINT, exiting'
  })
  process.exit(0)
})

Alarm.on('shutdown', (exitCode) => {
  logger.error({
    component,
    message: `received shutdown event with code ${exitCode}, exiting`
  })
  process.exit(exitCode)
})

Alarm.on('alarmRaised', (alarmType) => {
  logger.error({
    component,
    message: `Alarm raised: ${alarmType}`
  })
})

Alarm.on('alarmLowered', (alarmType) => {
  logger.info({
    component,
    message: `Alarm lowered: ${alarmType}`
  })
})

run()

async function run() {
  try {
    logger.info({
      component,
      message: 'running',
      pid: process.pid,
      options: getObfuscatedConfig(options)
    })
    setupAlarmHandlers()
    await preflightServices()
    if (options.mode === 'events') {
      startFsEventWatcher()
    }
    else if (options.mode === 'scan') {
      initScanner()
    }
  }
  catch (e) {
    logError(e)
    logger.end()
    process.exitCode = CONSTANTS.ERR_FAILINIT
  }
}

/**
 * Waits until the API returns to normal mode.
 * This function will not resolve until `alarmLowered` fires.
 */
async function apiNotNormalGate() {
  logger.warn({ component, message: 'stig manager api is not in normal mode. waiting for it to return to normal mode' })
  return new Promise((resolve) => {
    const onLowered = (alarmType) => {
      if (alarmType === 'apiNotNormal') {
        resolve()
      }
    }
    Alarm.on('alarmLowered', onLowered, { once: true})
  })
}

function setupAlarmHandlers() {

  const alarmHandlers = {
    apiOffline: api.offlineRetryHandler,
    authOffline: auth.offlineRetryHandler,
    noGrant: () => Alarm.shutdown(CONSTANTS.ERR_NOGRANT),
    noToken: () => Alarm.shutdown(CONSTANTS.ERR_NOTOKEN)
  }
  Alarm.on('alarmRaised', (alarmType) => {
    alarmHandlers[alarmType]?.()
  })
}

function logError(e) {
  const errorObj = {
    component: e.component || 'index',
    message: e.message,
  }
  if (e.request) {
    errorObj.request = {
      method: e.request.options?.method,
      url: e.request.requestUrl,
      body: getSymbol(e.request, 'body')
    }
  }
  if (e.response) {
    errorObj.response = {
      status: e.response.statusCode,
      body: e.response.body
    }
  }
  if (e.name !== 'RequestError' && e.name !== 'HTTPError') {
    errorObj.error = serializeError(e)
  }
  logger.error(errorObj)
}

async function hasMinApiVersion () {
  const [remoteApiVersion] = await api.getDefinition('$.info.version')
  logger.info({ component, message: `preflight API version`, minApiVersion, remoteApiVersion})
  if (semverGte(remoteApiVersion, minApiVersion)) {
    return true
  }
  else {
    throw new Error(`Remote API version ${remoteApiVersion} is not compatible with this release.`)
  }
}

async function hasSSEEndpoint() {
  try {
    const [sseEndpoint] = await api.getDefinition('$.paths./op/state/sse')
    return !!sseEndpoint
  }
  catch (e) {
    logger.warn({ component, message: 'failed to determine if api has sse endpoint. assuming it does not.', error: e })
    return false
  }
 
}

// count of EventSource reconnect attempts
let esRetryCount = 0
const esRetryLimit = 5

/**
 * Initializes the EventSource connection to the Stig Manager API server state event stream.
 * Listens for 'state-report' and 'mode-changed' events to monitor the API mode.
 * Raises or lowers the 'apiNotNormal' alarm based on the current mode.
 */
async function initEventSource() {
  const es = await api.getAPIEventStream()
  // Log when connection is established
  es.onopen = () => logger.debug({ component, message: 'connected to stig manager api server state event' })

  // Log and handle connection errors
  es.onerror = (e) => {
    logger.error({ component, message: 'failed to connect to stig manager api state server side event', error: e })
    esRetryCount++
      if (esRetryCount > esRetryLimit) {
        logger.error({ component, message: `stig manager api event stream reconnect retry limit reached (${esRetryLimit})` })
        Alarm.shutdown(CONSTANTS.ERR_APIOFFLINE)
      }
  }

  /**
   * Returns a Promise that resolves with the initial state payload received from a 'state-report' event.
   * 
   * The function listens for a single 'state-report' event from the EventSource `es`, parses the event data as JSON,
   * logs the initial state, updates the current mode, triggers an alarm if the mode is not 'normal', and then resolves
   * the Promise with the parsed payload.
   *
   */
  const getInitialState = new Promise((resolve) => {
    const onStart = (e) => {
      let payload
      try { 
        payload = JSON.parse(e.data)
      }
      catch (err) {
        logger.error({ component, message: 'failed to get stig manager api mode.', error: err })
        return
      }
      logger.info({ component, message: 'stig manager initial state report', state: payload })
      currentApiMode = payload?.mode?.currentMode
      Alarm.apiNotNormal(payload?.mode?.currentMode !== 'normal')
      resolve(payload)
    }
    es.addEventListener('state-report', onStart, { once: true })
  })
  
  // Handler for 'state-report' and 'mode-changed' events
  const handleStateEvent = (e) => {
    let payload 
    try {
      payload = JSON.parse(e.data)
    }
    catch (err) {
      logger.error({ component, message: 'failed to get stig manager api mode.', error: err })
      return
    }
    if(payload?.mode?.currentMode !== currentApiMode) {
      currentApiMode = payload?.mode?.currentMode
      logger.info({ component, message: 'stig manager mode changed', state: payload })
    }
    Alarm.apiNotNormal(payload?.mode?.currentMode !== 'normal')
  }
  // wait for the initial state before adding event listeners
  await getInitialState

  es.addEventListener('mode-changed', handleStateEvent)
}

async function preflightServices () {
  // need to do a check to see if we arent hitting an old api that doesnt support sse endpoint  
  if(await hasSSEEndpoint()) {
    // if we have the sse endpoint, init the event source to monitor api mode
    await initEventSource()
  }
  // block here until api is in normal mode (if applicable) so we continue with preflights 
  if (Alarm.isAlarmed()) {
    await apiNotNormalGate()
  }
  await hasMinApiVersion()
  await auth.getOpenIDConfiguration()
  await auth.getToken()
  logger.info({ component, message: `preflight token request succeeded`})
  const promises = [
    api.getCollection(options.collectionId),
    api.getInstalledStigs(),
    api.getScapBenchmarkMap()
  ]
  await Promise.all(promises)
  setInterval(refreshCollection, 10 * 60000)
  
  // OAuth scope 'stig-manager:user:read' was not required for early versions of Watcher
  // For now, fail gracefully if we are blocked from calling /user
  try {
    await api.getUser()
    setInterval(refreshUser, 10 * 60000)
  }
  catch (e) {
    logger.warn({ component, message: `preflight user request failed; token may be missing scope 'stig-manager:user:read'? Watcher will not set {"status": "accepted"}`})
    Alarm.noGrant(false)
  }
  logger.info({ component, message: `preflight api requests succeeded`})
}

function getObfuscatedConfig (options) {
  const securedConfig = {...options}
  if (securedConfig.clientSecret) {
    securedConfig.clientSecret = '[hidden]'
  }
  return securedConfig
}

async function refreshUser() {
  try {
    if (Alarm.isAlarmed()) return
    logger.info({
      component,
      message: 'refreshing user cache'
    })
    await api.getUser()
  }
  catch (e) {
    logError(e)
  }
}

async function refreshCollection() {
  try {
    if (Alarm.isAlarmed()) return
    logger.info({
      component,
      message: 'refreshing collection cache'
    })
    await api.getCollection(options.collectionId)
  }
  catch (e) {
    logError(e)
  }
}
