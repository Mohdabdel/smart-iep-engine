/**
 * M-1: تطبيع النص العربي المستخرج من PDF.
 * بعض ملفات PDF تفكك ربطة «لا» فيخرج «األعمال» بدل «الأعمال» و«هللا» بدل «الله».
 * الإصلاحات هنا قائمة بيضاء محددة فقط — لا تغيير عام للنص.
 */
const FIXES: Array<[RegExp, string]> = [
  // ا + همزة + ل  ← ال + همزة  (األعمال → الأعمال، باإلضافة → بالإضافة، اآلن → الآن)
  [/ا([أإآ])ل/g, "ال$1"],
  // لفظ الجلالة المقلوب
  [/(^|[\s(«"'،.؛:])هللا(?=$|[\s)»"'،.؛:!؟])/g, "$1الله"],
];

export function normalizeArabicText(input: string): string {
  if (!input) return input;
  // NFKC يحوّل أشكال العرض العربية (ﻻ ﻷ ﻹ …) إلى حروفها الأساسية
  let s = input.normalize("NFKC");
  for (const [re, rep] of FIXES) s = s.replace(re, rep);
  return s;
}
