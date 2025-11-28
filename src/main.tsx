import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, getDefaultConfig, midnightTheme } from '@rainbow-me/rainbowkit';
import { http, webSocket } from 'viem';
import { sepolia } from 'wagmi/chains';
import App from './App';
import '@rainbow-me/rainbowkit/styles.css';
import './index.css';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo';
const queryClient = new QueryClient();

const config = getDefaultConfig({
  appName: 'On-chain Red Packet',
  projectId,
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(sepolia.rpcUrls.default.http[0]),
  },
  webSocketTransports: {
    [sepolia.id]: webSocket(sepolia.rpcUrls.default.webSocket?.[0] ?? sepolia.rpcUrls.default.http[0]),
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={midnightTheme({ accentColor: '#f53b57', borderRadius: 'medium' })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
