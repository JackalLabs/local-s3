const TESTNET_PROVIDERS = {
  jkl1nayh6fux2a9ht0jzu9kjd60drufx5upaq7w72a: "https://testnet-provider.jackallabs.io",
}
const MAINNET_PROVIDERS = {
  // jkl1h7mssuydzhgc3jwwrvu922cau9jnd0akzp7n0u: "https://node1.jackalstorageprovider40.com",
  // jkl10kvlcwwntw2nyccz4hlgl7ltp2gyvvfrtae5x6: "https://pod-04.jackalstorage.online",
  // jkl10nf7agseed0yrke6j79xpzattkjdvdrpls3g22: "https://pod-01.jackalstorage.online",
  jkl1t5708690gf9rc3mmtgcjmn9padl8va5g03f9wm: "https://mprov01.jackallabs.io",
  jkl1esjprqperjzwspaz6er7azzgqkvsa6n5kljv05: "https://mprov02.jackallabs.io",
  // jkl10de5s5ylu0ve0zqh9cx7k908j4hsu0rmqrld6e: "https://pod2.europlots.net",
  jkl1dht8meprya6jr7w9g9zcp4p98ccxvckufvu4zc: "https://jklstorage1.squirrellogic.com",
  jkl1nfnmjk7k59xc3q7wgtva7xahkg3ltjtgs3le93: "https://jklstorage2.squirrellogic.com",
}
export const initPool = process.env.NETWORK == "testnet" ? TESTNET_PROVIDERS : MAINNET_PROVIDERS;