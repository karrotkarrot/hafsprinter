import requests
with open('sample.pdf', 'rb') as f:
    r = requests.post('http://localhost:3000/api/upload', files={'file': ('sample.pdf', f, 'application/pdf')})
print(r.json())
