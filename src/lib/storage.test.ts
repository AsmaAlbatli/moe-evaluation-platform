import { describe, expect, it, beforeAll } from "vitest";
import { join } from "node:path";

/**
 * اختبارات حماية الملفات.
 * تُختبر الدوال العامة (التوقيع والتحقق وأسماء الملفات ومفاتيح التخزين)
 * دون الحاجة إلى تشغيل خادم.
 */

const ORIGINAL_SECRET = process.env.FILE_SIGNING_SECRET;
const TMP = join(import.meta.dirname, "..", "..", "..", ".tmp-storage-tests");

beforeAll(() => {
  process.env.FILE_SIGNING_SECRET = ORIGINAL_SECRET ?? "a-test-secret-that-is-long-enough-0123456789abcdef";
  process.env.STORAGE_LOCAL_DIR = TMP;
  process.env.FILE_URL_TTL_SECONDS = "60";
});

async function loadStorage() {
  return (await import("./storage")) as typeof import("./storage");
}

describe("بناء مفاتيح التخزين", () => {
  it("يولّد مفتاحًا مؤرّخًا وفريدًا لكل ملف", async () => {
    const { buildStorageKey } = await loadStorage();
    const a = buildStorageKey("تقرير.pdf", "external");
    const b = buildStorageKey("تقرير.pdf", "external");
    expect(a).not.toBe(b);
    expect(a.startsWith("external/")).toBe(true);
    expect(a.endsWith("تقرير.pdf")).toBe(true);
  });

  it("ينظّف اسم الملف ويمنع اجتياز المسار", async () => {
    const { safeFileName } = await loadStorage();
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("تقرير  school.pdf")).toBe("تقرير-school.pdf");
    expect(safeFileName("")).toBe("ملف");
  });

  it("يرفض المفاتيح الخطرة", async () => {
    const { assertSafeKey } = await loadStorage();
    expect(assertSafeKey("external/2026/01/file.pdf")).toBe("external/2026/01/file.pdf");
    expect(() => assertSafeKey("../secrets")).toThrow();
    expect(() => assertSafeKey("/etc/passwd")).toThrow();
    expect(() => assertSafeKey("a/../../b")).toThrow();
    expect(() => assertSafeKey("")).toThrow();
  });
});

describe("توقيع روابط الملفات", () => {
  it("يعيد الرمز إلى المفتاح نفسه", async () => {
    const { signFileToken, verifyFileToken } = await loadStorage();
    const key = "external/2026/03/abc-report.pdf";
    const token = signFileToken(key, 60);
    expect(verifyFileToken(token)?.key).toBe(key);
  });

  it("يرفض الرمز المعدّل", async () => {
    const { signFileToken, verifyFileToken } = await loadStorage();
    const token = signFileToken("external/2026/03/abc.pdf", 60);
    const [payload, sig] = token.split(".");
    const tampered = `${payload}x.${sig}`;
    expect(verifyFileToken(tampered)).toBeNull();
  });

  it("يرفض الرمز الموقّع بمفتاح مختلف", async () => {
    const { signFileToken } = await loadStorage();
    const token = signFileToken("external/2026/03/abc.pdf", 60);
    process.env.FILE_SIGNING_SECRET = "another-secret-that-is-long-enough-0123456789abcdefgh";
    const { verifyFileToken } = await loadStorage();
    expect(verifyFileToken(token)).toBeNull();
  });

  it("يرفض الرمز منتهي الصلاحية", async () => {
    const { signFileToken, verifyFileToken } = await loadStorage();
    process.env.FILE_SIGNING_SECRET = ORIGINAL_SECRET ?? "a-test-secret-that-is-long-enough-0123456789abcdef";
    const token = signFileToken("external/2026/03/abc.pdf", -10);
    expect(verifyFileToken(token)).toBeNull();
  });

  it("يرفض القيم الفارغة أو المشوّهة", async () => {
    const { verifyFileToken } = await loadStorage();
    expect(verifyFileToken("")).toBeNull();
    expect(verifyFileToken("abc")).toBeNull();
    expect(verifyFileToken("a.b.c")).toBeNull();
    expect(verifyFileToken("!!!.???")).toBeNull();
  });
});

describe("التخزين المحلي", () => {
  it("يحفظ الملف ويستعيده ثم يحذفه", async () => {
    const { putObject, getObject, deleteObject } = await loadStorage();
    const payload = Buffer.from("محتوى اختباري", "utf8");

    const stored = await putObject("tests/2026/sample.txt", payload, "text/plain");
    expect(stored.sizeBytes).toBe(payload.length);
    expect(stored.driver).toBe("local");

    const loaded = await getObject(stored.key);
    expect(loaded).not.toBeNull();
    expect(Buffer.from(loaded!.data).toString("utf8")).toBe("محتوى اختباري");
    expect(loaded!.mimeType).toBe("text/plain; charset=utf-8");

    await deleteObject(stored.key);
    expect(await getObject(stored.key)).toBeNull();
  });

  it("يعيد null لملف غير موجود بدل رمي خطأ", async () => {
    const { getObject } = await loadStorage();
    expect(await getObject("tests/does-not-exist.bin")).toBeNull();
  });

  it("يمنع الكتابة خارج مجلد التخزين", async () => {
    const { putObject } = await loadStorage();
    await expect(putObject("../escape.txt", Buffer.from("x"), "text/plain")).rejects.toThrow();
  });
});

describe("أنواع المحتوى", () => {
  it("يخمّن نوع المحتوى من الامتداد", async () => {
    const { mimeFromKey } = await loadStorage();
    expect(mimeFromKey("a/b.pdf")).toBe("application/pdf");
    expect(mimeFromKey("a/b.xlsx")).toContain("spreadsheetml");
    expect(mimeFromKey("a/b.png")).toBe("image/png");
    expect(mimeFromKey("a/b.unknown")).toBe("application/octet-stream");
  });
});