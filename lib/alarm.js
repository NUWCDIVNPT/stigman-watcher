import { EventEmitter } from "node:events"

/**
 * Represents the state of each alarm type.
 * @typedef {Object} Alarms
 * @property {boolean} apiOffline - the STIG manager API is unreachable.
 * @property {boolean} authOffline - the OIDC IdP is unreachable.
 * @property {boolean} apiNotNormal - the STIG manager API is reachable but is not in 'normal' state.
 * @property {boolean} noToken - the OIDC IdP did not issue the client a token.
 * @property {boolean} noGrant - the client has an insufficient grant on the configured Collection.
 */

/**
 * @typedef {'apiOffline' | 'authOffline' | 'noToken' | 'noGrant' | 'apiNotNormal'} AlarmType 
 */

class Alarm extends EventEmitter {
    /** @type {Alarms} */
    #alarms

    constructor () {
        super()
        this.#alarms = {
            apiOffline: false,
            apiNotNormal: false,
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
        if (alarmType === 'shutdown') {
            this.emit('shutdown', state)
            return
        }
        if (state) {
            this.emit('alarmRaised', alarmType)
        }
        else {
            this.emit('alarmLowered', alarmType)
        }
    }

    /**
     * Sets the state of the apiOffline alarm 
     * and emits an alarmRaised or alarmLowered event
     * @param {boolean} state 
     */
    apiOffline (state) {
        if (this.#alarms.apiOffline === state) return
        this.#alarms.apiOffline = state
        this.#emitAlarmEvent( 'apiOffline', state)
    }

    /**
     * Sets the state of the apiNotNormal alarm
     * and emits an alarmRaised or alarmLowered event
     * @param {boolean} state
     */
    apiNotNormal (state) {
        if (this.#alarms.apiNotNormal === state) return
        this.#alarms.apiNotNormal = state
        this.#emitAlarmEvent( 'apiNotNormal', state)
    }

    /**
     * Sets the state of the authOffline alarm
     * and emits an alarmRaised or alarmLowered event
     * @param {boolean} state 
     */
    authOffline (state) {
        if (this.#alarms.authOffline === state) return
        this.#alarms.authOffline = state
        this.#emitAlarmEvent( 'authOffline', state)
    }

    /**
     * Sets the state of the noToken alarm
     * and emits an alarmRaised or alarmLowered event
     * @param {boolean} state 
     */
    noToken (state) {
        if (this.#alarms.noToken === state) return
        this.#alarms.noToken = state
        this.#emitAlarmEvent( 'noToken', state)
    }

    /**
     * Sets the state of the noGrant alarm
     * and emits an alarmRaised or alarmLowered event
     * @param {boolean} state 
     */
    noGrant (state) {
        if (this.#alarms.noGrant === state) return
        this.#alarms.noGrant = state
        this.#emitAlarmEvent( 'noGrant', state)
    }

    /**
     * Returns an array of the raised alarm types
     * @returns {string[]}
     */
    raisedAlarms () {
        return Object.keys(this.#alarms).filter(key=>this.#alarms[key])
    }

    /**
     * Returns true if any alarm is raised
     * @returns {boolean}
     */
    isAlarmed () {
        return Object.values(this.#alarms).some(value=>value)
    }

    /**
     * Emits a shutdown event with the provied exitCode
     * @param {number} exitCode 
     */
    shutdown (exitCode) {
        this.#emitAlarmEvent('shutdown', exitCode)
    }

    /** @type {Alarms} */
    get alarms() {
        return this.#alarms
    }
}

export default new Alarm()