(function (exports) {
  exports.reviewsFromCkl = function (
    {
      data, 
      fieldSettings,
      allowAccept,
      importOptions,
      valueProcessor,
      XMLParser
    }) {

    const maxCommentLength = 32767
      
    if (!XMLParser) {
      if (typeof require === 'function') {
        const { requireXMLParser } = require('fast-xml-parser')
        XMLParser = requireXMLParser
      }
      else if (typeof fxp === "object" && typeof fxp.XMLParser === 'function') {
          XMLParser = fxp.XMLParser
      }
      else {
        throw(new Error('XMLParser not found'))
      }
    }
  
    const normalizeKeys = function (input) {
      // lowercase and remove hyphens
      if (typeof input !== 'object') return input;
      if (Array.isArray(input)) return input.map(normalizeKeys);
      return Object.keys(input).reduce(function (newObj, key) {
          let val = input[key];
          let newVal = (typeof val === 'object') && val !== null ? normalizeKeys(val) : val;
          newObj[key.toLowerCase().replace('-','')] = newVal;
          return newObj;
      }, {});
    }
    const resultMap = {
      NotAFinding: 'pass',
      Open: 'fail',
      Not_Applicable: 'notapplicable',
      Not_Reviewed: 'notchecked'
    }
    const parseOptions = {
      allowBooleanAttributes: false,
      attributeNamePrefix: "",
      cdataPropName: "__cdata", //default is 'false'
      ignoreAttributes: false,
      parseTagValue: false,
      parseAttributeValue: false,
      removeNSPrefix: true,
      trimValues: true,
      tagValueProcessor: valueProcessor,
      commentPropName: "__comment",
      isArray: (name, jpath, isLeafNode, isAttribute) => {
        return name === '__comment' || !isLeafNode
      }
    }
    const parser = new XMLParser(parseOptions)
    const parsed = parser.parse(data)
  
    if (!parsed.CHECKLIST) throw (new Error("No CHECKLIST element"))
    if (!parsed.CHECKLIST[0].ASSET) throw (new Error("No ASSET element"))
    if (!parsed.CHECKLIST[0].STIGS) throw (new Error("No STIGS element"))
  
    const comments = parsed['__comment']
    const resultEngineCommon = comments?.length ? processRootXmlComments(comments) : null
  
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
      if (assetElement.TECH_AREA) {
        metadata.cklTechArea = assetElement.TECH_AREA
      }
      if (assetElement.WEB_OR_DATABASE === 'true') {
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
        let stigIdElement = iStig.STIG_INFO[0].SI_DATA.filter( d => d.SID_NAME === 'stigid' )?.[0]
        checklist.benchmarkId = stigIdElement.SID_DATA.replace('xccdf_mil.disa.stig_benchmark_', '')
        // get revision data. Extract digits from version and release fields to create revisionStr, if possible.
        const stigVersionData = iStig.STIG_INFO[0].SI_DATA.filter( d => d.SID_NAME === 'version' )?.[0].SID_DATA
        let stigVersion = stigVersionData.match(/(\d+)/)?.[1]
        let stigReleaseInfo = iStig.STIG_INFO[0].SI_DATA.filter( d => d.SID_NAME === 'releaseinfo' )?.[0].SID_DATA
        const stigRelease = stigReleaseInfo.match(/Release:\s*(.+?)\s/)?.[1]
        const stigRevisionStr = stigVersion && stigRelease ? `V${stigVersion}R${stigRelease}` : null
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
  
      let vulnArray = []
      let resultStats = {
        pass: 0,
        fail: 0,
        notapplicable: 0,
        notchecked: 0,
        notselected: 0,
        informational: 0,
        error: 0,
        fixed: 0,
        unknown: 0
      }        
      vulnElements?.forEach(vuln => {
        const review = generateReview(vuln, resultEngineCommon)
        if (review) {
          vulnArray.push(review)
          resultStats[review.result]++
        }
      })
  
      return {
        reviews: vulnArray,
        stats: resultStats
      }
    }
  
    function generateReview(vuln, resultEngineCommon) {
      let result = resultMap[vuln.STATUS]
      if (!result) return
      const ruleId = getRuleIdFromVuln(vuln)
      if (!ruleId) return
  
      const hasComments = !!vuln.FINDING_DETAILS || !!vuln.COMMENTS
  
      if (result === 'notchecked') { // unreviewed business rules
        switch (importOptions.unreviewed) {
          case 'never':
            return undefined
          case 'commented':
            result = hasComments ? importOptions.unreviewedCommented : undefined
            if (!result) return
            break
          case 'always':
            result = hasComments ? importOptions.unreviewedCommented : 'notchecked'
            break
        }
      }
  
      let detail = vuln.FINDING_DETAILS.length > maxCommentLength ? vuln.FINDING_DETAILS.slice(0, maxCommentLength) : vuln.FINDING_DETAILS
      if (!vuln.FINDING_DETAILS) {
        switch (importOptions.emptyDetail) {
          case 'ignore':
            detail= null
            break
          case 'import':
            detail = vuln.FINDING_DETAILS
            break
          case 'replace':
            detail = 'There is no detail provided for the assessment'
            break
        }
      }
  
      let comment = vuln.COMMENTS.length > maxCommentLength ? vuln.COMMENTS.slice(0, maxCommentLength) : vuln.COMMENTS
      if (!vuln.COMMENTS) {
        switch (importOptions.emptyComment) {
          case 'ignore':
            comment = null
            break
          case 'import':
            comment = vuln.COMMENTS
            break
          case 'replace':
            comment = 'There is no comment provided for the assessment'
            break
        }
      }
  
      const review = {
        ruleId,
        result,
        detail,
        comment
      }
  
      if (resultEngineCommon) {
        review.resultEngine = {...resultEngineCommon}
        if (vuln['__comment']) {
          const overrides = []
          for (const comment of vuln['__comment']) {
            if (comment.toString().startsWith('<Evaluate-STIG>')) {
              let override
              try {
                override = parser.parse(comment)['Evaluate-STIG'][0]
              }
              catch(e) {
                console.log(`Failed to parse Evaluate-STIG VULN XML comment for ${ruleId}`)
              }
              override = normalizeKeys(override)
              if (override.afmod?.toLowerCase() === 'true') {
                overrides.push({
                  authority: override.answerfile,
                  oldResult: resultMap[override.oldstatus] ?? 'unknown',
                  newResult: result,
                  remark: 'Evaluate-STIG Answer File'
                })
              }
            } 
          }
          if (overrides.length) {
            review.resultEngine.overrides = overrides
          }  
        }
      }
      else {
        review.resultEngine = null
      }
  
      const status = bestStatusForReview(review)
      if (status) {
        review.status = status
      }
    
      return review
    }
  
    function getRuleIdFromVuln(vuln) {
      let ruleId
      vuln.STIG_DATA.some(stigDatum => {
        if (stigDatum.VULN_ATTRIBUTE == "Rule_ID") {
          ruleId = stigDatum.ATTRIBUTE_DATA
          return true
        }
      })
      return ruleId
    }
  
    function bestStatusForReview(review) {
      if (importOptions.autoStatus === 'null') return null
      if (importOptions.autoStatus === 'saved') return 'saved'
  
      let detailSubmittable = false
      switch (fieldSettings.detail.required) {
        case 'optional':
          detailSubmittable = true
          break
        case 'findings':
          if ((review.result !== 'fail') || (review.result === 'fail' && review.detail)) {
            detailSubmittable = true
          }
          break
        case 'always':
          if (review.detail) {
            detailSubmittable = true
          }
          break
      } 
  
      let commentSubmittable = false
      switch (fieldSettings.comment.required) {
        case 'optional':
          commentSubmittable = true
          break
        case 'findings':
          if ((review.result !== 'fail') || (review.result === 'fail' && review.comment)) {
            commentSubmittable = true
          }
          break
        case 'always':
          if (review.comment) {
            commentSubmittable = true
          }
          break
      }
  
      const resultSubmittable = review.result === 'pass' || review.result === 'fail' || review.result === 'notapplicable'
      
      let status = undefined
      if (detailSubmittable && commentSubmittable && resultSubmittable) {
        switch (importOptions.autoStatus) {
          case 'submitted':
            status = 'submitted'
            break
          case 'accepted':
            status = allowAccept ? 'accepted' : 'submitted'
            break
        }
      } 
      else {
        status = 'saved'
      }
      return status
    }
  
    function processRootXmlComments(comments) {
      let resultEngineRoot
      for (const comment of comments) {
        if (comment.toString().startsWith('<Evaluate-STIG>')) {
          let esRootComment
          try {
            esRootComment = parser.parse(comment)['Evaluate-STIG'][0]
          }
          catch(e) {
            console.log('Failed to parse Evaluate-STIG root XML comment')
          }
          esRootComment = normalizeKeys(esRootComment)
          resultEngineRoot = {
            type: 'script',
            product: 'Evaluate-STIG',
            version: esRootComment?.global?.[0]?.version,
            time: esRootComment?.global?.[0]?.time,
            checkContent: {
              location: esRootComment?.module?.[0]?.name ?? ''
            }
          }
        }
      }
      return resultEngineRoot || null
    }
  }
  
  exports.reviewsFromXccdf = function (
    {
      data, 
      fieldSettings,
      allowAccept,
      importOptions,
      valueProcessor,
      scapBenchmarkMap,
      XMLParser
    }) {

    // Parse the XML
    const parseOptions = {
      allowBooleanAttributes: false,
      attributeNamePrefix: "",
      cdataPropName: "__cdata", //default is 'false'
      ignoreAttributes: false,
      parseTagValue: false,
      removeNSPrefix: true,
      trimValues: true,
      tagValueProcessor: valueProcessor,
      commentPropName: "__comment",
      isArray: (name, jpath, isLeafNode, isAttribute) => {
        const arrayElements = [
          'override',
          'overrides',
          'target',
          'target-address',
          'fact'
        ]
        return arrayElements.includes(name)
      }
    }
    const parser = new XMLParser(parseOptions)  
    let parsed = parser.parse(data)

    // Basic sanity checks, handle <TestResult> root element with <benchmark> child
    let benchmarkId, testResult
    if (!parsed.Benchmark && !parsed.TestResult) throw (new Error("No Benchmark or TestResult element"))
    if (parsed.Benchmark) {
      if (!parsed.Benchmark.TestResult) throw (new Error("No Benchmark.TestResult element"))
      if (!parsed.Benchmark.TestResult['target']) throw (new Error("No Benchmark.TestResult.target element"))
      if (!parsed.Benchmark.TestResult['rule-result']) throw (new Error("No Benchmark.TestResult.rule-result element"))
      testResult = parsed.Benchmark.TestResult
      benchmarkId = parsed.Benchmark.id.replace('xccdf_mil.disa.stig_benchmark_', '')
    }
    else {
      if (!parsed.TestResult['benchmark']) throw (new Error("No TestResult.benchmark element"))
      if (!parsed.TestResult['target']) throw (new Error("No TestResult.target element"))
      if (!parsed.TestResult['rule-result']) throw (new Error("No TestResult.rule-result element"))
      testResult = parsed.TestResult
      let benchmarkAttr
      if (testResult.benchmark.id?.startsWith('xccdf_mil.disa.stig_benchmark_')) {
        benchmarkAttr = testResult.benchmark.id
      }
      else if (testResult.benchmark.href?.startsWith('xccdf_mil.disa.stig_benchmark_')){
        benchmarkAttr = testResult.benchmark.href
      }
      else {
        throw (new Error("TestResult.benchmark has no attribute starting with xccdf_mil.disa.stig_benchmark_"))
      }
      benchmarkId = benchmarkAttr.replace('xccdf_mil.disa.stig_benchmark_', '')
    }
    let DEFAULT_RESULT_TIME = testResult['end-time'] //required by XCCDF 1.2 rev 4 spec

    // Process parsed data
    if (scapBenchmarkMap && scapBenchmarkMap.has(benchmarkId)) {
      benchmarkId = scapBenchmarkMap.get(benchmarkId)
    }
    const target = processTarget(testResult)
    if (!target.name) {
      throw (new Error('No value for <target>'))
    }

    // resultEngine info
    const testSystem = testResult['test-system']
    // SCC injects a CPE WFN bound to a URN
    const m = testSystem.match(/[c][pP][eE]:\/[AHOaho]?:(.*)/)
    let vendor, product, version
    if (m?.[1]) {
      ;[vendor, product, version] = m[1].split(':')
    }
    else {
      ;[product, version] = testSystem.split(':') // e.g. PAAuditEngine:6.5.3
    }
    const resultEngineTpl = {
      type: 'scap',
      product,
      version
    }
    const r = processRuleResults(testResult['rule-result'], resultEngineTpl)

    // Return object
    return ({
      target,
      checklists: [{
        benchmarkId: benchmarkId,
        revisionStr: null,
        reviews: r.reviews,
        stats: r.stats
      }]
    })
  
    function processRuleResults(ruleResults, resultEngineTpl) {
      const stats = {
        pass: 0,
        fail: 0,
        notapplicable: 0,
        notchecked: 0,
        notselected: 0,
        informational: 0,
        error: 0,
        fixed: 0,
        unknown: 0
      }
      const reviews = []
      for (const ruleResult of ruleResults) {
        const review = generateReview(ruleResult, resultEngineTpl)
        if (review) {
          reviews.push(review)
          stats[review.result]++
        }
      }
      return { reviews, stats }
    }

    function generateReview(ruleResult, resultEngineCommon) {
      let result = ruleResult.result
      if (!result) return
      const ruleId = ruleResult.idref.replace('xccdf_mil.disa.stig_rule_', '')
      if (!ruleId) return

      const hasComments = false // or look for <remark>

      if (result !== 'pass' && result !== 'fail' && result !== 'notapplicable') { // unreviewed business rules
        switch (importOptions.unreviewed) {
          case 'never':
            return undefined
          case 'commented':
            result = hasComments ? importOptions.unreviewedCommented : undefined
            if (!result) return
            break
          case 'always':
              result = hasComments ? importOptions.unreviewedCommented : 'notchecked'
              break
        }
      }

      let resultEngine
      if (resultEngineCommon) {
        if (resultEngineCommon.product === 'stig-manager') {
          resultEngine = ruleResult.check?.['check-content']?.resultEngine
        }
        else {
          // build the resultEngine value
          const timeStr = ruleResult.time ?? DEFAULT_RESULT_TIME
          resultEngine = {
            time: (timeStr ? new Date(timeStr) : new Date()).toISOString(), 
            ...resultEngineCommon
          }
          // handle check-content-ref, if it exists
          const checkContentHref = ruleResult?.check?.['check-content-ref']?.href?.replace('#scap_mil.disa.stig_comp_','')
          const checkContentName = ruleResult?.check?.['check-content-ref']?.name?.replace('oval:mil.disa.stig.','')
          if (checkContentHref || checkContentName) {
            resultEngine.checkContent = {
              location: checkContentHref,
              component: checkContentName
            }
          }
          
          if (ruleResult.override?.length) { //overrides
            const overrides = []
            for (const override of ruleResult.override) {
              overrides.push({
                authority: override.authority,
                oldResult: override['old-result'],
                newResult: override['new-result'],
                remark: override['remark']
              })
            }
            if (overrides.length) {
              resultEngine.overrides = overrides
            }  
          }
        }
      }

      const replacementText = `Result was reported by product "${resultEngine?.product}" version ${resultEngine?.version} at ${resultEngine?.time} using check content "${resultEngine?.checkContent?.location}"`

      let detail = ruleResult.check?.['check-content']?.detail
      if (!detail) {
        switch (importOptions.emptyDetail) {
          case 'ignore':
            detail= null
            break
          case 'import':
            detail = ''
            break
          case 'replace':
            detail = replacementText
            break
        }
      }

      let comment = ruleResult.check?.['check-content']?.comment
      if (!comment) {
        switch (importOptions.emptyComment) {
          case 'ignore':
            comment = null
            break
          case 'import':
            comment = ''
            break
          case 'replace':
            comment = replacementText
            break
        }
      }

      const review = {
        ruleId,
        result,
        resultEngine,
        detail,
        comment
      }

      const status = bestStatusForReview(review)
      if (status) {
        review.status = status
      }
      
      return review
    }
  
    function bestStatusForReview(review) {
      if (importOptions.autoStatus === 'null') return undefined
      if (importOptions.autoStatus === 'saved') return 'saved'
  
      const fields = ['detail', 'comment']
      let commentsSubmittable
      for (const field of fields) {
        switch (fieldSettings[field].required) {
          case 'optional':
            commentsSubmittable = true
            break
          case 'findings':
            commentsSubmittable = ((review.result !== 'fail') || (review.result === 'fail' && review[field]))
            break
          case 'always':
            commentsSubmittable = !!review[field]
            break
          }
        if (!commentsSubmittable) break // can end loop if commentsSubmittable becomes false
      }
  
      const resultSubmittable = review.result === 'pass' || review.result === 'fail' || review.result === 'notapplicable'
      
      let status = undefined
      if (commentsSubmittable && resultSubmittable) {
        switch (importOptions.autoStatus) {
          case 'submitted':
            status = 'submitted'
            break
          case 'accepted':
            status = allowAccept ? 'accepted' : 'submitted'
            break
        }
      } 
      else {
        status = 'saved'
      }
      return status
    }

    function processTargetFacts(targetFacts) {
      if (!targetFacts) return {}

      const asset = { metadata: {} }
      const reTagAsset = /^tag:stig-manager@users.noreply.github.com,2020:asset:(.*)/
      const reMetadata = /^metadata:(.*)/

      for (const targetFact of targetFacts) {
        const matchesTagAsset = targetFact['name'].match(reTagAsset)
        if (!matchesTagAsset) {
          asset.metadata[targetFact['name']] = targetFact['#text']
          continue
        }
        const property = matchesTagAsset[1]
        const matchesMetadata = property.match(reMetadata)
        if (matchesMetadata) {
          asset.metadata[decodeURI(matchesMetadata[1])] = targetFact['#text']
        }
        else {
          let value = targetFact['#text']
          if (property === 'noncomputing') {
            value = value === 'true'
          }
          if (['name','description','fqdn','ip','mac','noncomputing'].includes(property)) {
            asset[property] = value
          }
        }
      }
      return asset
    }

    function processTarget(testResult) {
      const assetFromFacts = processTargetFacts(testResult['target-facts']?.fact)
      return {
        name: testResult.target[0],
        description: '',
        ip: testResult['target-address']?.[0] || '',
        noncomputing: false,
        metadata: {},
        ...assetFromFacts
      }
    }
  }

  exports.reviewsFromCklb = function (
    {
      data, 
      fieldSettings,
      allowAccept,
      importOptions
    }) {

    const maxCommentLength = 32767
    const resultMap = {
      not_a_finding: 'pass',
      open: 'fail',
      not_applicable: 'notapplicable',
      not_reviewed: 'notchecked'
    }
    let cklb
    try {
      cklb = JSON.parse(data)
    }
    catch (e) {
      throw(new Error('Cannot parse as JSON'))
    }
    const validateCklb = (obj) => {
      try {
        if (!obj.target_data?.host_name) {
          throw('No target_data.host_name found')
        }
        if (!Array.isArray(obj.stigs)) {
          throw('No stigs array found')
        }
        return {valid: true}
      }
      catch (e) {
        let error = e
        if (e instanceof Error) {
          error = e.message
        }
        return {valid: false, error}
      }
    }

    const validationResult = validateCklb(cklb)
    if (!validationResult.valid) {
      throw(new Error(`Invalid CKLB object: ${validationResult.error}`))
    }

    const resultEngineCommon = cklb.stig_manager_engine ||  null
    let returnObj = {}
    returnObj.target = processTargetData(cklb.target_data)
    if (!returnObj.target.name) {
      throw (new Error("No host_name in target_data"))
    }
    returnObj.checklists = processStigs(cklb.stigs)
    if (returnObj.checklists.length === 0) {
      throw (new Error("stigs array is empty"))
    }
    return (returnObj)

    function processTargetData(td) {
      const obj =  {
        name: td.host_name,
        description: td.comments,
        ip: td.ip_address || null,
        fqdn: td.fqdn || null,
        mac: td.mac_address || null,
        noncomputing: td.target_type === 'Non-Computing',
        metadata: {}
      }
      if (td.role) {
        obj.metadata.cklRole = td.ROLE
      }
      if (td.technology_area) {
        obj.metadata.cklTechArea = td.technology_area
      }
      if (td.is_web_database) {
        obj.metadata.cklWebOrDatabase = 'true'
        obj.metadata.cklHostName = td.host_name
        if (td.web_db_site) {
          obj.metadata.cklWebDbSite = td.web_db_site
        }
        if (td.web_db_instance) {
          obj.metadata.cklWebDbInstance = td.web_db_instance
        }
      }
      return obj
    }
    function processStigs(stigs) {
      const checklistArray = []
      for (const stig of stigs) {
        // checklist = {
        //   benchmarkId: 'string',
        //   revisionStr: 'string',
        //   reviews: [],
        //   stats: {}
        // }
        const checklist = {}
        checklist.benchmarkId = typeof stig?.stig_id === 'string' ? stig.stig_id.replace('xccdf_mil.disa.stig_benchmark_', '') : ''
        const stigVersion = '0'
        const stigRelease = typeof stig?.release_info === 'string' ? stig.release_info.match(/Release:\s*(.+?)\s/)?.[1] : ''
        checklist.revisionStr = checklist.benchmarkId && stigRelease ? `V${stigVersion}R${stigRelease}` : null
  
        if (checklist.benchmarkId) {
          const result = processRules(stig.rules)
          checklist.reviews = result.reviews
          checklist.stats = result.stats
          checklistArray.push(checklist)
        }

      }
      return checklistArray
    }
    function processRules(rules) {
      const stats = {
        pass: 0,
        fail: 0,
        notapplicable: 0,
        notchecked: 0,
        notselected: 0,
        informational: 0,
        error: 0,
        fixed: 0,
        unknown: 0
      }
      const reviews = []
      for (const rule of rules) {
        const review = generateReview(rule, resultEngineCommon)
        if (review) {
          reviews.push(review)
          stats[review.result]++
        }
      }
      return { reviews, stats }
    }
    function generateReview(rule, resultEngineCommon) {
      let result = resultMap[rule.status]
      if (!result) return
      const ruleId = rule.rule_id_src
      if (!ruleId) return
  
      const hasComments = !!rule.finding_details || !!rule.comments
  
      if (result === 'notchecked') { // unreviewed business rules
        switch (importOptions.unreviewed) {
          case 'never':
            return undefined
          case 'commented':
            result = hasComments ? importOptions.unreviewedCommented : undefined
            if (!result) return
            break
          case 'always':
            result = hasComments ? importOptions.unreviewedCommented : 'notchecked'
            break
        }
      }
  
      let detail = rule.finding_details?.length > maxCommentLength ? rule.finding_details.slice(0, maxCommentLength) : rule.finding_details
      if (!rule.finding_details) {
        switch (importOptions.emptyDetail) {
          case 'ignore':
            detail= null
            break
          case 'import':
            detail = rule.finding_details ?? ''
            break
          case 'replace':
            detail = 'There is no detail provided for the assessment'
            break
        }
      }
  
      let comment = rule.comments?.length > maxCommentLength ? rule.comments.slice(0, maxCommentLength) : rule.comments
      if (!rule.comments) {
        switch (importOptions.emptyComment) {
          case 'ignore':
            comment = null
            break
          case 'import':
            comment = rule.comments ?? ''
            break
          case 'replace':
            comment = 'There is no comment provided for the assessment'
            break
        }
      }
  
      const review = {
        ruleId,
        result,
        detail,
        comment
      }
  
      // if (resultEngineCommon) {
      //   review.resultEngine = {...resultEngineCommon}
      //   if (rule.stig_manager_engine) {
      //     const overrides = []
      //     for (const comment of vuln['__comment']) {
      //       if (comment.toString().startsWith('<Evaluate-STIG>')) {
      //         let override
      //         try {
      //           override = parser.parse(comment)['Evaluate-STIG'][0]
      //         }
      //         catch(e) {
      //           console.log(`Failed to parse Evaluate-STIG VULN XML comment for ${ruleId}`)
      //         }
      //         override = normalizeKeys(override)
      //         if (override.afmod?.toLowerCase() === 'true') {
      //           overrides.push({
      //             authority: override.answerfile,
      //             oldResult: resultMap[override.oldstatus] ?? 'unknown',
      //             newResult: result,
      //             remark: 'Evaluate-STIG Answer File'
      //           })
      //         }
      //       } 
      //     }
      //     if (overrides.length) {
      //       review.resultEngine.overrides = overrides
      //     }  
      //   }
      // }
      // else {
      //   review.resultEngine = null
      // }
  
      const status = bestStatusForReview(review)
      if (status) {
        review.status = status
      }
    
      return review
    }
    function bestStatusForReview(review) {
      if (importOptions.autoStatus === 'null') return null
      if (importOptions.autoStatus === 'saved') return 'saved'
  
      let detailSubmittable = false
      switch (fieldSettings.detail.required) {
        case 'optional':
          detailSubmittable = true
          break
        case 'findings':
          if ((review.result !== 'fail') || (review.result === 'fail' && review.detail)) {
            detailSubmittable = true
          }
          break
        case 'always':
          if (review.detail) {
            detailSubmittable = true
          }
          break
      } 
  
      let commentSubmittable = false
      switch (fieldSettings.comment.required) {
        case 'optional':
          commentSubmittable = true
          break
        case 'findings':
          if ((review.result !== 'fail') || (review.result === 'fail' && review.comment)) {
            commentSubmittable = true
          }
          break
        case 'always':
          if (review.comment) {
            commentSubmittable = true
          }
          break
      }
  
      const resultSubmittable = review.result === 'pass' || review.result === 'fail' || review.result === 'notapplicable'
      
      let status = undefined
      if (detailSubmittable && commentSubmittable && resultSubmittable) {
        switch (importOptions.autoStatus) {
          case 'submitted':
            status = 'submitted'
            break
          case 'accepted':
            status = allowAccept ? 'accepted' : 'submitted'
            break
        }
      } 
      else {
        status = 'saved'
      }
      return status
    }


  }

  exports.reviewsFromScc = exports.reviewsFromXccdf
  
}) (typeof exports === 'undefined'? this['ReviewParser'] = {} : exports)