import urllib.request, urllib.error
req = urllib.request.Request('http://127.0.0.1:2026/assistants', data=b'{"graph_id": "agent"}', headers={'Content-Type': 'application/json'})
try:
    urllib.request.urlopen(req)
except urllib.error.HTTPError as e:
    print(e.read().decode())
