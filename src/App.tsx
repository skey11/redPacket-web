import { useCallback, useEffect, useMemo, useState } from 'react';
import { Abi, Address, formatEther, parseEther, parseEventLogs, zeroAddress } from 'viem';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  useWriteContract,
} from 'wagmi';
import { WalletBar } from './components/WalletBar';

const statusMap: Record<number, string> = {
  0: '你抢到了红包 🎉',
  1: '你已经抢过了',
  2: '红包抢完了',
  3: '红包金额已经分完',
};

type Toast = {
  id: number;
  text: string;
  tone: 'success' | 'info' | 'warn';
  detail?: string;
};

export default function App() {
  const { address, isConnected } = useAccount();
  const [packetCount, setPacketCount] = useState(5);
  const [amountEth, setAmountEth] = useState('0.1');
  const [equalMode, setEqualMode] = useState(true);
  const [notes, setNotes] = useState<Toast[]>([]);
  const [grabPopup, setGrabPopup] = useState<{ amount: string } | null>(null);
  const [lastGrabHash, setLastGrabHash] = useState<`0x${string}` | undefined>();
  const [abi, setAbi] = useState<Abi | null>(null);
  const [abiError, setAbiError] = useState<string | null>(null);
  const [abiLoading, setAbiLoading] = useState(false);

  const contractAddress = (import.meta.env.VITE_RED_PACKET_ADDRESS || '').trim();
  const hasContract = contractAddress.length > 0;
  const contractAddr = hasContract ? (contractAddress as Address) : undefined;
  const abiReady = Boolean(abi?.length);

  useEffect(() => {
    if (!grabPopup) return;
    const timer = setTimeout(() => setGrabPopup(null), 3200);
    return () => clearTimeout(timer);
  }, [grabPopup]);
  const parsedAmount = useMemo(() => {
    try {
      return parseEther(amountEth || '0');
    } catch (err) {
      return undefined;
    }
  }, [amountEth]);

  const pushNote = useCallback((text: string, tone: Toast['tone'], detail?: string) => {
    setNotes((prev) => {
      const next = [...prev, { id: Date.now() + Math.random(), text, tone, detail }];
      return next.slice(-4);
    });
  }, []);

  useEffect(() => {
    const loadAbi = async () => {
      setAbiLoading(true);
      try {
        const res = await fetch('/RedPacket.json');
        if (!res.ok) throw new Error(`加载 ABI 失败：${res.status} ${res.statusText}`);
        const json = (await res.json()) as { abi?: Abi };
        if (!json?.abi) throw new Error('RedPacket.json 中缺少 abi 字段');
        setAbi(json.abi);
        setAbiError(null);
      } catch (error) {
        setAbiError((error as Error).message);
      } finally {
        setAbiLoading(false);
      }
    };
    loadAbi();
  }, []);

  const { data: onChainCount } = useReadContract({
    address: contractAddr,
    abi: abi ?? ([] as Abi),
    functionName: 'count',
    query: { enabled: hasContract && abiReady, refetchInterval: 4000 },
  });

  const { data: onChainAmount } = useReadContract({
    address: contractAddr,
    abi: abi ?? ([] as Abi),
    functionName: 'totalAmount',
    query: { enabled: hasContract && abiReady, refetchInterval: 4000 },
  });

  const { data: alreadyGrabbed } = useReadContract({
    address: contractAddr,
    abi: abi ?? ([] as Abi),
    functionName: 'isGrabbed',
    args: [address ?? zeroAddress],
    query: { enabled: hasContract && Boolean(address) && abiReady, refetchInterval: 4000 },
  });

  const { writeContract: writeInit, isPending: sendingPacket } = useWriteContract({
    mutation: {
      onSuccess: () => pushNote('已提交：发红包交易', 'info'),
      onError: (err) => {
        const detail =
          (err as { shortMessage?: string }).shortMessage || (err as Error)?.message;
        pushNote('发红包失败', 'warn', detail);
      },
    },
  });

  const { writeContract: writeGrab, isPending: grabbing } = useWriteContract({
    mutation: {
      onSuccess: (hash) => {
        setLastGrabHash(hash as `0x${string}`);
        pushNote('已提交：抢红包交易', 'info');
      },
      onError: (err) => {
        const detail =
          (err as { shortMessage?: string }).shortMessage || (err as Error)?.message;
        pushNote('抢红包失败', 'warn', detail);
      },
    },
  });

  const handleSendPacket = () => {
    if (!contractAddr || !parsedAmount || packetCount <= 0) return;
    writeInit({
      address: contractAddr,
      abi: abi ?? ([] as Abi),
      functionName: 'init',
      value: parsedAmount,
      args: [packetCount || 0, equalMode],
    });
  };

  const handleGrabPacket = () => {
    if (!contractAddr || alreadyGrabbed) return;
    writeGrab({
      address: contractAddr,
      abi: abi ?? ([] as Abi),
      functionName: 'grabRedPacket',
    });
  };

  const { data: grabReceipt } = useWaitForTransactionReceipt({
    hash: lastGrabHash,
    query: { enabled: Boolean(lastGrabHash) },
  });

  useWatchContractEvent({
    address: contractAddr,
    abi: abi ?? ([] as Abi),
    eventName: 'GrabResult',
    onLogs: (logs) => {
      logs.forEach((log) => {
        if (!log.args) return;
        const { amount, status } = log.args as unknown as {
          grabber: Address;
          amount: bigint;
          remainingCount: bigint;
          remainingAmount: bigint;
          status: bigint;
        };
        const readableAmount = formatEther(amount || 0n);
        const tone: Toast['tone'] = status === 0n ? 'success' : 'warn';
        const detail = status === 0n ? `领取 ${readableAmount} ETH` : undefined;
        pushNote(statusMap[Number(status)] ?? '未知事件', tone, detail);
        if (status === 0n) {
          setGrabPopup({ amount: readableAmount });
        }
      });
    },
    enabled: hasContract && abiReady,
    poll: true,
    pollingInterval: 1000,
  });

  useWatchContractEvent({
    address: contractAddr,
    abi: abi ?? ([] as Abi),
    eventName: 'RedPacketFinished',
    onLogs: (logs) => {
      logs.forEach((log) => {
        if (!log.args) return;
        const { remainingAmount } = log.args as unknown as {
          remainingCount: bigint;
          remainingAmount: bigint;
        };
        pushNote(
          '红包被领完',
          'warn',
          `剩余金额 ${formatEther(remainingAmount)} ETH`
        );
      });
    },
    enabled: hasContract && abiReady,
    poll: true,
    pollingInterval: 1000,
  });

  const disabledSend =
    !hasContract || !parsedAmount || packetCount <= 0 || sendingPacket || !abiReady;
  const disabledGrab = !hasContract || grabbing || !isConnected || !abiReady || !!alreadyGrabbed;

  useEffect(() => {
    if (!grabReceipt || !abiReady || !abi) return;
    try {
      const events = parseEventLogs({
        abi,
        logs: grabReceipt.logs ?? [],
        eventName: 'GrabResult',
      });
      const success = events.find((e) => (e.args as { status?: bigint }).status === 0n);
      if (success) {
        const amt = (success.args as { amount?: bigint }).amount ?? 0n;
        setGrabPopup({ amount: formatEther(amt) });
      }
    } catch (error) {
      // ignore parse errors
    }
  }, [grabReceipt, abiReady, abi]);

  return (
    <div className="page">
      <WalletBar />

      {abiLoading ? <div className="notice soft">正在加载合约 ABI...</div> : null}
      {abiError ? <div className="notice">ABI 加载失败：{abiError}</div> : null}

      {!hasContract ? (
        <div className="notice">
          请在环境变量中设置 VITE_RED_PACKET_ADDRESS，再运行 dev 服务器。
        </div>
      ) : null}

      <main className="grid">
        <section className="card">
          <div className="card-head">
            <div>
              <p className="eyebrow">发红包</p>
              <h2>创建一个新的链上红包</h2>
              <p className="muted">选择平均分配或拼手气，金额以 ETH 计价。</p>
            </div>
          </div>
          <div className="form">
            <label>
              <span>红包总金额 (ETH)</span>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={amountEth}
                onChange={(e) => setAmountEth(e.target.value)}
              />
            </label>
            <label>
              <span>红包数量</span>
              <input
                type="number"
                min="1"
                step="1"
                value={packetCount}
                onChange={(e) => setPacketCount(Number(e.target.value))}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={equalMode}
                onChange={(e) => setEqualMode(e.target.checked)}
              />
              <span>等额红包（关闭则为拼手气）</span>
            </label>
            <button disabled={disabledSend} onClick={handleSendPacket}>
              {sendingPacket ? '提交中...' : '发红包'}
            </button>
          </div>
          <div className="stats">
            <div>
              <p className="muted">合约地址</p>
              <code className="mono">{contractAddress || '-'}</code>
            </div>
            <div>
              <p className="muted">链上剩余金额</p>
              <strong>{onChainAmount ? `${formatEther(onChainAmount)} ETH` : '-'}</strong>
            </div>
            <div>
              <p className="muted">剩余份数</p>
              <strong>{onChainCount ? onChainCount.toString() : '-'}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <p className="eyebrow">抢红包</p>
              <h2>拼手气 / 等额领取</h2>
              <p className="muted">监听链上事件，及时提示抢完或重复领取。</p>
            </div>
          </div>
          <div className="cta">
            <button disabled={disabledGrab} onClick={handleGrabPacket}>
              {grabbing ? '抢红包中...' : alreadyGrabbed ? '已抢过' : '抢一个红包'}
            </button>
            {grabPopup ? (
              <div className="grab-popup">
                <div className="grab-amount">+ {grabPopup.amount} ETH</div>
                <div className="grab-label">恭喜抢到一个红包</div>
              </div>
            ) : null}
            {!isConnected ? (
              <p className="muted">请先连接钱包</p>
            ) : alreadyGrabbed ? (
              <p className="muted">你已经抢过了，事件会提示新的红包</p>
            ) : null}
          </div>
          <div className="notice soft">
            <p>事件提示</p>
            <ul className="notes">
              {notes.map((n) => (
                <li key={n.id} className={`note ${n.tone}`}>
                  <div className="note-title">{n.text}</div>
                  {n.detail ? <div className="note-detail">{n.detail}</div> : null}
                </li>
              ))}
              {notes.length === 0 ? <li className="muted">还没有事件，试着发一个红包吧。</li> : null}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
