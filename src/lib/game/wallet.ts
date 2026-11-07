'use client'

// ─── Wallet + $WIF burn (real onchain, Robinhood Chain 4663) ────────────────
import { BrowserProvider, Contract, formatEther, parseUnits } from 'ethers'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
      on?: (event: string, cb: (...args: unknown[]) => void) => void
      removeListener?: (event: string, cb: (...args: unknown[]) => void) => void
      isMetaMask?: boolean
    }
  }
}

export const TARGET_CHAIN = {
  chainId: '0x1237', // 4663 Robinhood Chain mainnet
  chainName: 'Robinhood Chain',
  rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
}

export function hasWallet() {
  return typeof window !== 'undefined' && !!window.ethereum
}

export async function connectWallet(): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet found in this browser — install MetaMask or any EVM wallet')
  await window.ethereum.request({ method: 'eth_requestAccounts' })
  const provider = new BrowserProvider(window.ethereum)
  const accounts = await provider.listAccounts()
  if (!accounts.length) throw new Error('No account authorized')
  return accounts[0].address
}

export async function ensureRobinhoodChain(): Promise<void> {
  if (!window.ethereum) throw new Error('No wallet found')
  const provider = new BrowserProvider(window.ethereum)
  const net = await provider.getNetwork()
  if (net.chainId === 4663n) return
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: TARGET_CHAIN.chainId }],
    })
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 4902 || code === -32603) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [TARGET_CHAIN],
      })
    } else {
      throw new Error('Please switch your wallet to Robinhood Chain (4663)')
    }
  }
}

export async function signMessage(message: string): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet found')
  const provider = new BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()
  return signer.signMessage(message)
}

export async function getEthBalance(address: string): Promise<string> {
  if (!window.ethereum) return '0'
  const provider = new BrowserProvider(window.ethereum)
  const bal = await provider.getBalance(address)
  return Number(formatEther(bal)).toFixed(4)
}

const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)']

/**
 * Burns `amountWif` $WIF by transferring to the dead address on Robinhood Chain.
 * Returns the tx hash after 1 confirmation.
 */
export async function burnWif(wifAddress: string, amountWif: number): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet found')
  const provider = new BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()
  const wif = new Contract(wifAddress, ERC20_ABI, signer)
  const tx = await wif.transfer(
    '0x000000000000000000000000000000000000dEaD',
    parseUnits(String(amountWif), 18)
  )
  const receipt = await tx.wait(1)
  if (!receipt || receipt.status !== 1) throw new Error('Transaction failed on-chain')
  return receipt.hash
}
