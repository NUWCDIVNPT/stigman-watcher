import { EventEmitter } from "node:events"

/**
 * Represents the state of each alarm type.
 * @typedef {Object} Alarms
 * @property {boolean} apiOffline - the STIG manager API is unreachable.
 * @property {boolean} authOffline - the OIDC IdP is unreachable.
 * @property {boolean} noToken - the OIDC IdP did not issue the client a token.
 * @property {boolean} noGrant - the client has an insufficient grant on the configured Collection.
 */

/**
 * @typedef {'apiOffline' | 'authOffline' | 'noToken' | 'noGrant'} AlarmType 
 */

class Alarm extends EventEmitter {
    /** @type {Alarms} */
    #alarms

    constructor () {
        super()
        this.#alarms = {
            apiOffline: false,
            authOffline: false,
            noToken: false,
            noGrant: false,
        }
    }

    /**
     * Emits 'alarmRaised' or 'alarmLowered' based on 'state', passing the alarmType
     * @param {AlarmType} event 
     * @param {boolean} state 
     */
    #emitAlarmEvent (alarmType, state) {
        if (state) {
            this.emit('alarmRaised', alarmType)
        }
        else {
            this.emit('alarmLowered', alarmType)
        }
    }

    /**
     * Sets the state of the apiOffline alarm
     * @param {boolean} state 
     */
    apiOffline (state) {
        this.#alarms.apiOffline = state
        this.#emitAlarmEvent( 'apiOffline', state)
    }

    /**
     * Sets the state of the authOffline alarm
     * @param {boolean} state 
     */
    authOffline (state) {
        this.#alarms.authOffline = state
        this.#emitAlarmEvent( 'authOffline', state)
    }

    /**
     * Sets the state of the noToken alarm
     * @param {boolean} state 
     */
    noToken (state) {
        this.#alarms.noToken = state
        this.#emitAlarmEvent( 'noToken', state)
    }

    /**
     * Sets the state of the noGrant alarm
     * @param {boolean} state 
     */
    noGrant (state) {
        this.#alarms.noGrant = state
        this.#emitAlarmEvent( 'noGrant', state)
    }

    /** @type {Alarms} */
    get alarms() {
        return this.#alarms
    }
}

export default new Alarm()