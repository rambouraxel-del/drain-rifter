// Turns dist-single/index.html (full document) into a page fragment for hosting as a
// claude.ai Artifact (the host wraps it in its own <html>/<head>/<body> skeleton).
import fs from 'node:fs';
const src = fs.readFileSync('dist-single/index.html', 'utf8');
const title = (src.match(/<title>([\s\S]*?)<\/title>/) || [, 'Drain Rifter'])[1];
const styles = [...src.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const scripts = [...src.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
const body = (src.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
const out = `<title>${title}</title>
<meta name="theme-color" content="#0d1416">
<style>:root{color-scheme:dark;--bg:#0d1416;--fg:#f2ead8}html,body{background:var(--bg);color:var(--fg);height:100%}</style>
${styles}
${body.trim()}
${scripts}
`;
fs.mkdirSync('dist-artifact', { recursive: true });
fs.writeFileSync('dist-artifact/drain-rifter.html', out);
console.log('dist-artifact/drain-rifter.html', (out.length / 1024).toFixed(0), 'kB');
