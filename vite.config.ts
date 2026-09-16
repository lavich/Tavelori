import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import {copyFileSync} from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

const base=process.env.BASE_PATH??'/';

const spaFallback=():Plugin=>({name:'spa-404',apply:'build',closeBundle(){copyFileSync('dist/index.html','dist/404.html')}});

/** HTTPS-туннель для Mini App бота разработки: разрешается только конкретный hostname из переменной окружения. */
const tunnelHost=process.env.TUNNEL_HOST;

export default defineConfig({
 base,
 server:{allowedHosts:tunnelHost?[tunnelHost]:undefined},
 resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
 plugins:[react(),tailwindcss(),spaFallback(),VitePWA({registerType:'prompt',includeAssets:['icon.svg'],manifest:{name:'Lexi — греческий к каждому занятию',short_name:'Lexi',description:'Ваш личный тренажёр греческих слов',lang:'ru',theme_color:'#0d5eaf',background_color:'#f7f7f5',display:'standalone',start_url:base,scope:base,icons:[{src:`${base}icon.svg`,sizes:'any',type:'image/svg+xml',purpose:'any'}]},workbox:{clientsClaim:true,skipWaiting:false,globPatterns:['**/*.{js,css,html,svg,png,webp,json}'],globIgnores:['**/content/**'],navigateFallbackDenylist:[/\/content\//],maximumFileSizeToCacheInBytes:5*1024*1024,cleanupOutdatedCaches:true}})],
 test:{include:['tests/**/*.test.ts'],environment:'node'},
});
