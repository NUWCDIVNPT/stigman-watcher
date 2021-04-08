const logger  = require('./logger')
const got = require('got')
const atob = require('atob')
const config = require('../config')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const crypto = require('crypto')
const {serializeError} = require('serialize-error') 

let self = this
self.url = `${config.authority}/protocol/openid-connect/token`
self.threshold = 10

if (config.clientKey) {
  try {
    self.key = fs.readFileSync(config.clientKey)
  }
  catch (e) {
    log( 'error', {
      component: 'auth',
      message: `Error reading clientKey`,
      file: config.clientKey,
      error: serializeError(e)
    })
    process.exit(1)
  }
}
self.scope = 'openid stig-manager:collection stig-manager:stig:read'

const authenticateClientSecret = async () => {
  try {
    const response = await got.post( self.url, {
      form: {
        grant_type: 'client_credentials'
      },
      username: config.clientId,
      password: config.secret,
      scope: self.scope,
      responseType: 'json'
    })
    return response.body  
  }
  finally {}
}
const authenticateSignedJwt = async () => {
  // IAW RFC 7523
  try {
    const jti = crypto.randomBytes(16).toString('hex')
    const payload = {
        "aud": config.authority,
        "iss": config.clientId,
        "sub": config.clientId,
        "jti": jti
    }
    let key
    if (config.clientKeyPassphrase) {
      key = {
        key: self.key,
        passphrase: config.clientKeyPassphrase
      }
    }
    else {
      key = self.key
    }
    let signedJwt = jwt.sign(payload, key, {
        algorithm: 'RS256',
        expiresIn: 60,
    })

    const response = await got.post( self.url, {
      form: {
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: signedJwt,
        scope: self.scope
      },
      responseType: 'json'
    })
    return response.body
  }
  finally {}

}
const authenticateClient = config.clientKey ? authenticateSignedJwt : authenticateClientSecret
self.authentication = config.clientKey ? 'signed-jwt' : 'client-secret'

module.exports.getToken = async function getToken( log = false ) {
  try {
    if (self.tokenDecoded) {
      let expiresIn = self.tokenDecoded.exp - Math.ceil(new Date().getTime() / 1000)
      expiresIn -= self.threshold
      if (expiresIn > self.threshold) {
        return self.tokenDecoded
      }
    }
    if (log) {
      logger('info', { component: 'auth', message: `OIDC token request`, request: { clientId: config.clientId, authentication: self.authentication, method: 'POST', url: self.url} })
    }
    self.tokens = await authenticateClient()
    self.tokenDecoded = self.decodeToken(self.tokens.access_token)
    if (log) {
      logger('success', { component: 'auth', message: `OIDC token response`, payload: self.tokenDecoded })
    }
    return self.tokenDecoded
  }
  catch (e) {
    e.component = 'auth'
    throw (e)
  }
}

module.exports.decodeToken = function decodeToken(str) {
  str = str.split('.')[1]
  str = str.replace(/-/g, '+')
  str = str.replace(/_/g, '/')
  switch (str.length % 4) {
      case 0:
          break;
      case 2:
          str += '=='
          break;
      case 3:
          str += '='
          break;
      default:
          throw 'Invalid token'
  }
  str = decodeURIComponent(escape(atob(str)))
  str = JSON.parse(str)
  return str
}

