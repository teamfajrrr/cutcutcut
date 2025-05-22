import express from 'express';
import multer from 'multer';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const app = express();
const upload = multer({ dest: 'uploads/' });

ffmpeg.setFfmpegPath(ffmpegPath);

app.post('/cut', upload.single('audio'), async (req, res) => {
  const start = req.body?.start || '00:00:00';
  const duration = req.body?.duration || '00:00:30';

  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required.' });
  }

  const inputPath = req.file.path;
  const outputPath = `${inputPath}-cut.mp3`;

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(start)
        .duration(duration)
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    if (!existsSync(outputPath)) {
      throw new Error('Output file not created.');
    }

    const fileBuffer = await fs.readFile(outputPath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(fileBuffer);
  } catch (err) {
    console.error('[cut] Error:', err);
    res.status(502).json({ error: 'ffmpeg failed', message: err.message });
  } finally {
    try {
      await fs.unlink(inputPath);
      await fs.unlink(outputPath);
    } catch (cleanupErr) {
      console.warn('[cut] Cleanup failed:', cleanupErr.message);
    }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Native ffmpeg API running on port ${PORT}`);
});
