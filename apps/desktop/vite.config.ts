import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(() => {
    const devHost = process.env.VITE_DEV_HOST || '127.0.0.1'
    const parsedPort = Number(process.env.VITE_DEV_PORT || '5173')
    const devPort = Number.isFinite(parsedPort) ? parsedPort : 5173

    return {
        server: {
            host: devHost,
            port: devPort,
            strictPort: true,
        },
        plugins: [
            react(),
            electron({
                main: {
                    // Shortcut of `build.lib.entry`.
                    entry: 'electron/main.ts',
                    vite: {
                        build: {
                            rollupOptions: {
                                external: ['@novel-editor/core', '@prisma/client', '.prisma/client'],
                            },
                        },
                        resolve: {
                            // Force Node.js resolution
                            conditions: ['node'],
                            mainFields: ['module', 'jsnext:main', 'jsnext'],
                        },
                    },
                },
                preload: {
                    // Shortcut of `build.rollupOptions.input`.
                    // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
                    input: path.join(__dirname, 'electron/preload.ts'),
                },
                // Polyfill the Electron and Node.js built-in modules for Renderer process.
                // See https://github.com/electron-vite/vite-plugin-electron-renderer
                renderer: {},
            }),
        ],
    }
})
