import { DownloadableFileUnion, GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("[HATA] GOOGLE_API_KEY environment variable tanımlı değil!");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
  Yağmurdan sonra Kadıköy sokaklarında yürüyen iki genç, duygusal bir tartışma yaşar. Kadın, duygularını açıkça ifade eder. Adam ise ona sevgiyle yaklaşır. Sonunda ikisi de duygularına yenik düşüp öpüşürler. Kamera etraflarında döner, fonda Türkçe bir indie rock parçası çalar.
  `;

  let operation;
  try {
    operation = await ai.models.generateVideos({
      model: "veo-3.0-generate-preview",
      prompt: prompt,
    });
  } catch (err) {
    console.error("[HATA] Video üretimi başlatılamadı:", err);
    process.exit(1);
  }

  // Poll the operation status until the video is ready
  let pollCount = 0;
  while (operation && !operation.done) {
    pollCount++;
    if (pollCount > 30) {
      console.error("[HATA] Video üretimi çok uzun sürdü, işlem iptal edildi.");
      process.exit(1);
    }
    console.log("Waiting for video generation to complete...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
    try {
      operation = await ai.operations.getVideosOperation({
        operation: operation,
      });
    } catch (err) {
      console.error("[HATA] Video üretim durumu alınamadı:", err);
      process.exit(1);
    }
  }

  if (!operation) {
    console.error("[HATA] Video üretim işlemi başlatılamadı (operation null)");
    process.exit(1);
  }

  const videoFile = operation.response?.generatedVideos?.[0]?.video;
  if (!videoFile) {
    console.error("[HATA] Video dosyası bulunamadı veya API yanıtı eksik:", JSON.stringify(operation.response, null, 2));
    process.exit(1);
  }

  try {
    await ai.files.download({
      file: videoFile as DownloadableFileUnion,
      downloadPath: "dialogue_example.mp4",
    });
    console.log(`Generated video saved to dialogue_example.mp4`);
  } catch (err) {
    console.error("[HATA] Video indirilirken hata oluştu:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[GENEL HATA] Video oluşturma sırasında beklenmeyen bir hata:", err);
  process.exit(1);
});
