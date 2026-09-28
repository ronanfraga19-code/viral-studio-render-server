const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const upload = multer({ dest: path.join(os.tmpdir(), 'viral-studio-uploads'), limits: { fileSize: 250 * 1024 * 1024 } });

app.get('/', (_req, res) => res.json({ ok: true, service: 'Viral Studio Render Server' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    p.stderr.on('data', d => err += d.toString());
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err || `${cmd} exited ${code}`)));
  });
}

app.post('/render', upload.array('clips', 20), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Envie pelo menos um arquivo no campo clips.' });
  const job = crypto.randomUUID();
  const dir = path.join(os.tmpdir(), `viral-${job}`);
  fs.mkdirSync(dir, { recursive: true });
  const list = path.join(dir, 'list.txt');
  const out = path.join(dir, 'viral-studio.mp4');
  try {
    const normalized = [];
    for (let i = 0; i < files.length; i++) {
      const target = path.join(dir, `clip-${i}.mp4`);
      await run('ffmpeg', ['-y','-i',files[i].path,'-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart',target]);
      normalized.push(target);
    }
    fs.writeFileSync(list, normalized.map(f => `file '${f.replaceAll("'", "'\\''")}'`).join('\n'));
    await run('ffmpeg', ['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',out]);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="viral-studio-${job}.mp4"`);
    const stream = fs.createReadStream(out);
    stream.pipe(res);
    stream.on('close', () => cleanup());
    function cleanup(){ try { files.forEach(f=>fs.unlinkSync(f.path)); fs.rmSync(dir,{recursive:true,force:true}); } catch {} }
  } catch (e) {
    try { files.forEach(f=>fs.unlinkSync(f.path)); fs.rmSync(dir,{recursive:true,force:true}); } catch {}
    res.status(500).json({ error: 'Falha ao renderizar', detail: String(e.message || e).slice(-3000) });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, '0.0.0.0', () => console.log(`Viral Studio Render Server on ${port}`));
