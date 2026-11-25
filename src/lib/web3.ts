import { ethers } from 'ethers';

export interface ConnectedWalletState {
  address: string;
  chainId: number;
  chainName: string;
  nativeBalanceEth: string;
  verified: boolean;
}

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

function getInjectedProvider(): Eip1193Provider | null {
  const win = window as unknown as { ethereum?: Eip1193Provider };
  return win.ethereum ?? null;
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  11155111: 'Sepolia Testnet',
  137: 'Polygon Mainnet',
  42161: 'Arbitrum One',
  8453: 'Base Mainnet',
  10: 'Optimism',
  56: 'BNB Smart Chain'
};

export function hasInjectedWallet(): boolean {
  return Boolean(getInjectedProvider());
}

export function normalizeEvmAddress(address: string): string | null {
  try {
    if (!ethers.isAddress(address.trim())) return null;
    return ethers.getAddress(address.trim());
  } catch {
    return null;
  }
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export async function connectAndSignWeb3Wallet(userEmail: string): Promise<ConnectedWalletState> {
  const ethereum = getInjectedProvider();
  if (!ethereum) {
    throw new Error('No browser Web3 wallet detected (MetaMask / Coinbase Wallet). You can still bind and validate an EVM address below.');
  }

  const provider = new ethers.BrowserProvider(ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const address = ethers.getAddress(await signer.getAddress());
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const balanceWei = await provider.getBalance(address);
  const nativeBalanceEth = Number(ethers.formatEther(balanceWei)).toFixed(4);

  const challenge = `EraEarn Cryptographic Wallet Verification\nAccount: ${userEmail}\nWallet: ${address}\nChain ID: ${chainId}\nTimestamp: ${new Date().toISOString()}`;
  const signature = await signer.signMessage(challenge);

  const verifyRes = await fetch('/api/blockchain/verify-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, message: challenge, signature })
  });

  if (!verifyRes.ok) {
    throw new Error('Server cryptographic signature verification failed.');
  }
  const result = (await verifyRes.json()) as { verified?: boolean };
  if (!result.verified) {
    throw new Error('Signature does not match the connected wallet address.');
  }

  return {
    address,
    chainId,
    chainName: CHAIN_NAMES[chainId] || `Chain #${chainId}`,
    nativeBalanceEth,
    verified: true
  };
}

export interface TxVerificationResult {
  validFormat: boolean;
  foundOnChain: boolean;
  txHash?: string;
  network?: string;
  from?: string;
  to?: string;
  valueEth?: string;
  blockNumber?: number | null;
  confirmed?: boolean;
  status?: string;
  error?: string;
}

export async function verifyOnChainTxHash(txHash: string): Promise<TxVerificationResult> {
  const res = await fetch('/api/blockchain/verify-tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash })
  });
  return (await res.json()) as TxVerificationResult;
}
