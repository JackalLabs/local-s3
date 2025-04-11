import fastifyPlugin from 'fastify-plugin'
import { ClientHandler, StorageHandler } from '@jackallabs/jackal.js'
import { mainnet, testnet } from '@/static/chain'
import * as process from 'node:process'
import { initPool } from '@/static'
import dotenv from 'dotenv'

dotenv.config()

async function fastifyJackalJS(fastify: any, _: any) {
  try {
    const BASE_FOLDER = process.env.BASE_FOLDER || 'S3Buckets'
    let client
    if (process.env.NETWORK === 'mainnet') {
      if (!mainnet.mnemonic) {
        throw new Error('Invalid Mnemonic!')
      }
      client = await ClientHandler.connect(mainnet)
    } else {
      if (!testnet.mnemonic) {
        throw new Error('Invalid Mnemonic!')
      }
      client = await ClientHandler.connect(testnet)
    }

    const storageHandler = await StorageHandler.init(client, {
      setFullSigner: true,
    })

    await storageHandler.initStorage()
    try {
      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    } catch {
      console.log(`Creating storage root: ${BASE_FOLDER}`)
      await storageHandler.createFolders({ names: BASE_FOLDER })
      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    }

    console.log("Provider pool: ", initPool);
    await storageHandler.loadProviderPool(initPool)

    console.log('Jackal.js client initialized successfully')

    fastify
      .decorate('jjs', storageHandler)
      .addHook('onClose', (instance: any, done: any) => {
        if (instance.jjs === storageHandler) {
          delete instance.jjs
        }
      })
  } catch (err) {
    throw err
  }
}

export default fastifyPlugin(async function (fastify: any, opts: any) {
  try {
    await fastifyJackalJS(fastify, opts)
  } catch (err) {
    console.error(err)
  }

})
