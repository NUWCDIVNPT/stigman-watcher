
const got = require('got')
const config = require('../config')
const auth = require('./auth')

module.exports.getCollectionAssets = async function ( collectionId ) {
  try {
    await auth.getTokens()
    const response = await got.get(`${config.apiBase}/assets?collectionId=${collectionId}&projection=stigs`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      responseType: 'json'
    })
    return response.body
  } 
  catch (e) {
      e.component = '[API]'
      throw(e)
  }
}

module.exports.getInstalledStigs = async function () {
  try {
    await auth.getTokens()
    const response = await got.get(`${config.apiBase}/stigs`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      responseType: 'json'
    })
    return response.body
  } 
  catch (e) {
    e.component = '[API]'
    throw(e)
  }
}

module.exports.createOrGetAsset = async function ( asset ) {
  try {
    await auth.getTokens()
    const response = await got.post(`${config.apiBase}/assets?projection=stigs`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      json: asset,
      responseType: 'json'
    })
    return {created: true, apiAsset: response.body}
  } 
  catch (e) {
    if (e.response.statusCode === 400 && e.response.body.message === 'Duplicate name') {
      return {created: false, apiAsset: e.response.body.data}
    }
    e.component = '[API]'
    throw(e)
  }
}

module.exports.patchAsset = async function ( assetId, body ) {
  try {
    await auth.getTokens()
    const response = await got.patch(`${config.apiBase}/assets/${assetId}?projection=stigs`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      json: body,
      responseType: 'json'
    })
    return response.body
  } 
  catch (e) {
    e.component = '[API]'
    throw(e)
  }
}

module.exports.postReviews = async function ( collectionId, assetId, reviews ) {
  try {
    await auth.getTokens()
    const response = await got.post(`${config.apiBase}/collections/${collectionId}/reviews/${assetId}`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      json: reviews,
      responseType: 'json'
    })
    return response.body
  } 
  catch (e) {
    e.component = '[API]'
    throw(e)
  }
}
