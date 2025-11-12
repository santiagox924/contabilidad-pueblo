async function run() {
  try {
    const url = process.env.API_URL || 'http://localhost:3000'
    const res = await fetch(`${url}/items`)
    if (!res.ok) {
      console.log('Request failed', res.status, await res.text())
      return
    }
    const body = await res.json()
    const data = Array.isArray(body.items) ? body.items : (Array.isArray(body.data) ? body.data : (Array.isArray(body) ? body : []))
    if (!Array.isArray(data)) {
      console.log('Unexpected response format:', body)
      return
    }
    console.log('First items (id, name, price, ivaPct):')
    data.slice(0, 50).forEach(it => {
      console.log(it.id, it.name, 'price=', it.price, 'ivaPct=', it.ivaPct)
    })
  } catch (err) {
    console.error('Request failed:', err.message || err)
  }
}

run()
