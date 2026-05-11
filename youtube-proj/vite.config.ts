import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 毫秒。批次／Whisper 可能跑很久；Vite dev 代理預設逾時偏短會出現 ERR / read ECONNRESET。
 * 可於啟動前設定環境變數 VITE_API_PROXY_MS（例：7200000 為 2 小時）。
 * 預設 12 小時，避免長影片／多路 Whisper 超過代理逾時而 502。
 */
const apiProxyMs = Number(process.env.VITE_API_PROXY_MS || 43_200_000)

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /**
     * 使用 127.0.0.1 可避免 Windows 下 localhost 走 IPv6 而後端僅監聽 IPv4 的情形。
     */
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        timeout: apiProxyMs,
        proxyTimeout: apiProxyMs,
        configure(proxy) {
          proxy.on('proxyReq', (_proxyReq, req) => {
            req.socket?.setTimeout(apiProxyMs)
          })
        },
      },
    },
  },
})
