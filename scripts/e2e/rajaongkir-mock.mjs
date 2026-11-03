import http from 'node:http'

const bandung = { id: 4866, label: 'Cibangkong, Batununggal, Bandung, Jawa Barat', city_name: 'Bandung', district_name: 'Batununggal', subdistrict_name: 'Cibangkong', province_name: 'Jawa Barat', zip_code: '40273' }
const bali = { id: 26027, label: 'Dauh Puri, Denpasar Barat, Denpasar, Bali', city_name: 'Denpasar', district_name: 'Denpasar Barat', subdistrict_name: 'Dauh Puri', province_name: 'Bali', zip_code: '80113' }

http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://rajaongkir-mock:8788')
  response.setHeader('content-type', 'application/json')
  if (url.pathname === '/api/v1/destination/domestic-destination') {
    const query = (url.searchParams.get('search') ?? '').toLowerCase()
    response.end(JSON.stringify({ data: query.includes('bali') || query.includes('denpasar') ? [bali] : [bandung] }))
    return
  }
  if (url.pathname === '/api/v1/calculate/domestic-cost' && request.method === 'POST') {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      const courier = new URLSearchParams(body).get('courier')
      const data = courier === 'anteraja'
        ? [{ code: 'anteraja', name: 'AnterAja', service: 'REG', cost: 28000, etd: '3-5 hari' }]
        : courier === 'jnt'
          ? [{ code: 'jnt', name: 'J&T Express', service: 'EZ', cost: 11000, etd: '1-2 hari' }]
          : []
      response.end(JSON.stringify({ data }))
    })
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ data: [] }))
}).listen(8788, '0.0.0.0')
