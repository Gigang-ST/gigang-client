import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

import { timeStringToSeconds, secondsToTime } from "@/lib/dayjs";

/** 기록증에서 추출하는 필드 (없는 값은 null) */
export const extractedRecordSchema = z.object({
  competitionName: z.string().nullable(),
  raceDate: z.string().nullable(),
  totalTime: z.string().nullable(),
  swimTime: z.string().nullable(),
  bikeTime: z.string().nullable(),
  runTime: z.string().nullable(),
});

export type ExtractedRecord = z.infer<typeof extractedRecordSchema>;

/** Gemini 구조화 출력 스키마 */
const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    competitionName: { type: Type.STRING, nullable: true },
    raceDate: { type: Type.STRING, nullable: true },
    totalTime: { type: Type.STRING, nullable: true },
    swimTime: { type: Type.STRING, nullable: true },
    bikeTime: { type: Type.STRING, nullable: true },
    runTime: { type: Type.STRING, nullable: true },
  },
  required: [
    "competitionName",
    "raceDate",
    "totalTime",
    "swimTime",
    "bikeTime",
    "runTime",
  ],
};

const PROMPT = `이 이미지는 러닝/마라톤/철인3종 대회의 기록증(완주증)입니다.
다음 정보를 추출하세요. 이미지에 명시되지 않은 값은 반드시 null로 두세요. 추측하지 마세요.
- competitionName: 대회 이름 (예: "SEOUL 2025 MARATHON")
- raceDate: 대회 날짜를 YYYY-MM-DD 형식으로
- totalTime: 완주 총 기록을 HH:MM:SS 형식으로
- swimTime: (철인3종만) 수영 기록 HH:MM:SS, 없으면 null
- bikeTime: (철인3종만) 자전거 기록 HH:MM:SS, 없으면 null
- runTime: (철인3종만) 러닝 기록 HH:MM:SS, 없으면 null`;

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/** Gemini가 준 시간 문자열을 파싱 가능한 정규 형식으로. 실패 시 null */
export function normalizeOcrTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const seconds = timeStringToSeconds(raw);
  if (seconds == null || seconds <= 0) return null;
  return secondsToTime(seconds);
}

/** 날짜 문자열이 YYYY-MM-DD 형식이 아니면 null */
export function normalizeOcrDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return YYYY_MM_DD.test(raw.trim()) ? raw.trim() : null;
}

/** 추출 원본을 정규화 + 검증 */
export function normalizeExtractedRecord(parsed: ExtractedRecord): ExtractedRecord {
  return {
    competitionName: parsed.competitionName?.trim() || null,
    raceDate: normalizeOcrDate(parsed.raceDate),
    totalTime: normalizeOcrTime(parsed.totalTime),
    swimTime: normalizeOcrTime(parsed.swimTime),
    bikeTime: normalizeOcrTime(parsed.bikeTime),
    runTime: normalizeOcrTime(parsed.runTime),
  };
}

/**
 * 이미지 데이터(base64)에서 기록 정보를 추출하는 코어.
 * 인증·FormData 처리는 호출하는 서버 액션이 담당한다.
 * 503(모델 과부하) 대비 최대 3회 재시도.
 */
export async function extractRaceRecordFromImageData(params: {
  apiKey: string;
  base64: string;
  mimeType: string;
}): Promise<ExtractedRecord> {
  const { apiKey, base64, mimeType } = params;
  const ai = new GoogleGenAI({ apiKey });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { inlineData: { mimeType, data: base64 } },
          { text: PROMPT },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: geminiResponseSchema,
          temperature: 0,
        },
      });
      const text = res.text;
      if (!text) throw new Error("empty response");
      const parsed = extractedRecordSchema.parse(JSON.parse(text));
      return normalizeExtractedRecord(parsed);
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status === 503 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
