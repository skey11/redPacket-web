import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

const shorten = (addr?: string) =>
  addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '未连接';

export function WalletBar() {
  const { address, chain } = useAccount();

  return (
    <header className="wallet-bar">
      <div className="brand">
        <span className="dot" />
        <div>
          <div className="title">链上红包</div>
          <div className="subtitle">React + Wagmi + RainbowKit</div>
        </div>
      </div>
      <div className="wallet-actions">
        <div className="address-chip">
          <span className="label">当前钱包</span>
          <span className="value">{shorten(address)}</span>
          {chain?.name ? <span className="chain">{chain.name}</span> : null}
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>
    </header>
  );
}
