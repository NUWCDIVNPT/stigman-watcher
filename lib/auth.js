const got = require('got')
const atob = require('atob')
const config = require('../config')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const crypto = require('crypto')

let self = this
if (config.clientKey) {
  self.key = fs.readFileSync(config.clientKey)
}
self.scope = 'openid stig-manager:collection stig-manager:stig:read'

const authenticateClientSecret = async () => {
  try {
    const response = await got.post(`${config.authority}/protocol/openid-connect/token`, {
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
    const response = await got.post(`${config.authority}/protocol/openid-connect/token`, {
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
const authenticateClient = config.secret ? authenticateClientSecret : authenticateSignedJwt

module.exports.getToken = async function getToken( threshold = 10 ) {
  try {
    if (self.tokenDecoded) {
      let expiresIn = self.tokenDecoded.exp - Math.ceil(new Date().getTime() / 1000)
      expiresIn -= threshold
      if (expiresIn > threshold) {
        return self.tokenDecoded
      }
    }
    self.tokens = await authenticateClient()
    self.tokenDecoded = self.decodeToken(self.tokens.access_token)
    return self.tokenDecoded
  }
  catch (e) {
    e.component = '[AUTH]'
    e.message = `${e.message} ${JSON.stringify(e.response.body)}`
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

