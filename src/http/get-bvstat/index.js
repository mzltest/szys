let arc = require('@architect/functions')
let fetch = require('node-fetch')
let begindata = require('@begin/data')
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
  if(jsonmy.code==0){
   doc= await begindata.get({table:'vids',key:request.queryStringParameters.bvid })
    if (!doc){
      doc={'key':request.queryStringParameters.bvid,'data':[]}
    }
    console.log(doc)
    doc.data=doc.data.slice(-500)
    if(doc.data.length==0 || Math.floor(Date.now()/1000)>=(doc.data[doc.data.length-1].ts)+30){
      console.log('==push==')
    doc.data.push({'data':jsonmy.data,'ts':Math.floor(Date.now()/1000)})
    console.log(doc)
}
await begindata.set({table:'vids',key:request.queryStringParameters.bvid,data:doc.data})
  }
  
 return jsonmy
}else if('goal' in request.queryStringParameters && 'bvid' in request.queryStringParameters ){
  doc= await begindata.get({table:'vids',key:request.queryStringParameters.bvid })
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
<details><summary>历史数据</summary>{{DBFORE}}</details>
*请保持浏览器在线以定期获取数据，此服务仅为cors proxy，并不主动获取数据。
<script>
function average(arr) {//封装求平均值函数
        var len = arr.length;
        var sum = 0;
        for(var i = 0;i<len;i++){
            sum +=arr[i];
        }
        return sum/len;
    }

bvid='{{BVID}}'
goal=parseInt('{{GOAL}}')
i=0
oldview=0
lastaddarray=[0]
eta=0
document.getElementById('info').innerText='正在获取数据:'+bvid+',目标值为'+goal;
invid=setInterval(function(){

    if(i%60==0){
  //  document.getElementById('info').innerText='正在获取数据:'+bvid+',目标值为'+goal;
        document.getElementById('nextupdate').innerText='开始请求新数据';
        i=0
        fetch('./bvstat?api=1&bvid='+bvid).then(res=>res.json()).then((data)=>{
            console.log(data)
            if(data.code!=0){console.error(data)}
            data=data.data
            progress=data.view/goal
            
            document.getElementById('prog').setAttribute('value',progress)
            document.getElementById('info').innerText=('['+progress*100+'%]尚余观看:'+(goal-data.view)+' 当前观看:'+data.view+' +'+(data.view-oldview))
     if(oldview!=0){  
     lastaddarray.push((data.view-oldview))
}
       //     lastaddarray=lastaddarray.slice(-5)
            eta=(goal-data.view)/average(lastaddarray)
            console.log('5m change eta:',eta)
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
   // console.log(i)
 
}, 1000);
</script>
</body>
</html>`
newdata=data.replace('{{BVID}}',request.queryStringParameters.bvid).replace('{{GOAL}}',request.queryStringParameters.goal)
if(doc && 'data' in doc && doc.data.length>0){
  thead=`<table>
  <thead>
    <tr>
      <th>ts</th>
      <th>view</th>
      <th>like</th>
      <th>danmaku</th>
      <th>reply</th>
      <th>share</th>
      <th>fav</th>
      <th>coin</th>
    </tr>
  </thead>
  <tbody>`
  for (el of doc.data){
    console.log('----',el)
    thead+=`
    <tr>
    <td>${el.ts}</td>
    <td>${el.data.view}</td>
    <td>${el.data.like}</td>
    <td>${el.data.danmaku}</td>
    <td>${el.data.reply}</td>
    <td>${el.data.share}</td>
    <td>${el.data.favorite}</td>
    <td>${el.data.coin}</td>
  </tr>`
  }
  thead+=`</tbody>
  </table>`
  console.log(thead)
newdata=newdata.replace('{{DBFORE}}',thead)
}else{
  newdata=newdata.replace('{{DBFORE}}','尚未有人请求过数据。如果有请求，此处将显示最近500条历史数据（两次间隔需大于30秒）')
}

return {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=utf8',
      
    },
    body: newdata
  }
}
}
