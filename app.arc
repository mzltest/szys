@app
szys

@http
any /http/*
get /bvstat

@aws
timeout 300

@tables
data
  scopeID *String
  dataID **String
  ttl TTL