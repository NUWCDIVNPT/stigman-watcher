
const got = require('got')
const config = require('./config')
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
  } catch (e) {
      throw(e.response.body)
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
  } catch (e) {
      throw(e.response.body)
  }
}

module.exports.createAsset = async function ( asset ) {
  try {
    await auth.getTokens()
    const response = await got.post(`${config.apiBase}/assets`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      json: asset,
      responseType: 'json'
    })
    return response.body
  } catch (e) {
      throw(e.response.body)
  }
}

module.exports.patchAsset = async function ( asset ) {
  try {
    await auth.getTokens()
    const response = await got.patch(`${config.apiBase}/assets`, {
      headers: {
        Authorization: `Bearer ${auth.tokens.access_token}`
      },
      json: asset,
      responseType: 'json'
    })
    return response.body
  } catch (e) {
      throw(e.response.body)
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
  } catch (e) {
      throw(e.response.body)
  }
}
