import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
 resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
 plugins:[react(),tailwindcss(),VitePWA({registerType:'prompt',includeAssets:['icon.svg'],manifest:{name:'Lexi — греческий к каждому занятию',short_name:'Lexi',description:'Ваш личный тренажёр греческих слов',lang:'ru',theme_color:'#2563eb',background_color:'#f7f7f5',display:'standalone',start_url:'/',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]},workbox:{clientsClaim:true,skipWaiting:false,globPatterns:['**/*.{js,css,html,svg,png,webp,mp3,json}'],maximumFileSizeToCacheInBytes:5*1024*1024,cleanupOutdatedCaches:true}})],
 test:{include:['tests/**/*.test.ts'],environment:'node'},
});
