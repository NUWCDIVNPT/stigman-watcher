#!/usr/bin/env node

const minApiVersion = '1.0.43'

const { logger, getSymbol } = require('./lib/logger')
const config = require('./lib/args')
if (!config) {
  logger.end()
  return
}
const auth = require('./lib/auth')
const api = require('./lib/api')
const {serializeError} = require('serialize-error')

run()

async function run() {
  try {
    logger.info({
      component: 'main',
      message: 'running',
      config: getObfuscatedConfig(config)
    })
    // await logger.end()
    // process.exit()
    
    await preflightServices()
    if (config.mode === 'events') {
      const watcher = require('./lib/events')
      watcher.startFsEventWatcher()
    }
    else if (config.mode === 'scan') {
      const scanner = require('./lib/scan')
      scanner.startScanner()
    }
  }
  catch (e) {
    const errorObj = {
      component: e.component || 'main',
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
    await logger.end()
  }
}

async function hasMinApiVersion () {
  const semverGte = require('semver/functions/gte')
  const [remoteApiVersion] = await api.getDefinition('$.info.version')
  logger.info({ component: 'main', message: `preflight API version`, minApiVersion, remoteApiVersion})
  if (semverGte(remoteApiVersion, minApiVersion)) {
    return true
  }
  else {
    throw( {message:'Remote API version is not compatible with this release.'} )
  }
}

async function preflightServices () {
  await hasMinApiVersion()
  await auth.getToken()
  logger.info({ component: 'main', message: `preflight token request suceeded`})
  await api.getCollectionAssets(config.collectionId)
  await api.getInstalledStigs()
  logger.info({ component: 'main', message: `prefilght api requests suceeded`})
}

function getObfuscatedConfig (config) {
  const securedConfig = {...config}
  if (securedConfig.clientSecret) {
    securedConfig.clientSecret = '[hidden]'
  }
  return securedConfig
}
