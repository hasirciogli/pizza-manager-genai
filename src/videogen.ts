import { DownloadableFileUnion, GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const prompt = `
  

  “Yaz yağmurunun yeni dindiği bir akşamüstü, ıslak kaldırımlar parlıyor. 
  Genç bir kadın (Ela) ile genç bir adam (Baran), Kadıköy sokaklarında yürürken tartışıyorlar. Sesleri yükseliyor, gözleri dolu. 
  Kadın ‘Seni siktirip gitmeye çalıştım ama beceremedim!’ diye bağırıyor.
  Adam bir an duraksıyor, sonra gözlerinin içine bakarak ‘Beni bu kadar sevip bu kadar küfredebilmen nasıl mümkün Ela?’ diyor. 
  Yağmurun ardından gökyüzü turuncu-mavi bir karışıma bürünmüş. Hafif sis var. 
  Baran Ela’nın yüzüne dokunuyor, sonra ikisi birden susuyor ve ani bir kararla, bastırılmış duygular patlarcasına öpüşüyorlar.
   Kamera yavaşça etraflarında dönüyor, fon müziği olarak Türkçe bir indie rock parçası çalıyor. 
   Sahne, aşkın sinir, kırgınlık ve arzuyla karıştığı bir noktada zirve yapıyor.

  
  `;

  let operation = await ai.models.generateVideos({
    model: "veo-3.0-generate-preview",
    prompt: prompt,
  });

  // Poll the operation status until the video is ready
  while (!operation.done) {
    console.log("Waiting for video generation to complete...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({
      operation: operation,
    });
  }

  // Download the generated video
  await ai.files.download({
    file: operation.response?.generatedVideos?.[0]
      ?.video as DownloadableFileUnion,
    downloadPath: "dialogue_example.mp4",
  });

  console.log(`Generated video saved to dialogue_example.mp4`);
}

main().catch((err) => {
  console.error("Video oluşturma sırasında hata:", err);
  process.exit(1);
});
