// Sound-only update: rebuild a project's soundtrack (its audio.mjs) and put it into the videos already in out/, without
// redrawing or re-compressing the picture (~15 s instead of ~5 min). Only for changes to the sound: if anything on screen
// changed, do a full render.   usage: node swap-audio.mjs "week 6/sand-grain" out/sand-grain_v4_1080x1920_60fps.mp4
// (render-v4.sh --audio-only calls this). The upload copy (<video>_tiktok.mp4) gets the same new sound.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [dirArg, videoArg] = process.argv.slice(2);
const dir = path.resolve(dirArg);
const video = path.resolve(dir, videoArg);
const upload = video.replace(/\.mp4$/, '_tiktok.mp4');
if (!fs.existsSync(video)) throw new Error(`no video to put the sound in: ${video} (do a full render first)`);

const ffmpeg = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};
// write next to the target, then replace it (ffmpeg can't write over the file it's reading)
const replace = (target, args) => {
  const tmp = target.replace(/\.mp4$/, '.swap-tmp.mp4');
  ffmpeg([...args, tmp]);
  fs.renameSync(tmp, target);
};

process.chdir(dir);
const { makeSoundtrack } = await import(pathToFileURL(path.join(dir, 'audio.mjs')).href);
const { STORY_START } = await import(pathToFileURL(path.join(dir, 'src', 'timeline.js')).href);
const wav = makeSoundtrack(path.join(dir, 'out', 'soundtrack.wav'));

// same sound settings as render.mjs; the picture is copied as it is
replace(video, ['-i', video, '-ss', String(STORY_START), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
  '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest', '-movflags', '+faststart']);
console.log('new sound in', video);
if (fs.existsSync(upload)) {
  replace(upload, ['-i', upload, '-i', video, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart']);
  console.log('new sound in', upload);
}
