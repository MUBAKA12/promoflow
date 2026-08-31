import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { readFile } from "fs/promises";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath.path);

export async function splitGridImage(sourceImagePath: string, workDir: string, rows: number, cols: number): Promise<string[]> {
  const tilePaths: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tilePath = path.join(workDir, `tile-${r}-${c}.jpg`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(sourceImagePath)
          .videoFilters(`crop=iw/${cols}:ih/${rows}:iw/${cols}*${c}:ih/${rows}*${r}`)
          .outputOptions(["-frames:v 1"])
          .output(tilePath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });
      tilePaths.push(tilePath);
    }
  }
  return tilePaths;
}

export async function tileFileToBuffer(tilePath: string): Promise<Buffer> {
  return readFile(tilePath);
}
