let arc = require('@architect/functions')
let fetch = require('node-fetch')
const https = require("https");
const agent = new https.Agent({
  rejectUnauthorized: false
})

exports.handler = async function http (request) {
  
if(!('queryStringParameters' in request)|| request.queryStringParameters==null){return {body:'must have bvid+goal or api+bvid'}}
if('api' in request.queryStringParameters){
    res=await fetch("https://api.bilibili.com/x/web-interface/archive/stat?bvid="+request.queryStringParameters.bvid,{agent:agent});
    jsonmy=await res.json()
  console.log(jsonmy)
 return jsonmy
}else if('goal' in request.queryStringParameters && 'bvid' in request.queryStringParameters ){
data=`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Hello, world!</title>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="" />
 
</head>
<body>
<progress style="width: 100%;" id="prog"></progress>
<p id="info"></p>
<p id="nextupdate"></p>
<script>

bvid='{{BVID}}'
goal=parseInt('{{GOAL}}')
i=0
oldview=0
document.getElementById('info').innerText='正在获取数据:'+bvid+',目标值为'+goal;
invid=setInterval(function(){

    if(i%60==0){
        document.getElementById('nextupdate').innerText='开始获取新数据';
        i=0
        fetch('./bvstat?api=1&bvid='+bvid).then(res=>res.json()).then((data)=>{
            console.log(data)
            if(data.code!=0){console.error(data)}
            data=data.data
            progress=data.view/goal
            
            document.getElementById('prog').setAttribute('value',progress)
            document.getElementById('info').innerText=('['+progress*100+'%]尚余观看:'+(goal-data.view)+' 当前观看:'+data.view+' +'+(data.view-oldview))
            oldview=data.view
            if(data.view>=goal){
                alert('目标达成，停止数据更新。')
                clearInterval(invid)
            }
        })
    }else{
        document.getElementById('nextupdate').innerText=(60-i%60)+'秒后重新获取(太频繁也没用)';
    }
    i++
    console.log(i)
 
}, 1000);
</script>
</body>
</html>`
newdata=data.replace('{{BVID}}',request.queryStringParameters.bvid).replace('{{GOAL}}',request.queryStringParameters.goal)
return {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=utf8',
      
    },
    body: newdata
  }
}
}
