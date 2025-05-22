import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { existsSync, createReadStream, createWriteStream } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import archiver from 'archiver';
import { getAudioDurationInSeconds } from 'get-audio-duration';

const app = express();
const upload = multer({ dest: 'uploads/' });

ffmpeg.setFfmpegPath(ffmpegPath);

// Format seconds to HH:mm:ss
const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

app.post('/cut', upload.single('audio'), async (req, res) => {
  const start = req.body?.start || '00:00:00';
  const chunkDurationStr = req.body?.chunkDuration || '00:20:00';

  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required.' });
  }

  const inputPath = req.file.path;
  const tempFiles = [];

  try {
    const totalDuration = await getAudioDurationInSeconds(inputPath);
    const startSec = convertToSeconds(start);
    const chunkDuration = convertToSeconds(chunkDurationStr);

    let current = startSec;
    let index = 1;

    while (current < totalDuration) {
      const chunkName = `${inputPath}-part${index}.mp3`;
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .setStartTime(current)
          .duration(chunkDuration)
          .output(chunkName)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      tempFiles.push(chunkName);
      current += chunkDuration;
      index++;
    }

    // Create ZIP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=chunks.zip');

    const archive = archiver('zip');
    archive.pipe(res);

    for (const file of tempFiles) {
      archive.append(createReadStream(file), { name: path.basename(file) });
    }

    archive.finalize();
  } catch (err) {
    console.error('Chunking failed:', err);
    res.status(500).json({ error: 'Chunking failed', message: err.message });
  } finally {
    // Clean up after response ends
    res.on('finish', async () => {
      try {
        await fs.unlink(inputPath);
        for (const file of tempFiles) {
          if (existsSync(file)) await fs.unlink(file);
        }
        console.log('✅ Cleaned up all temp files');
      } catch (err) {
        console.warn('Cleanup warning:', err.message);
      }
    });
  }
});

function convertToSeconds(hms) {
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Chunking API running on port ${PORT}`);
});
