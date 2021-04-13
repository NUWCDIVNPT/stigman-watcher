
const got = require('got')
const config = require('./args')
const auth = require('./auth')
const {logger} = require('./logger')

module.exports.getCollectionAssets = async function (collectionId) {
  let response
  try {
    await auth.getToken()
    response = await got.get(`${config.api}/assets?collectionId=${collectionId}&projection=stigs`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      responseType: 'json'
    })
    logResponse (response )
    return response.body
  }
  catch (e) {
    e.component = 'api'
    e.message = 'api query failed'
    throw (e)
  }
}

module.exports.getInstalledStigs = async function () {
  try {
    await auth.getToken()
    const response = await got.get(`${config.api}/stigs`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      responseType: 'json'
    })
    // logResponse(response)
    return response.body
  }
  catch (e) {
    e.component = e.component ?? 'api'
    e.message = 'api query failed'
    throw (e)
  }
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
      return { created: false, apiAsset: e.response.body.data }
    }
    e.component = 'api'
    e.message = 'api query failed'
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
    e.message = 'api query failed'
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
    e.message = 'api query failed'
    throw (e)
  }
}

function logResponse (response) {
  logger.http({
    component: 'api',
    message: 'api query',
    request: {
      method: response.request.options?.method,
      url: response.request.requestUrl
    } ,
    response: {
      status: response.statusCode,
      body: response.body
    }
  })    
}
