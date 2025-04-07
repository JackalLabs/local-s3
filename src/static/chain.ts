import { IClientSetup } from '@jackallabs/jackal.js'
import dotenv from 'dotenv'

dotenv.config()

const mainnetMnemonic = process.env.JACKAL_MAINNET_WALLET_MNEMONIC
export const mainnetChainID = 'jackal-1'
export const mainnet: IClientSetup = {
  chainConfig: {
    chainId: mainnetChainID,
    chainName: 'Jackal Main Net',
    rpc: 'https://jklrpc.squirrellogic.com',
    rest: 'https://jklapi.squirrellogic.com',
    bip44: {
      coinType: 118,
    },
    stakeCurrency: {
      coinDenom: 'JKL',
      coinMinimalDenom: 'ujkl',
      coinDecimals: 6,
    },
    bech32Config: {
      bech32PrefixAccAddr: 'jkl',
      bech32PrefixAccPub: 'jklpub',
      bech32PrefixValAddr: 'jklvaloper',
      bech32PrefixValPub: 'jklvaloperpub',
      bech32PrefixConsAddr: 'jklvalcons',
      bech32PrefixConsPub: 'jklvalconspub',
    },
    currencies: [
      {
        coinDenom: 'JKL',
        coinMinimalDenom: 'ujkl',
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: 'JKL',
        coinMinimalDenom: 'ujkl',
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.002,
          average: 0.002,
          high: 0.02,
        },
      },
    ],
    features: [],
  },
  chainId: mainnetChainID,
  endpoint: 'https://jklrpc.squirrellogic.com',
  options: {},
  networks: ['jackal'],
  selectedWallet: 'mnemonic',
  mnemonic: mainnetMnemonic,
}

const testnetMnemonic = process.env.JACKAL_TESTNET_WALLET_MNEMONIC
export const testnetChainID = 'lupulella-2'
export const testnet: IClientSetup = {
  chainConfig: {
    chainId: testnetChainID,
    chainName: 'Jackal Testnet',
    rpc: 'https://testnet-rpc.jackalprotocol.com',
    rest: 'https://testnet-api.jackalprotocol.com',
    bip44: {
      coinType: 118,
    },
    stakeCurrency: {
      coinDenom: 'JKL',
      coinMinimalDenom: 'ujkl',
      coinDecimals: 6,
    },
    bech32Config: {
      bech32PrefixAccAddr: 'jkl',
      bech32PrefixAccPub: 'jklpub',
      bech32PrefixValAddr: 'jklvaloper',
      bech32PrefixValPub: 'jklvaloperpub',
      bech32PrefixConsAddr: 'jklvalcons',
      bech32PrefixConsPub: 'jklvalconspub',
    },
    currencies: [
      {
        coinDenom: 'JKL',
        coinMinimalDenom: 'ujkl',
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: 'JKL',
        coinMinimalDenom: 'ujkl',
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.002,
          average: 0.002,
          high: 0.02,
        },
      },
    ],
    features: [],
  },
  chainId: testnetChainID,
  endpoint: 'https://testnet-rpc.jackalprotocol.com',
  options: {},
  networks: ['jackaltest'],
  selectedWallet: 'mnemonic',
  mnemonic: testnetMnemonic,
}

if (!mainnetMnemonic || !testnetMnemonic) {
  throw new Error(
    'Mnemonic is missing. Set JACKAL_MAINNET_WALLET_MNEMONIC and JACKAL_TESTNET_WALLET_MNEMONIC.',
  )
}
