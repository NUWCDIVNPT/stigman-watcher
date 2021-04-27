const parser = require('fast-xml-parser')
const Queue = require('better-queue')
const he = require('he')
const { logger } = require('./logger')
const cargo = require('./cargo')
const fs = require('fs').promises
const { resolve } = require('path')

// const parseResult = {
//   type: 'CKL' || 'XCCDF',
//   target: {
//     name: 'string',
//     description: 'string',
//     ip: 'string',
//     noncomputing: 'string',
//     fqdn: 'string',
//     mac: 'string',
//     metadata: {}
//   },
//   checklists: [
//     {
//       benchmrkId: 'string',
//       revisionStr: 'string',
//       reviews: [
//         {
//           ruleId: '',
//           result: '',
//           resultComment: '',
//           action: '' || null,
//           actionComment: '' || null,
//           autoResult: false,
//           status: ''
//         }
//       ],
//       stats: {
//         pass: 0,
//         fail: 0,
//         notapplicable: 0,
//         notchecked: 0
//       }
//     }
//   ]
// }

const reviewsFromCkl = function reviewsFromCkl (cklData, options = {}) {
  try {
    options.ignoreNr = !!options.ignoreNr
    const fastparseOptions = {
      attributeNamePrefix: "",
      ignoreAttributes: false,
      ignoreNameSpace: true,
      allowBooleanAttributes: false,
      parseNodeValue: true,
      parseAttributeValue: true,
      trimValues: true,
      cdataTagName: "__cdata", //default is 'false'
      cdataPositionChar: "\\c",
      localeRange: "", //To support non english character in tag/attribute values.
      parseTrueNumberOnly: false,
      arrayMode: true, //"strict"
      tagValueProcessor: val => he.decode(val)
    }
    let parsed = parser.parse(cklData, fastparseOptions)

    if (!parsed.CHECKLIST) throw (new Error("No CHECKLIST element"))
    if (!parsed.CHECKLIST[0].ASSET) throw (new Error("No ASSET element"))
    if (!parsed.CHECKLIST[0].STIGS) throw (new Error("No STIGS element"))

    let returnObj = {}
    returnObj.target = processAsset(parsed.CHECKLIST[0].ASSET[0])
    if (!returnObj.target.name) {
      throw (new Error("No host_name in ASSET"))
    }
    returnObj.checklists = processIStig(parsed.CHECKLIST[0].STIGS[0].iSTIG)
    if (returnObj.checklists.length === 0) {
      throw (new Error("STIG_INFO element has no SI_DATA for SID_NAME == stigId"))
    }
    return (returnObj)

    function processAsset(assetElement) {
      let obj =  {
        name: assetElement.HOST_NAME,
        description: null,
        ip: assetElement.HOST_IP || null,
        fqdn: assetElement.HOST_FQDN || null,
        mac: assetElement.HOST_MAC || null,
        noncomputing: assetElement.ASSET_TYPE === 'Non-Computing'
      }
      const metadata = {}
      if (assetElement.ROLE) {
        metadata.cklRole = assetElement.ROLE
      }

      if (assetElement.WEB_OR_DATABASE) {
        metadata.cklWebOrDatabase = 'true'
        metadata.cklHostName = assetElement.HOST_NAME
        if (assetElement.WEB_DB_SITE) {
          metadata.cklWebDbSite = assetElement.WEB_DB_SITE
        }
        if (assetElement.WEB_DB_INSTANCE) {
          metadata.cklWebDbInstance = assetElement.WEB_DB_INSTANCE
        }
      }
      obj.metadata = metadata
      return obj
    }
      
    function processIStig(iStigElement) {
      let checklistArray = []
      iStigElement.forEach(iStig => {
        let checklist = {}
        // get benchmarkId
        let stigIdElement = iStig.STIG_INFO[0].SI_DATA.filter( d => d.SID_NAME === 'stigid' )[0]
        checklist.benchmarkId = stigIdElement.SID_DATA.replace('xccdf_mil.disa.stig_benchmark_', '')
        // get revision
        const stigVersion = iStig.STIG_INFO[0].SI_DATA.filter( d => d.SID_NAME === 'version' )[0].SID_DATA
        let stigReleaseInfo = iStig.STIG_INFO[0].SI_DATA.filter( d => d.SID_NAME === 'releaseinfo' )[0].SID_DATA
        const stigRelease = stigReleaseInfo.match(/Release:\s*(.+?)\s/)[1]
        const stigRevisionStr = `V${stigVersion}R${stigRelease}`
        checklist.revisionStr = stigRevisionStr

        if (checklist.benchmarkId) {
          let x = processVuln(iStig.VULN)
          checklist.reviews = x.reviews
          checklist.stats = x.stats
          checklistArray.push(checklist)
        }
      })
      return checklistArray
    }
  
    function processVuln(vulnElements) {
      // vulnElements is an array of this object:
      // {
      //     COMMENTS
      //     FINDING_DETAILS
      //     SEVERITY_JUSTIFICATION
      //     SEVERITY_OVERRIDE
      //     STATUS
      //     STIG_DATA [26]
      // }
  
      const results = {
        NotAFinding: 'pass',
        Open: 'fail',
        Not_Applicable: 'notapplicable',
        Not_Reviewed: 'notchecked'
      }
      let vulnArray = []
      let nf = na = nr = o = 0
      vulnElements?.forEach(vuln => {
        const result = results[vuln.STATUS]
        if (result) {
          switch (result) {
            case 'pass':
                nf++
                break
            case 'fail':
                o++
                break
            case 'notapplicable':
                na++
                break
            case 'notchecked':
                nr++
                break
          }

          let ruleId
          vuln.STIG_DATA.some(stigDatum => {
            if (stigDatum.VULN_ATTRIBUTE == "Rule_ID") {
              ruleId = stigDatum.ATTRIBUTE_DATA
              return true
            }
          })
          let action = null
          if (result === 'fail') {
            if (vuln.COMMENTS.startsWith("Mitigate:")) {
              action = "mitigate"
            } 
            else if (vuln.COMMENTS.startsWith("Exception:")) {
              action = "exception"
            } 
            else if (vuln.COMMENTS.startsWith("Remediate:")) {
              action = "remediate"
            } 
          }
          let status = 'saved'
          if (result && vuln.FINDING_DETAILS && result !== 'fail') {
            status = 'submitted'
          }
          if (result && vuln.FINDING_DETAILS && result === 'fail' && action && vuln.COMMENTS) {
            status = 'submitted'
          }
          if (result === 'notchecked' && options.ignoreNr) return
          vulnArray.push({
            ruleId: ruleId,
            result: result,
            resultComment: vuln.FINDING_DETAILS,
            action: action,
            // Allow actionComments even without an action, for DISA STIG Viewer compatibility.
            actionComment: vuln.COMMENTS == "" ? null : vuln.COMMENTS,
            autoResult: false,
            status: status
          })    
        }
      })
  
      return {
        reviews: vulnArray,
        stats: {
          notchecked: nr,
          notapplicable: na,
          pass: nf,
          fail: o
        }
      }
    }  
  }
  finally {}
}

const reviewsFromScc = function (sccFileContent, options = {}) {
  try {
    options.ignoreNotChecked = !!ignoreNotChecked
    // Parse the XML
    const parseOptions = {
      attributeNamePrefix: "",
      ignoreAttributes: false,
      ignoreNameSpace: true,
      allowBooleanAttributes: false,
      parseNodeValue: true,
      parseAttributeValue: true,
      trimValues: true,
      cdataTagName: "__cdata", //default is 'false'
      cdataPositionChar: "\\c",
      localeRange: "", //To support non english character in tag/attribute values.
      parseTrueNumberOnly: false,
      arrayMode: false //"strict"
    }
    let parsed = parser.parse(sccFileContent, parseOptions)

    // Baic sanity checks
    if (!parsed.Benchmark) throw (new Error("No Benchmark element"))
    if (!parsed.Benchmark.TestResult) throw (new Error("No TestResult element"))
    if (!parsed.Benchmark.TestResult['target-facts']) throw (new Error("No target-facts element"))
    if (!parsed.Benchmark.TestResult['rule-result']) throw (new Error("No rule-result element"))

    // Process parsed data
    let benchmarkId = parsed.Benchmark.id.replace('xccdf_mil.disa.stig_benchmark_', '')
    let target = processTargetFacts(parsed.Benchmark.TestResult['target-facts'].fact)
    if (!target.name) {
      throw (new Error('No host_name fact'))
    }
    let x = processRuleResults(parsed.Benchmark.TestResult['rule-result'])

    // Return object
    return ({
      target: target,
      checklists: [{
        benchmarkId: benchmarkId,
        reviews: x.reviews,
        stats: x.stats
      }]
    })
  }
  catch (e) {
    throw (e)
  }


  function processRuleResults(ruleResults) {
    const results = {
      pass: 'pass',
      fail: 'fail',
      notapplicable: 'notapplicable',
      notchecked: 'notchecked'
    }
    let reviews = []
    let nf = na = nr = o = 0   
    ruleResults.forEach(ruleResult => {
      result = results[ruleResult.result]
      if (result) {
        switch (result) {
          case 'pass':
              nf++
              break
          case 'fail':
              o++
              break
          case 'notapplicable':
              na++
              break
          case 'notchecked':
              nr++
              break
        }
        if ( result === 'notchecked' && options.ignoreNotChecked ) return
        reviews.push({
          ruleId: ruleResult.idref.replace('xccdf_mil.disa.stig_rule_', ''),
          result: result,
          resultComment: `SCC Reviewed at ${ruleResult.time} using:\n${ruleResult.check['check-content-ref'].href.replace('#scap_mil.disa.stig_comp_', '')}`,
          autoResult: true,
          status: result != 'fail' ? 'accepted' : 'saved'
        })  
      }
    })
    return {
      reviews: reviews,
      stats: {
        notchecked: nr,
        notapplicable: na,
        pass: nf,
        fail: o
      }  
    }
  }

  function processTargetFacts(facts) {
    let target = {}
    facts.forEach(fact => {
      if (fact['#text']) {
        let name = fact.name.replace('urn:scap:fact:asset:identifier:', '')
        name = name === 'ipv4' ? 'ip' : name
        target[name] = fact['#text'] 
      }
    })
    const {ip, host_name, fqdn, mac, ...metadata} = target
    return {
      name: host_name,
      ip: ip,
      mac: mac,
      fqdn: fqdn,
      description: '',
      noncomputing: false,
      metadata: metadata
    }
  }
}

async function parseFileAndEnqueue (file, cb) {
  const component = 'parser'
  try {
    const extension = file.substring(file.lastIndexOf(".") + 1)
    let parseFn, type
    if (extension.toLowerCase() === 'ckl') {
      parseFn = reviewsFromCkl
      type = 'CKL'
    }
    else if (extension.toLowerCase() === 'xml') {
      parseFn = reviewsFromScc
      type = "XCCDF"
    }
    else {
      throw (`Ignored unknown extension`)
    }
    const data = await fs.readFile(file)
    logger.verbose({component: component, message: `parse started`, file: file})
    let parseResult = parseFn(data.toString(), {ignoreNr: true, ignoreNotChecked: true})
    parseResult.file = file
    logger.debug({component: component, message: `parse results`, results: parseResult})
    
    cargo.queue.push( parseResult )
    
    const checklistInfo = []
    for (const checklist of parseResult.checklists) {
      checklistInfo.push({ 
        benchmarkId: checklist.benchmarkId, 
        stats: checklist.stats
      })
    }
    logger.verbose({component: component, message: `results queued`, file: parseResult.file, 
      target: parseResult.target.name, checklists: checklistInfo })
    cb(null, parseResult)
  }
  catch (e) {
    logger.warn({component: component, message: e.message, file: file})
    cb(e, null)
  }
}

module.exports.queue = new Queue (parseFileAndEnqueue, {
  concurrent: 8
})




  