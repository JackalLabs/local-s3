import type {IClientSetup} from "@jackallabs/jackal.js";

const mainnetChainID = 'jackal-1'
export const mainnet: IClientSetup = {
    chainConfig: {
        chainId: mainnetChainID,
        chainName: 'Jackal Mainnet',
        rpc: 'https://jklrpc.squirrellogic.com:443',
        rest: 'https://jklapi.squirrellogic.com:443',
        bip44: {
            coinType: 118
        },
        stakeCurrency: {
            coinDenom: 'JKL',
            coinMinimalDenom: 'ujkl',
            coinDecimals: 6
        },
        bech32Config: {
            bech32PrefixAccAddr: 'jkl',
            bech32PrefixAccPub: 'jklpub',
            bech32PrefixValAddr: 'jklvaloper',
            bech32PrefixValPub: 'jklvaloperpub',
            bech32PrefixConsAddr: 'jklvalcons',
            bech32PrefixConsPub: 'jklvalconspub'
        },
        currencies: [
            {
                coinDenom: 'JKL',
                coinMinimalDenom: 'ujkl',
                coinDecimals: 6
            }
        ],
        feeCurrencies: [
            {
                coinDenom: 'JKL',
                coinMinimalDenom: 'ujkl',
                coinDecimals: 6,
                gasPriceStep: {
                    low: 0.002,
                    average: 0.002,
                    high: 0.02
                }
            }
        ],
        features: []
    },
    chainId: mainnetChainID,
    endpoint: 'https://jklrpc.squirrellogic.com:443 ',
    options: {},
    networks: ['jackal']
}

const testnetChainID = 'lupulella-2'
export const testnet: IClientSetup = {
    chainConfig: {
        chainId: testnetChainID,
        chainName: 'Jackal Testnet',
        rpc: 'https://testnet-rpc.jackalprotocol.com:443',
        rest: 'https://testnet-api.jackalprotocol.com:443',
        bip44: {
            coinType: 118
        },
        stakeCurrency: {
            coinDenom: 'JKL',
            coinMinimalDenom: 'ujkl',
            coinDecimals: 6
        },
        bech32Config: {
            bech32PrefixAccAddr: 'jkl',
            bech32PrefixAccPub: 'jklpub',
            bech32PrefixValAddr: 'jklvaloper',
            bech32PrefixValPub: 'jklvaloperpub',
            bech32PrefixConsAddr: 'jklvalcons',
            bech32PrefixConsPub: 'jklvalconspub'
        },
        currencies: [
            {
                coinDenom: 'JKL',
                coinMinimalDenom: 'ujkl',
                coinDecimals: 6
            }
        ],
        feeCurrencies: [
            {
                coinDenom: 'JKL',
                coinMinimalDenom: 'ujkl',
                coinDecimals: 6,
                gasPriceStep: {
                    low: 0.002,
                    average: 0.002,
                    high: 0.02
                }
            }
        ],
        features: []
    },
    chainId: testnetChainID,
    endpoint: 'https://testnet-rpc.jackalprotocol.com:443',
    options: {},
    networks: ['jackaltest']
}
