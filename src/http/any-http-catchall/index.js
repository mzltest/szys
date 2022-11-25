'use strict'
let arc = require('@architect/functions')
let fetch = require('node-fetch')
const https = require("https");
const agent = new https.Agent({
  rejectUnauthorized: false
})
/**
 * static files (404.html, sw.js, conf.js)
 */
const ASSET_URL = 'https://etherdream.github.io/jsproxy'

const JS_VER = 10
const MAX_RETRY = 1

/** @type {RequestInit} */
const PREFLIGHT_INIT = {
  statusCode: 204,
  headers:  {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
    'access-control-max-age': '1728000',
  }
}

/**
 * @param {any} body
 * @param {number} status
 * @param {Object<string, string>} headers
 */
function makeRes(body, status = 200, headers = {}) {
  headers['--ver'] = JS_VER
  headers['access-control-allow-origin'] = '*'
 // return new Response(body, {status, headers})
 return {statusCode:status,body:body,headers:headers}
}


/**
 * @param {string} urlStr 
 */
function newUrl(urlStr) {
  try {
    return new URL(urlStr)
  } catch (err) {
    return null
  }
}



/**
 * @param {FetchEvent} e 
 */
async function fetchHandler(e) {
    
  let urlStr = e.pathParameters.proxy
  if ('rawQueryString' in e && e.rawQueryString!=''){
    urlStr+='?'+e.rawQueryString
  }
  const urlObj = new URL(urlStr)
  const path = urlObj.href.substr(urlObj.origin.length)
  console.log(path)

  if (urlObj.protocol === 'http:') {
    urlObj.protocol = 'https:'
    return makeRes('', 301, {
      'strict-transport-security': 'max-age=99999999; includeSubDomains; preload',
      'location': urlObj.href,
    })
  }

    return httpHandler(e, urlStr)

  
}


/**
 * @param {Request} req
 * @param {string} pathname
 */
function httpHandler(req, pathname) {
    console.log(req,pathname)
  const reqHdrRaw = req.headers
  if ('x-jsproxy' in reqHdrRaw) {
    return makeRes('err',400)
  }

  // preflight
  if (req.method === 'OPTIONS' &&
      ('access-control-request-headers' in reqHdrRaw)
  ) {
    return new Response(null, PREFLIGHT_INIT)
  }

  let acehOld = false
  let rawSvr = ''
  let rawLen = ''
  let rawEtag = ''

  const reqHdrNew = reqHdrRaw
  reqHdrNew['x-jsproxy']= '1'

  // 此处逻辑和 http-dec-req-hdr.lua 大致相同
  // https://github.com/EtherDream/jsproxy/blob/master/lua/http-dec-req-hdr.lua
  const refer = ('referer' in reqHdrNew) ? reqHdrNew['referer']  : null
  const query = refer.substr(refer.indexOf('?') + 1)
  if (!query) {
    return makeRes('missing params', 403)
  }
  const param = new URLSearchParams(query)

  for (const [k, v] of Object.entries(param)) {
    if (k.substr(0, 2) === '--') {
      // 系统信息
      switch (k.substr(2)) {
      case 'aceh':
        acehOld = true
        break
      case 'raw-info':
        [rawSvr, rawLen, rawEtag] = v.split('|')
        break
      }
    } else {
      // 还原 HTTP 请求头
      if (v) {
        reqHdrNew[k]= v
      } else {
        delete reqHdrNew[k]
      }
    }
  }
  if (!('referer' in param)) {
    delete reqHdrNew['referer']
  }

  // cfworker 会把路径中的 `//` 合并成 `/`
  const urlStr = pathname.replace(/^(https?):\/+/, '$1://')
  const urlObj = newUrl(urlStr)
  if (!urlObj) {
    return makeRes('invalid proxy url: ' + urlStr, 403)
  }

  /** @type {RequestInit} */
  const reqInit = {
    method: req.method,
    headers: reqHdrNew,
    redirect: 'manual',
  }
  if (req.method === 'POST') {
    reqInit.body = req.body
  }
  return proxy(urlObj, reqInit, acehOld, rawLen, 0)
}


/**
 * 
 * @param {URL} urlObj 
 * @param {RequestInit} reqInit 
 * @param {number} retryTimes 
 */
async function proxy(urlObj, reqInit, acehOld, rawLen, retryTimes) {
  //console.log('===>',reqInit)
  reqInit['agent']=agent
  reqInit['headers']['host']=urlObj.host
  const res = await fetch(urlObj.href, reqInit)
  //const resHdrOld = res.headers
  const resHdrOld = [...res.headers.entries()].reduce((obj, [key, value]) => (obj[key.toLowerCase()] = value, obj), {})
  console.log(resHdrOld)
  const resHdrNew = resHdrOld

  let expose = '*'
  
  for (const k in resHdrOld) {
    let v=resHdrOld[k]
    if (k === 'access-control-allow-origin' ||
        k === 'access-control-expose-headers' ||
        k === 'location' ||
        k === 'set-cookie'
    ) {
      const x = '--' + k
      resHdrNew[x]= v
      if (acehOld) {
        expose = expose + ',' + x
      }
      delete resHdrNew[k]
    }
    else if (acehOld &&
      k !== 'cache-control' &&
      k !== 'content-language' &&
      k !== 'content-type' &&
      k !== 'expires' &&
      k !== 'last-modified' &&
      k !== 'pragma'
    ) {
      expose = expose + ',' + k
    }
  }

  if (acehOld) {
    expose = expose + ',--s'
    resHdrNew['--t']= '1'
  }

  // verify
  if (rawLen) {
    const newLen = ('content-length' in resHdrOld) ? resHdrOld['content-length']  : null || ''
    const badLen = (rawLen !== newLen)

    if (badLen) {
      if (retryTimes < MAX_RETRY) {
        urlObj = await parseYtVideoRedir(urlObj, newLen, res)
        if (urlObj) {
          return proxy(urlObj, reqInit, acehOld, rawLen, retryTimes + 1)
        }
      }
      return makeRes(res.body, 400, {
        '--error': `bad len: ${newLen}, except: ${rawLen}`,
        'access-control-expose-headers': '--error',
      })
    }

    if (retryTimes > 1) {
      resHdrNew['--retry']= retryTimes
    }
  }

  let status = res.status

  resHdrNew['access-control-expose-headers']= expose
  resHdrNew['access-control-allow-origin']= '*'
  resHdrNew['--s']= status
  resHdrNew['--ver']= JS_VER

  delete resHdrNew['content-security-policy']
  delete resHdrNew['content-security-policy-report-only']
  delete resHdrNew['clear-site-data']

  if (status === 301 ||
      status === 302 ||
      status === 303 ||
      status === 307 ||
      status === 308
  ) {
    status = status + 10
  }
 let mybody=await res.buffer()
     mybody=mybody.toString('base64')
 console.log('b:',mybody.length)
 delete resHdrNew['content-encoding']
  return  {
    body:mybody,
    statusCode:status,
    headers: resHdrNew,
    isBase64Encoded:true
  }
}


/**
 * @param {URL} urlObj 
 */
function isYtUrl(urlObj) {
  return (
    urlObj.host.endsWith('.googlevideo.com') &&
    urlObj.pathname.startsWith('/videoplayback')
  )
}

/**
 * @param {URL} urlObj 
 * @param {number} newLen 
 * @param {Response} res 
 */
async function parseYtVideoRedir(urlObj, newLen, res) {
  if (newLen > 2000) {
    return null
  }
  if (!isYtUrl(urlObj)) {
    return null
  }
  try {
    const data = await res.text()
    urlObj = new URL(data)
  } catch (err) {
    return null
  }
  if (!isYtUrl(urlObj)) {
    return null
  }
  return urlObj
}

// addEventListener('fetch', e => {
//     const ret = 
//       .catch(err => makeRes('cfworker error:\n' + err.stack, 502))
//     e.respondWith(ret)
//   })
  
exports.handler = arc.http.async(fetchHandler)  