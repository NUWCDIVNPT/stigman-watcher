const got = require('got')
const atob = require('atob')
const config = require('./config')

let self = this

module.exports.getTokens = async function getTokens( threshold = 10 ) {
  try {
    if (self.tokens) {
      const parsedAccessToken = self.decodeToken(self.tokens.access_token)
      let expiresIn = parsedAccessToken.exp - Math.ceil(new Date().getTime() / 1000)
      expiresIn -= threshold
      if (expiresIn > threshold) {
        return
      }
    } 
    const response = await got.post(`${config.authority}/protocol/openid-connect/token`, {
      form: {
        grant_type: 'client_credentials'
      },
      username: config.clientId,
      password: config.secret,
      scopes: 'openid stig-manager:collection',
      responseType: 'json'
    })
    self.tokens = response.body
    return self.tokens
  }
  catch (e) {
    throw (e.response.body)
  }
}

module.exports.decodeToken = function decodeToken(str) {
  str = str.split('.')[1];

  str = str.replace(/-/g, '+');
  str = str.replace(/_/g, '/');
  switch (str.length % 4) {
      case 0:
          break;
      case 2:
          str += '==';
          break;
      case 3:
          str += '=';
          break;
      default:
          throw 'Invalid token';
  }

  str = decodeURIComponent(escape(atob(str)));

  str = JSON.parse(str);
  return str;
}

