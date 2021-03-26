const prompts = require('prompts')
const axios = require('axios')
const async = require('async')
const slug = require('slug')
const fs = require('fs')
const stream = require('stream')
const { promisify } = require('util')

const finished = promisify(stream.finished)

async function downloadFile (url, token, filename) {
  const writer = fs.createWriteStream(`./pdf/${filename}.pdf`)
  return axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    headers: {
      authorization: `Bearer ${token}`,
    },
  }).then(async response => {
    response.data.pipe(writer)
    return finished(writer) //this is a Promise
  })
}

const getApi = async (token, url) => {
  const res = await axios.get(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })

  return res.data
}

const getList = async (business, token) => {
  let page = 1
  let invoices = []
  let res

  do {
    res = await getApi(token,
      `https://api.waveapps.com/businesses/${business}/invoices/?page=${page}&page_size=50&sort=-invoice_date`)
    invoices = invoices.concat(res)
    page++
  } while (res.length === 50)

  return invoices
}

(async () => {
  const response = await prompts([
    {
      type: 'text',
      name: 'token',
      message: 'Bearer token copied from wave website (eg Bearer FEqBXzxxxxxxxxxxxxxxxxxx)',
      validate: token => token && token.length < 30 ? `Token too short` : true,
    },
    {
      type: 'text',
      name: 'business',
      message: 'Business UUID (First param in the URL, eg 43a3565e-3c9a-472a-294a-cb0c4fa70728)',
      validate: token => token && token.length < 36 ? `UUID too short` : true,
    },
  ])

  const invoices = await getList(response.business, response.token)

  await async.mapLimit(invoices, 3, async invoice => {
    const res = await getApi(
      response.token,
      `https://api.waveapps.com/businesses/${response.business}/invoices/${invoice.id}/?embed_accounts=true&embed_customer=true&embed_items=true&embed_payments=true&embed_products=true&embed_sales_taxes=true`,
    )

    const filename = `invoice-${res.invoice_number}-${res.invoice_date}-${slug(res.customer.name)}`

    console.info(`Processing Invoice ${filename}`)

    await downloadFile(res.pdf_url, response.token, filename)
    fs.writeFileSync(`./json/${filename}.json`, JSON.stringify(res, null, 2))
  })

})()
